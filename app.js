const DEFAULT_SETTINGS = {
  adminPin: "0000",
  scoringMode: "circle",
  judgeCount: 3,
  topCount: 16,
  judges: {
    A: { name: "A JUDGE", pin: "1111" },
    B: { name: "B JUDGE", pin: "2222" },
    C: { name: "C JUDGE", pin: "3333" }
  }
};

const state = {
  settings: JSON.parse(JSON.stringify(DEFAULT_SETTINGS)),
  selectedJudge: "A",
  role: null,
  participants: [],
  scores: [],
  logs: [],
  queue: [],
  queueIndex: 0,
  scoreInput: "",
  rankView: "judge"
};

let supabaseClient = null;

/* offline sync v6 */
function pendingKey(){
  return `DPP_PENDING_${DPP_CONFIG.eventId}_${currentMode()}_${state.selectedJudge || "UNKNOWN"}`;
}
function getPendingScores(){
  try{
    return JSON.parse(localStorage.getItem(pendingKey()) || "[]");
  }catch(e){
    return [];
  }
}
function setPendingScores(rows){
  localStorage.setItem(pendingKey(), JSON.stringify(rows || []));
  updateOfflineStatus();
}
function upsertLocalPending(row){
  const rows = getPendingScores();
  const key = `${row.score_mode}|${row.judge_circle}|${row.participant_order}`;
  const idx = rows.findIndex(r => `${r.score_mode}|${r.judge_circle}|${r.participant_order}` === key);
  if(idx >= 0) rows[idx] = row;
  else rows.push(row);
  setPendingScores(rows);
}
function removePendingRows(uploadedRows){
  const uploaded = new Set(uploadedRows.map(r => `${r.score_mode}|${r.judge_circle}|${r.participant_order}`));
  const rows = getPendingScores().filter(r => !uploaded.has(`${r.score_mode}|${r.judge_circle}|${r.participant_order}`));
  setPendingScores(rows);
}
function updateOfflineStatus(){
  const pending = getPendingScores().length;
  const online = navigator.onLine;
  const txt = online ? `ONLINE · 업로드 대기 ${pending}건` : `OFFLINE · 기기 저장 중 · 업로드 대기 ${pending}건`;
  const node = el("offlineStatus");
  if(node){
    node.textContent = txt;
    node.classList.toggle("bad", !online || pending > 0);
  }
  const admin = el("localPendingAdmin");
  if(admin) admin.textContent = `이 기기의 대기 점수: ${pending}건`;
}
window.addEventListener("online", updateOfflineStatus);
window.addEventListener("offline", updateOfflineStatus);


function el(id){ return document.getElementById(id); }
function escapeHtml(str){
  return String(str ?? "").replace(/[&<>"]/g, ch => ({
    "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;"
  }[ch]));
}
function showScreen(id){
  document.querySelectorAll(".screen").forEach(s => s.classList.remove("active"));
  el(id).classList.add("active");
  if(id === "judgeLogin") renderJudgeSelect();
  if(id === "admin") renderAdmin();
  if(id === "score") renderScore();
}
function setStatus(text, ok=true){
  const pill = el("statusPill");
  if(pill){ pill.textContent = text; pill.classList.toggle("bad", !ok); }
  const admin = el("adminStatus");
  if(admin) admin.textContent = text;
}
function getCircles(){
  return Array.from({ length: Number(state.settings.judgeCount) || 3 }, (_, i) =>
    String.fromCharCode(65 + i)
  );
}
function currentMode(){ return state.settings.scoringMode || "circle"; }
function circleOf(row){ return row.participant_circle || ""; }

function normalizeSettings(remote){
  const base = JSON.parse(JSON.stringify(DEFAULT_SETTINGS));
  if(!remote) return base;
  base.scoringMode = remote.scoring_mode || base.scoringMode;
  base.judgeCount = Number(remote.judge_count || base.judgeCount);
  base.topCount = Number(remote.top_count || base.topCount);
  if(remote.judges && typeof remote.judges === "object"){
    Object.keys(remote.judges).forEach(circle => {
      base.judges[circle] = {
        name: String(remote.judges[circle]?.name || `${circle} JUDGE`),
        pin: String(remote.judges[circle]?.pin || DEFAULT_SETTINGS.judges[circle]?.pin || "1111")
      };
    });
  }
  return base;
}

/* DB */
async function init(){
  supabaseClient = window.supabase.createClient(DPP_CONFIG.supabaseUrl, DPP_CONFIG.supabaseKey);
  await loadSettings();
  await refreshAll();
  updateOfflineStatus();
  renderJudgeSelect();

  supabaseClient
    .channel("dpp-v5-1-live")
    .on("postgres_changes", { event:"*", schema:"public", table:"dpp_settings" }, async () => {
      await loadSettings();
      renderJudgeSelect();
      if(state.role === "admin") renderAdmin();
    })
    .on("postgres_changes", { event:"*", schema:"public", table:"dpp_participants" }, refreshAll)
    .on("postgres_changes", { event:"*", schema:"public", table:"dpp_scores" }, refreshScoresOnly)
    .on("postgres_changes", { event:"*", schema:"public", table:"dpp_logs" }, refreshScoresOnly)
    .subscribe();

  if("serviceWorker" in navigator){
    navigator.serviceWorker.register("./sw.js").catch(()=>{});
  }
}

async function loadSettings(){
  try{
    const { data, error } = await supabaseClient
      .from("dpp_settings").select("*").eq("event_id", DPP_CONFIG.eventId).maybeSingle();
    if(error) throw error;
    if(!data){
      await saveSettings(DEFAULT_SETTINGS);
      state.settings = JSON.parse(JSON.stringify(DEFAULT_SETTINGS));
    }else{
      state.settings = normalizeSettings(data);
    }
    setStatus("ONLINE", true);
  }catch(err){
    console.error(err);
    state.settings = JSON.parse(JSON.stringify(DEFAULT_SETTINGS));
    setStatus("DB ERROR: " + err.message, false);
  }
}

async function saveSettings(settings){
  const { error } = await supabaseClient.from("dpp_settings").upsert({
    event_id: DPP_CONFIG.eventId,
    scoring_mode: settings.scoringMode,
    judge_count: Number(settings.judgeCount || 3),
    top_count: Number(settings.topCount || 16),
    judges: settings.judges,
    updated_at: new Date().toISOString()
  }, { onConflict:"event_id" });
  if(error) throw error;
}

async function fetchParticipants(){
  const { data, error } = await supabaseClient
    .from("dpp_participants").select("*").eq("event_id", DPP_CONFIG.eventId).order("participant_order");
  if(error){ console.error(error); return []; }
  return data || [];
}
async function fetchScores(){
  const { data, error } = await supabaseClient
    .from("dpp_scores").select("*").eq("event_id", DPP_CONFIG.eventId).eq("score_mode", currentMode()).order("updated_at", { ascending:false });
  if(error){ console.error(error); return []; }
  return data || [];
}
async function fetchLogs(){
  const { data, error } = await supabaseClient
    .from("dpp_logs").select("*").eq("event_id", DPP_CONFIG.eventId).eq("score_mode", currentMode()).order("created_at", { ascending:false }).limit(80);
  if(error){ console.error(error); return []; }
  return data || [];
}
async function refreshAll(){
  state.participants = await fetchParticipants();
  state.scores = await fetchScores();
  state.logs = await fetchLogs();
  if(state.role === "admin") renderAdmin();
  if(state.role === "judge") await loadJudgeQueue(false);
}
async function refreshScoresOnly(){
  state.scores = await fetchScores();
  state.logs = await fetchLogs();
  if(state.role === "admin") renderAdmin();
}

/* login */
function renderJudgeSelect(){
  const select = el("judgeSelect");
  if(!select) return;
  const keep = select.value || state.selectedJudge || "A";
  select.innerHTML = getCircles().map(c => `<option value="${c}">${c} JUDGE</option>`).join("");
  select.value = [...select.options].some(o => o.value === keep) ? keep : "A";
  select.onchange = () => { state.selectedJudge = select.value; };
}
function adminLogin(){
  const pin = el("adminPinInput").value.trim();
  if(pin !== state.settings.adminPin){
    el("adminLoginMsg").textContent = "관리자 PIN이 틀렸어.";
    return;
  }
  state.role = "admin";
  el("adminLoginMsg").textContent = "";
  showScreen("admin");
}
async function judgeLogin(){
  await loadSettings();
  renderJudgeSelect();

  const select = el("judgeSelect");
  const circle = select ? select.value : "A";
  const pin = el("judgePinInput").value.trim();
  const judge = state.settings.judges[circle];

  if(!judge){
    el("judgeLoginMsg").textContent = `${circle} JUDGE 설정이 없어.`;
    return;
  }
  const expected = String(judge.pin || "").trim();
  if(pin !== expected){
    el("judgeLoginMsg").textContent = `${circle} JUDGE PIN이 틀렸어. 현재 선택: ${circle}`;
    return;
  }

  state.role = "judge";
  state.selectedJudge = circle;
  state.queueIndex = 0;
  state.scoreInput = "";
  el("judgeLoginMsg").textContent = "";
  el("judgePinInput").value = "";
  await loadJudgeQueue();
  showScreen("score");
}
function logout(){
  state.role = null;
  state.queue = [];
  state.queueIndex = 0;
  state.scoreInput = "";
  showScreen("home");
}

/* admin */
function renderAdmin(){
  el("adminStatus").textContent = `ONLINE / MODE: ${currentMode()}`;
  el("modeCircleBtn").classList.toggle("active", currentMode() === "circle");
  el("modeAllBtn").classList.toggle("active", currentMode() === "all");
  renderJudgeSettings();
  renderProgress();
  renderRanking();
  renderParticipantPreview();
  updateOfflineStatus();
  renderResultBoard();
  renderBracket();
}

function renderJudgeSettings(){
  const box = el("judgeSettings");
  if(!box) return;
  box.innerHTML = getCircles().map(c => {
    const j = state.settings.judges[c] || { name:`${c} JUDGE`, pin:"" };
    return `
      <div class="judge-card">
        <h4>${c} JUDGE</h4>
        <label>NAME</label>
        <input id="name_${c}" value="${escapeHtml(j.name)}" />
        <label>PIN</label>
        <input id="pin_${c}" value="${escapeHtml(j.pin)}" inputmode="numeric" />
      </div>
    `;
  }).join("");
}
function renderParticipantPreview(){
  const body = el("participantPreview");
  if(!body) return;
  body.innerHTML = state.participants.length
    ? state.participants.map(p => `<tr><td>${escapeHtml(p.participant_order)}</td><td>${escapeHtml(p.participant_circle)}</td><td>${escapeHtml(p.participant_name||"")}</td><td>${escapeHtml(p.battle_name||"")}</td></tr>`).join("")
    : `<tr><td colspan="4" class="empty">참가자 없음</td></tr>`;
}
async function setMode(mode){
  state.settings.scoringMode = mode;
  await saveSettings(state.settings);
  state.participants = await fetchParticipants();
  await createEmptyScores();
  await loadSettings();
  await refreshAll();
}
async function saveAdminSettings(showAlert=true){
  getCircles().forEach(c => {
    state.settings.judges[c] = {
      name: el(`name_${c}`).value.trim() || `${c} JUDGE`,
      pin: el(`pin_${c}`).value.trim()
    };
  });
  try{
    await saveSettings(state.settings);
    await createEmptyScores();
    await loadSettings();
    await refreshAll();
    if(showAlert) alert("저장 완료");
  }catch(err){
    alert("저장 오류: " + err.message);
  }
}
async function resetPins(){
  state.settings.judges.A = { name: state.settings.judges.A?.name || "A JUDGE", pin: "1111" };
  state.settings.judges.B = { name: state.settings.judges.B?.name || "B JUDGE", pin: "2222" };
  state.settings.judges.C = { name: state.settings.judges.C?.name || "C JUDGE", pin: "3333" };
  await saveSettings(state.settings);
  await loadSettings();
  renderAdmin();
  alert("PIN 초기화 완료: A=1111 / B=2222 / C=3333");
}


function buildScoreRowsFromParticipants(participants, mode=currentMode()){
  const rows = [];
  getCircles().forEach(circle => {
    const judge = state.settings.judges[circle] || { name:`${circle} JUDGE` };
    participants.forEach(p => {
      const pCircle = String(p.participant_circle || "").trim();
      if(mode === "circle" && pCircle !== circle) return;
      rows.push({
        event_id: DPP_CONFIG.eventId,
        score_mode: mode,
        judge_circle: circle,
        judge_name: judge.name || `${circle} JUDGE`,
        participant_order: p.participant_order,
        participant_circle: pCircle,
        participant_name: p.participant_name,
        battle_name: p.battle_name,
        score: null,
        updated_at: new Date().toISOString()
      });
    });
  });
  return rows;
}


function mergePendingScoresIntoQueue(rows){
  const pending = getPendingScores();
  if(!pending.length) return rows;
  const map = new Map(rows.map(r => [`${r.score_mode}|${r.judge_circle}|${r.participant_order}`, r]));
  pending.forEach(p => {
    const key = `${p.score_mode}|${p.judge_circle}|${p.participant_order}`;
    if(map.has(key)) map.set(key, {...map.get(key), ...p});
    else map.set(key, p);
  });
  return Array.from(map.values()).sort((a,b)=>String(a.participant_order).localeCompare(String(b.participant_order), "ko"));
}

function buildQueueDirectlyFromParticipants(circle){
  const mode = currentMode();
  const participants = state.participants.filter(p => mode === "all" || String(p.participant_circle || "").trim() === circle);
  return participants.map(p => {
    const existing = state.scores.find(s =>
      String(s.score_mode || mode) === mode &&
      String(s.judge_circle || "").trim() === circle &&
      String(s.participant_order || "").trim() === String(p.participant_order || "").trim()
    );
    const judge = state.settings.judges[circle] || { name:`${circle} JUDGE` };
    return existing || {
      event_id: DPP_CONFIG.eventId,
      score_mode: mode,
      judge_circle: circle,
      judge_name: judge.name || `${circle} JUDGE`,
      participant_order: p.participant_order,
      participant_circle: p.participant_circle,
      participant_name: p.participant_name,
      battle_name: p.battle_name,
      score: null,
      updated_at: new Date().toISOString()
    };
  }).sort((a,b)=>String(a.participant_order).localeCompare(String(b.participant_order), "ko"));
}


async function prepareJudging(){
  try{
    await saveAdminSettings(false);
    state.participants = await fetchParticipants();
    await createEmptyScores();
    await refreshAll();
    alert(`심사 준비 완료 / MODE: ${currentMode()} / 참가자: ${state.participants.length}명`);
  }catch(err){
    alert("심사 준비 오류: " + err.message);
  }
}

/* participant upload */
function clean(s){ return String(s ?? "").replace(/\uFEFF/g,"").trim(); }
function isOrderToken(s){ return /^[A-Z]-(?:나-)?\d+$/i.test(clean(s).replace(/\s+/g,"")); }
function fixOrder(s){ return clean(s).replace(/\s+/g,"").replace(/^([a-z])-/, (_,a)=>a.toUpperCase()+"-"); }
function circleFromOrder(order){ const m = clean(order).match(/^([A-Z])/i); return m ? m[1].toUpperCase() : ""; }
function isPhoneLike(s){ s=clean(s); return /^(\+?\d[\d\s\-–]{6,}|\d{4,})$/.test(s); }
function isContactLike(s){ s=clean(s); return isPhoneLike(s) || s.includes("@") || s.includes(".com"); }
function decodeCsvBuffer(buffer){
  const u8 = new Uint8Array(buffer);
  if(u8[0]===0xEF && u8[1]===0xBB && u8[2]===0xBF) return new TextDecoder("utf-8").decode(u8);
  const utf8 = new TextDecoder("utf-8", { fatal:false }).decode(u8);
  return (utf8.match(/\uFFFD/g)||[]).length > 0 ? new TextDecoder("euc-kr").decode(u8) : utf8;
}
function parseParticipants(rows){
  const out = [];
  rows.forEach(row => {
    row = Array.from(row || []).map(clean);
    row.forEach((cell, idx) => {
      if(!isOrderToken(cell)) return;
      const order = fixOrder(cell);
      const circle = circleFromOrder(order);
      let name = "", battle = "";

      if(idx >= 12){ name = row[8] || ""; battle = row[9] || ""; }
      else if(idx >= 5){ name = row[1] || ""; battle = row[2] || ""; }
      else{
        const prev = row.slice(Math.max(0, idx-5), idx).filter(v => v && !isContactLike(v) && !isOrderToken(v));
        name = prev[0] || "";
        battle = prev[1] || "";
      }
      if(!name && !battle) return;
      out.push({
        event_id: DPP_CONFIG.eventId,
        participant_order: order,
        participant_circle: circle,
        participant_name: name,
        battle_name: battle,
        updated_at: new Date().toISOString()
      });
    });
  });
  const seen = new Set();
  return out.filter(p => {
    if(seen.has(p.participant_order)) return false;
    seen.add(p.participant_order);
    return true;
  }).sort((a,b)=>a.participant_order.localeCompare(b.participant_order, "ko"));
}
async function handleFile(e){
  const file = e.target.files[0];
  if(!file) return;
  el("fileName").textContent = file.name;

  const reader = new FileReader();
  reader.onload = async ev => {
    try{
      const buffer = ev.target.result;
      let rows = [];
      if(file.name.toLowerCase().endsWith(".csv")){
        const wb = XLSX.read(decodeCsvBuffer(buffer), { type:"string" });
        rows = XLSX.utils.sheet_to_json(wb.Sheets[wb.SheetNames[0]], { header:1, defval:"", raw:false });
      }else{
        const wb = XLSX.read(buffer, { type:"array" });
        rows = XLSX.utils.sheet_to_json(wb.Sheets[wb.SheetNames[0]], { header:1, defval:"", raw:false });
      }

      const participants = parseParticipants(rows);
      if(!participants.length){ alert("참가자를 읽지 못했어."); return; }

      const { error } = await supabaseClient.from("dpp_participants").upsert(participants, { onConflict:"event_id,participant_order" });
      if(error) throw error;

      state.participants = participants;
      await createEmptyScores();
      await refreshAll();
      alert("참가자 업로드 완료");
    }catch(err){
      alert("업로드 오류: " + err.message);
    }
  };
  reader.readAsArrayBuffer(file);
}
async function createEmptyScores(){
  const participants = state.participants.length ? state.participants : await fetchParticipants();
  state.participants = participants;
  if(!participants.length){
    alert("참가자 명단이 없어. 먼저 참가자 파일을 업로드해줘.");
    return;
  }

  const mode = currentMode();
  const rows = buildScoreRowsFromParticipants(participants, mode);

  if(!rows.length){
    alert("생성할 점수표가 없어. 참가자 ORDER의 Circle(A-1/B-1 등)과 Judge Count를 확인해줘.");
    return;
  }

  const { error } = await supabaseClient
    .from("dpp_scores")
    .upsert(rows, { onConflict:"event_id,score_mode,judge_circle,participant_order" });

  if(error){
    console.error("createEmptyScores error:", error);
    alert("점수표 생성 오류: " + error.message);
    return;
  }
}

/* judge scoring */
async function loadJudgeQueue(showAlert=false){
  await loadSettings();
  state.participants = await fetchParticipants();
  state.scores = await fetchScores();

  const circle = state.selectedJudge;

  if(!state.participants.length){
    state.queue = [];
    if(showAlert) alert("참가자 명단이 없어. 관리자 모드에서 참가자 업로드 후 '심사 준비' 버튼을 눌러줘.");
    renderScore();
    return;
  }

  // 점수 테이블이 없어도 참가자 테이블에서 바로 Queue 생성
  let rows = buildQueueDirectlyFromParticipants(circle);

  // DB에 현재 모드 점수 row가 부족하면 자동 생성 후 다시 읽기
  const expected = currentMode() === "all"
    ? state.participants.length
    : state.participants.filter(p => String(p.participant_circle || "").trim() === circle).length;

  if(rows.length < expected || state.scores.filter(s => String(s.judge_circle || "").trim() === circle).length < expected){
    await createEmptyScores();
    state.scores = await fetchScores();
    rows = buildQueueDirectlyFromParticipants(circle);
  }

  state.queue = mergePendingScoresIntoQueue(rows);
  if(state.queueIndex >= state.queue.length) state.queueIndex = 0;

  if(showAlert) alert(`동기화 완료 / ${circle} JUDGE / ${currentMode()} / ${state.queue.length}명`);
  renderScore();
}

function renderScore(){
  if(state.role !== "judge") return;
  const circle = state.selectedJudge;
  const judge = state.settings.judges[circle] || { name:`${circle} JUDGE` };
  const item = state.queue[state.queueIndex];

  el("scoreHeader").textContent = `${circle} JUDGE`;
  el("scoreSub").textContent = `${judge.name} · ${currentMode() === "all" ? "Mode 2 / All Judge" : "Mode 1 / Circle Judge"}`;

  const progress = el("scoreProgress");
  progress.style.width = `${state.queue.length ? ((state.queueIndex+1)/state.queue.length*100) : 0}%`;

  if(!item){
    el("orderBadge").textContent = "ORDER -";
    el("circleBadge").textContent = "CIRCLE -";
    el("battleName").textContent = "NO DANCER";
    el("realName").textContent = `데이터 없음 · MODE ${currentMode()} · ${state.selectedJudge} JUDGE · 참가자 ${state.participants.length}명 · 점수row ${state.scores.length}개 · 관리자에서 심사 준비 버튼 확인`;
    el("scoreDisplay").textContent = "0";
    setQueueDebug("NO DANCER");
    return;
  }

  el("orderBadge").textContent = "ORDER " + item.participant_order;
  el("circleBadge").textContent = "CIRCLE " + item.participant_circle;
  el("battleName").textContent = item.battle_name || item.participant_name || "NO NAME";
  el("realName").textContent = "REAL NAME · " + (item.participant_name || "-");
  el("scoreDisplay").textContent = state.scoreInput || (item.score ?? "0");
  setQueueDebug();
  updateOfflineStatus();
}
function tap(v){
  if(v === "." && state.scoreInput.includes(".")) return;
  if(state.scoreInput.length >= 5) return;
  if(state.scoreInput === "0" && v !== ".") state.scoreInput = "";
  state.scoreInput += v;
  el("scoreDisplay").textContent = state.scoreInput;
}
function backspace(){
  state.scoreInput = state.scoreInput.slice(0,-1);
  el("scoreDisplay").textContent = state.scoreInput || "0";
}
function clearScore(){
  state.scoreInput = "";
  el("scoreDisplay").textContent = "0";
}

async function uploadOneScore(row){
  const { error } = await supabaseClient
    .from("dpp_scores")
    .upsert(row, { onConflict:"event_id,score_mode,judge_circle,participant_order" });
  if(error) throw error;

  await supabaseClient.from("dpp_logs").insert({
    event_id: row.event_id,
    score_mode: row.score_mode,
    judge_circle: row.judge_circle,
    judge_name: row.judge_name,
    participant_order: row.participant_order,
    participant_circle: row.participant_circle,
    participant_name: row.participant_name,
    battle_name: row.battle_name,
    score: row.score
  });
}

async function syncPendingScores(){
  const pending = getPendingScores();
  if(!pending.length){
    alert("업로드 대기 점수가 없어.");
    updateOfflineStatus();
    return;
  }
  if(!navigator.onLine){
    alert(`현재 오프라인이야. 인터넷 연결 후 다시 눌러줘. 대기 ${pending.length}건`);
    updateOfflineStatus();
    return;
  }

  let success = [];
  let failed = 0;

  for(const row of pending){
    try{
      await uploadOneScore(row);
      success.push(row);
      removePendingRows(success);
      updateOfflineStatus();
    }catch(err){
      console.error("sync failed", err);
      failed++;
    }
  }

  await refreshScoresOnly();
  await loadJudgeQueue(false);
  updateOfflineStatus();

  if(failed){
    alert(`일부 업로드 실패: 성공 ${success.length}건 / 실패 ${failed}건`);
  }else{
    alert(`SYNC 완료: ${success.length}건 업로드`);
  }
}

async function saveScoreAndNext(){
  const item = state.queue[state.queueIndex];
  if(!item){ alert("참가자가 없어."); return; }

  const score = Number(state.scoreInput || el("scoreDisplay").textContent);
  if(Number.isNaN(score)){ alert("점수를 입력해줘."); return; }

  const circle = state.selectedJudge;
  const judge = state.settings.judges[circle] || { name:`${circle} JUDGE` };

  const row = {
    ...item,
    event_id: DPP_CONFIG.eventId,
    score_mode: currentMode(),
    judge_circle: circle,
    judge_name: judge.name || `${circle} JUDGE`,
    participant_order: item.participant_order,
    participant_circle: item.participant_circle,
    participant_name: item.participant_name,
    battle_name: item.battle_name,
    score,
    updated_at: new Date().toISOString()
  };

  // 1) 항상 기기 내부에 먼저 저장: 와이파이 끊겨도 점수 보존
  upsertLocalPending(row);

  // 2) 현재 화면 queue에도 바로 반영
  state.queue[state.queueIndex] = row;

  // 3) 온라인이면 즉시 업로드 시도. 실패해도 local pending에 남음
  if(navigator.onLine){
    try{
      await uploadOneScore(row);
      removePendingRows([row]);
    }catch(err){
      console.warn("online upload failed, kept locally", err);
    }
  }

  state.scoreInput = "";
  nextDancer();
}
function nextDancer(){
  if(state.queueIndex < state.queue.length - 1){
    state.queueIndex++;
    state.scoreInput = "";
    renderScore();
  }else{
    alert("이 Judge의 채점이 끝났어.");
    renderScore();
  }
}
function prevDancer(){
  if(state.queueIndex > 0){
    state.queueIndex--;
    state.scoreInput = "";
    renderScore();
  }
}

/* ranking */
function getScoreRows(){ return state.scores.filter(s => s.score_mode === currentMode()); }
function judgeRank(circle){
  return getScoreRows().filter(s => s.judge_circle === circle && s.score !== null && s.score !== undefined)
    .sort((a,b)=>Number(b.score)-Number(a.score) || a.participant_order.localeCompare(b.participant_order, "ko"))
    .map((x,i)=>({...x, rank:i+1}));
}
function totalRank(){
  const map = {};
  getScoreRows().forEach(s => {
    if(!map[s.participant_order]){
      map[s.participant_order] = {
        participant_order:s.participant_order,
        participant_circle:s.participant_circle,
        participant_name:s.participant_name,
        battle_name:s.battle_name,
        total:0,
        count:0
      };
    }
    if(s.score !== null && s.score !== undefined){
      map[s.participant_order].total += Number(s.score) || 0;
      map[s.participant_order].count++;
    }
  });
  return Object.values(map)
    .filter(x=>x.count>0)
    .map(x=>({...x, avg:x.total/x.count}))
    .sort((a,b)=>b.total-a.total || a.participant_order.localeCompare(b.participant_order, "ko"))
    .map((x,i)=>({...x, rank:i+1}));
}
function setRankView(view){
  state.rankView = view;
  ["Judge","Total","Log"].forEach(k => {
    const btn = el(`rank${k}Btn`);
    if(btn) btn.classList.toggle("active", view === k.toLowerCase());
  });
  renderRanking();
}
function renderRanking(){
  const box = el("rankingList");
  const info = el("rankInfo");
  if(!box) return;

  if(state.rankView === "log"){
    info.textContent = "최근 입력 로그";
    box.innerHTML = state.logs.length ? state.logs.map(s => `
      <div class="rank-row">
        <b>${escapeHtml(s.judge_circle)}</b>
        <span>${escapeHtml(s.battle_name || s.participant_name || "-")}<small>${escapeHtml(s.participant_order)} · ${escapeHtml(s.participant_circle)} CIRCLE</small></span>
        <em>${s.score ?? "-"}</em>
      </div>
    `).join("") : `<div class="empty">아직 로그 없음</div>`;
    return;
  }

  if(state.rankView === "total"){
    info.textContent = currentMode() === "all" ? "Mode 2 합계 랭킹" : "Mode 1 참고용 합계 랭킹";
    const rows = totalRank().slice(0, state.settings.topCount);
    box.innerHTML = rows.length ? rows.map(r => `
      <div class="rank-row">
        <b>#${r.rank}</b>
        <span>${escapeHtml(r.battle_name || r.participant_name || "-")}<small>${escapeHtml(r.participant_order)} · ${escapeHtml(r.participant_circle)} CIRCLE · ${r.count} scores</small></span>
        <em>${r.total}</em>
      </div>
    `).join("") : `<div class="empty">아직 점수 없음</div>`;
    return;
  }

  info.textContent = currentMode() === "all" ? "Mode 2 져지별 전체 랭킹" : "Mode 1 Circle Judge 랭킹";
  box.innerHTML = getCircles().map(c => {
    const rows = judgeRank(c).slice(0, state.settings.topCount);
    return `
      <div class="rank-group">
        <h4>${c} JUDGE</h4>
        ${rows.length ? rows.map(r => `
          <div class="rank-row">
            <b>#${r.rank}</b>
            <span>${escapeHtml(r.battle_name || r.participant_name || "-")}<small>${escapeHtml(r.participant_order)} · ${escapeHtml(r.participant_circle)} CIRCLE</small></span>
            <em>${r.score}</em>
          </div>
        `).join("") : `<div class="empty">아직 점수 없음</div>`}
      </div>
    `;
  }).join("");
}
function renderProgress(){
  const box = el("progressList");
  if(!box) return;
  const scores = getScoreRows();
  box.innerHTML = getCircles().map(c => {
    const rows = scores.filter(s => s.judge_circle === c && (currentMode() === "all" || s.participant_circle === c));
    const total = rows.length;
    const done = rows.filter(s => s.score !== null && s.score !== undefined).length;
    const pct = total ? Math.round(done/total*100) : 0;
    return `
      <div class="progress-item">
        <div><b>${c} JUDGE</b><em>${done}/${total}</em></div>
        <div class="progress-line"><i style="width:${pct}%"></i></div>
      </div>
    `;
  }).join("");
}

window.addEventListener("load", init);

/* result image / csv / bracket v5.2 */
function renderResultBoard(){
  const list = el("resultList");
  if(!list) return;
  const rows = totalRank().slice(0, state.settings.topCount);
  list.innerHTML = rows.length ? rows.map(r => `
    <div class="result-row">
      <b class="${r.rank===1?'gold':r.rank===2?'silver':r.rank===3?'bronze':'dark'}">#${r.rank}</b>
      <span>${escapeHtml(r.battle_name || r.participant_name || "-")}
        <small>REAL NAME · ${escapeHtml(r.participant_name || "-")} · ORDER ${escapeHtml(r.participant_order)} · CIRCLE ${escapeHtml(r.participant_circle)}</small>
      </span>
    </div>
  `).join("") : `<div class="empty">아직 결과 없음</div>`;
}

function saveUploadResultImage(){
  renderResultBoard();
  const node = el("resultBoard");
  if(!node){ alert("결과가 없어."); return; }
  html2canvas(node, { backgroundColor:"#07070a", scale:2, useCORS:true }).then(canvas => {
    const a=document.createElement("a");
    a.href=canvas.toDataURL("image/png");
    a.download="DPP_PRELIMINARY_RESULTS.png";
    a.click();
  });
}

function downloadCSV(){
  const rows = [["rank","order","circle","name","battle_name","total","average","count"],
    ...totalRank().map(x=>[x.rank,x.participant_order,x.participant_circle,x.participant_name,x.battle_name,x.total,x.avg.toFixed(2),x.count])
  ];
  const csv = rows.map(r=>r.map(v=>`"${String(v??"").replaceAll('"','""')}"`).join(",")).join("\n");
  const blob = new Blob(["\ufeff"+csv], { type:"text/csv;charset=utf-8;" });
  const url = URL.createObjectURL(blob);
  const a=document.createElement("a");
  a.href=url;
  a.download="DPP_RESULTS.csv";
  a.click();
  URL.revokeObjectURL(url);
}

function renderSeedInputs(){
  const box = el("seedInputs");
  if(!box) return;
  box.innerHTML = Array.from({length:16}, (_,i)=>{
    const n=i+1;
    const val=localStorage.getItem(`DPP_V52_SEED_${n}`) || "";
    return `<div><label>SEED ${n}</label><input id="seed_${n}" value="${escapeHtml(val)}" placeholder="직접 입력" oninput="localStorage.setItem('DPP_V52_SEED_${n}',this.value);renderBracket()"></div>`;
  }).join("");
}
function getSeeds(){
  return Array.from({length:16}, (_,i)=>{
    const n=i+1;
    const val=el(`seed_${n}`)?.value || localStorage.getItem(`DPP_V52_SEED_${n}`) || "";
    return { seed:n, name:val.trim() || `시드 ${n} 직접 입력` };
  });
}
function renderBracket(){
  renderSeedInputs();
  const board = el("bracketPreview");
  const story = el("bracketStoryContent");
  if(!board && !story) return;
  const seeds = getSeeds();
  const pairs = [];
  for(let i=0;i<16;i+=2) pairs.push([seeds[i], seeds[i+1]]);
  const html = pairs.map((p,i)=>`
    <div class="bracket-row">
      <b>M${i+1}</b>
      <span><em>${escapeHtml(p[0].name)}</em><small>SEED ${p[0].seed}</small></span>
      <strong>VS</strong>
      <span><em>${escapeHtml(p[1].name)}</em><small>SEED ${p[1].seed}</small></span>
    </div>
  `).join("");
  if(board) board.innerHTML = html;
  if(story) story.innerHTML = html;
}
function clearBracketSeeds(){
  if(!confirm("시드 입력값을 전부 지울까?")) return;
  for(let i=1;i<=16;i++) localStorage.removeItem(`DPP_V52_SEED_${i}`);
  renderSeedInputs();
  renderBracket();
}
function saveBracketStoryImage(){
  renderBracket();
  const node = el("bracketStoryBoard");
  html2canvas(node, { backgroundColor:"#02030a", scale:2, useCORS:true, width:1080, height:1920 }).then(canvas => {
    const a=document.createElement("a");
    a.href=canvas.toDataURL("image/png");
    a.download="DPP_TOP16_BRACKET_STORY.png";
    a.click();
  });
}
