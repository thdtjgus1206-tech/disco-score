
const DEFAULTS = {
  adminPin: "0000",
  mode: "circle",
  topCount: 16,
  isReady: false,
  prelimRound: 1,
  judges: {
    A: {name:"A JUDGE", pin:"1111"},
    B: {name:"B JUDGE", pin:"2222"},
    C: {name:"C JUDGE", pin:"3333"}
  }
};

const S = {
  settings: JSON.parse(JSON.stringify(DEFAULTS)),
  role: null,
  judge: "A",
  participants: [],
  scores: [],
  logs: [],
  queue: [],
  index: 0,
  input: "",
  rankView: "judge",
  resultEdits: {},
  batchStart: 0,
  batchDrafts: {},
  reviewRows: [],
  round2Preview: []
};

let sb = null;
let livePollTimer = null;
const SESSION_KEY = "DPP_V7_SESSION";

function $(id){ return document.getElementById(id); }
function esc(v){ return String(v ?? "").replace(/[&<>"]/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;'}[c])); }
function circles(){ return ["A","B","C"]; }
function saveSession(screenId){
  try{
    sessionStorage.setItem(SESSION_KEY, JSON.stringify({
      role:S.role, judge:S.judge, index:S.index,
      screen:screenId || document.querySelector('.screen.active')?.id || 'home'
    }));
  }catch{}
}
function clearSession(){ try{ sessionStorage.removeItem(SESSION_KEY); }catch{} }
function readSession(){ try{return JSON.parse(sessionStorage.getItem(SESSION_KEY)||'null')}catch{return null} }
function draftKey(){ return `DPP_V7_BATCH_DRAFT_${DPP_CONFIG.eventId}_${mode()}_${S.judge}`; }
function loadBatchDrafts(){ try{S.batchDrafts=JSON.parse(localStorage.getItem(draftKey())||'{}')}catch{S.batchDrafts={}} }
function persistBatchDrafts(){ localStorage.setItem(draftKey(), JSON.stringify(S.batchDrafts||{})); }
function clearBatchDraftsForOrders(orders){ orders.forEach(o=>delete S.batchDrafts[o]); persistBatchDrafts(); }
function batchBounds(index=S.index){
  const start=Math.floor(Math.max(0,index)/10)*10;
  return {start,end:Math.min(start+10,S.queue.length)};
}
function startLivePolling(){
  clearInterval(livePollTimer);
  livePollTimer=setInterval(async()=>{
    try{
      if(S.role==='admin') await refreshScoresOnly();
      else if(S.role==='judge'){
        await loadSettings();
        if(document.visibilityState==='visible') await buildJudgeQueue(false);
      }
    }catch(e){ console.warn('poll refresh',e); }
  },2500);
}

function orderParts(value){
  const text = String(value ?? "").trim().toUpperCase();
  const match = text.match(/^([A-Z])-(?:(나)-)?(\d+)$/);
  if(!match) return {circle:text, sub:"", number:Number.MAX_SAFE_INTEGER, raw:text};
  return {circle:match[1], sub:match[2] || "", number:Number(match[3]), raw:text};
}
function compareParticipantOrder(a,b){
  const x=orderParts(a), y=orderParts(b);
  return x.circle.localeCompare(y.circle,"ko")
    || x.sub.localeCompare(y.sub,"ko")
    || x.number-y.number
    || x.raw.localeCompare(y.raw,"ko",{numeric:true});
}
function mode(){ return S.settings.mode || "circle"; }
function defaultPin(c){ return DEFAULTS.judges[c]?.pin || "1111"; }
function judgeName(c){ return S.settings.judges[c]?.name || `${c} JUDGE`; }
function show(id){
  document.querySelectorAll(".screen").forEach(s => s.classList.remove("active"));
  $(id).classList.add("active");
  if(id === "admin") renderAdmin();
  if(id === "score") renderScore();
  if(S.role) saveSession(id);
}
function setStatus(t, ok=true){
  const p = $("statusPill");
  if(p){ p.textContent = t; p.classList.toggle("bad", !ok); }
}
function pendingKey(){ return `DPP_V7_PENDING_${DPP_CONFIG.eventId}_${mode()}_${S.judge}`; }
function getPending(){ try{return JSON.parse(localStorage.getItem(pendingKey())||"[]")}catch{return[]} }
function setPending(rows){ localStorage.setItem(pendingKey(), JSON.stringify(rows||[])); updateOfflineStatus(); }
function putPending(row){
  const rows = getPending();
  const key = `${row.score_mode}|${row.judge_circle}|${row.participant_order}`;
  const i = rows.findIndex(r => `${r.score_mode}|${r.judge_circle}|${r.participant_order}` === key);
  if(i>=0) rows[i]=row; else rows.push(row);
  setPending(rows);
}
function removePending(rowsDone){
  const done = new Set(rowsDone.map(r => `${r.score_mode}|${r.judge_circle}|${r.participant_order}`));
  setPending(getPending().filter(r => !done.has(`${r.score_mode}|${r.judge_circle}|${r.participant_order}`)));
}
function updateOfflineStatus(){
  const p = getPending().length;
  const txt = navigator.onLine ? `ONLINE · 업로드 대기 ${p}건` : `OFFLINE · 기기 저장 중 · 업로드 대기 ${p}건`;
  const n = $("offlineStatus");
  if(n){ n.textContent = txt; n.classList.toggle("bad", p>0 || !navigator.onLine); }
}
window.addEventListener("online", updateOfflineStatus);
window.addEventListener("offline", updateOfflineStatus);

async function init(){
  try{
    sb = window.supabase.createClient(DPP_CONFIG.supabaseUrl, DPP_CONFIG.supabaseKey);
    await loadSettings();
    await refreshAll();
    setStatus("ONLINE", true);
    subscribe();
  }catch(e){
    console.error(e);
    setStatus("DB ERROR / LOGIN STILL WORKS", false);
  }
  renderJudgeSelect();
  updateOfflineStatus();
  const session=readSession();
  if(session?.role==='admin'){
    S.role='admin';
    show(session.screen==='admin'?'admin':'admin');
  }else if(session?.role==='judge' && circles().includes(session.judge)){
    S.role='judge'; S.judge=session.judge; S.index=Number(session.index||0); loadBatchDrafts();
    await buildJudgeQueue(false);
    show(session.screen==='batchReview'?'batchReview':'score');
    if(session.screen==='batchReview') openBatchReview();
  }
  startLivePolling();
  document.addEventListener('visibilitychange',()=>{ if(document.visibilityState==='visible'){ if(S.role==='admin') refreshScoresOnly(); else if(S.role==='judge') buildJudgeQueue(false); }});
  if("serviceWorker" in navigator) navigator.serviceWorker.register("./sw.js").catch(()=>{});
}

function subscribe(){
  sb.channel("dpp-v7")
    .on("postgres_changes",{event:"*",schema:"public",table:"dpp_settings"}, async()=>{
      await loadSettings();
      if(S.role==="admin") renderAdmin();
      if(S.role==="judge") await buildJudgeQueue();
    })
    .on("postgres_changes",{event:"*",schema:"public",table:"dpp_participants"}, refreshAll)
    .on("postgres_changes",{event:"*",schema:"public",table:"dpp_scores"}, refreshScoresOnly)
    .on("postgres_changes",{event:"*",schema:"public",table:"dpp_logs"}, refreshScoresOnly)
    .subscribe();
}


async function ensureSettingsRow(){
  try{
    await sb.from("dpp_settings").upsert({
      event_id:DPP_CONFIG.eventId,
      scoring_mode:S.settings.mode,
      judge_count:3,
      top_count:S.settings.topCount,
      judges:S.settings.judges,
      is_ready:Boolean(S.settings.isReady),
      prelim_round:Number(S.settings.prelimRound || 1),
      updated_at:new Date().toISOString()
    },{onConflict:"event_id"});
  }catch(e){
    console.warn("settings row create failed", e);
  }
}

async function loadSettings(){
  const {data,error} = await sb.from("dpp_settings").select("*").eq("event_id",DPP_CONFIG.eventId).maybeSingle();
  if(error) throw error;
  if(data){
    S.settings.mode = data.scoring_mode || DEFAULTS.mode;
    S.settings.topCount = Number(data.top_count || DEFAULTS.topCount);
    S.settings.isReady = data.is_ready === true;
    S.settings.prelimRound = Number(data.prelim_round || 1);
    if(data.judges && typeof data.judges === "object"){
      circles().forEach(c => {
        S.settings.judges[c] = {
          name: String(data.judges[c]?.name || DEFAULTS.judges[c].name),
          pin: String(data.judges[c]?.pin || DEFAULTS.judges[c].pin)
        };
      });
    }
  }else{
    S.settings = JSON.parse(JSON.stringify(DEFAULTS));
    await ensureSettingsRow();
  }
}
async function saveSettings(){
  const {error} = await sb.from("dpp_settings").upsert({
    event_id:DPP_CONFIG.eventId,
    scoring_mode:S.settings.mode,
    judge_count:3,
    top_count:S.settings.topCount,
    judges:S.settings.judges,
    is_ready:Boolean(S.settings.isReady),
    prelim_round:Number(S.settings.prelimRound || 1),
    updated_at:new Date().toISOString()
  },{onConflict:"event_id"});
  if(error) throw error;
}
async function fetchParticipants(){
  const {data,error} = await sb.from("dpp_participants").select("*").eq("event_id",DPP_CONFIG.eventId).order("participant_order");
  if(error) throw error;
  return (data || []).sort((a,b)=>compareParticipantOrder(a.participant_order,b.participant_order));
}
async function fetchScores(){
  const {data,error} = await sb.from("dpp_scores").select("*").eq("event_id",DPP_CONFIG.eventId).eq("score_mode",mode()).order("participant_order");
  if(error) throw error;
  return (data || []).sort((a,b)=>compareParticipantOrder(a.participant_order,b.participant_order));
}
async function fetchLogs(){
  const {data,error} = await sb.from("dpp_logs").select("*").eq("event_id",DPP_CONFIG.eventId).eq("score_mode",mode()).order("created_at",{ascending:false}).limit(80);
  if(error) return [];
  return data || [];
}
async function refreshAll(){
  S.participants = await fetchParticipants();
  S.scores = await fetchScores();
  S.logs = await fetchLogs();
  if(S.role === "admin") renderAdmin();
  if(S.role === "judge") await buildJudgeQueue();
}
async function refreshScoresOnly(){
  S.scores = await fetchScores();
  S.logs = await fetchLogs();
  if(S.role === "admin"){
    if($("adminInfo")) $("adminInfo").textContent = `${currentRoundLabel()} · ${S.settings.isReady ? "심사 준비 완료" : "심사 준비 전"} · MODE ${mode().toUpperCase()} · 참가자 ${S.participants.length}명 · 점수row ${S.scores.length}개`;
    renderProgress(); renderRanking();
    if(!document.activeElement?.isContentEditable) renderResults();
  }
}

function renderJudgeSelect(){
  const sel = $("judgeSelect");
  if(!sel) return;
  const keep = sel.value || S.judge || "A";
  sel.innerHTML = circles().map(c => `<option value="${c}">${c} JUDGE</option>`).join("");
  sel.value = circles().includes(keep) ? keep : "A";
  S.judge = sel.value;
  sel.onchange = () => {
    S.judge = sel.value;
    const msg = $("judgeMsg");
    if(msg) msg.textContent = "";
  };
}
function openJudgeLogin(){
  renderJudgeSelect();
  $("judgePin").value = "";
  $("judgeMsg").textContent = "";
  show("judgeLogin");
}
function adminLogin(){
  if($("adminPin").value.trim() !== S.settings.adminPin){
    $("adminMsg").textContent = "관리자 PIN이 틀렸어.";
    return;
  }
  $("adminMsg").textContent = "";
  S.role = "admin";
  saveSession("admin");
  show("admin");
}
async function judgeLogin(){
  const c = $("judgeSelect").value || "A";
  const pinInput = $("judgePin");
  const msg = $("judgeMsg");
  const pin = String(pinInput?.value || "").trim();
  S.judge = c;

  if(!/^\d{4,8}$/.test(pin)){
    msg.textContent = `${c} JUDGE PIN을 정확히 입력해줘.`;
    return;
  }

  try{
    // 로그인할 때마다 Supabase의 현재 설정만 직접 조회한다.
    // DEFAULTS, localStorage, 이전 캐시 PIN은 로그인 판정에 절대 사용하지 않는다.
    const {data, error} = await sb
      .from("dpp_settings")
      .select("judges,is_ready,updated_at")
      .eq("event_id", DPP_CONFIG.eventId)
      .single();

    if(error) throw error;

    const latestJudges = data?.judges;
    const savedPin = String(latestJudges?.[c]?.pin ?? "").trim();

    if(!savedPin || pin !== savedPin){
      msg.textContent = `${c} JUDGE PIN이 틀렸어.`;
      pinInput.value = "";
      pinInput.focus();
      return;
    }

    // 로그인 성공 뒤에만 최신 설정을 로컬 화면 상태에 반영한다.
    circles().forEach(circle => {
      if(latestJudges?.[circle]){
        S.settings.judges[circle] = {
          name: String(latestJudges[circle].name || `${circle} JUDGE`),
          pin: String(latestJudges[circle].pin ?? "")
        };
      }
    });
    S.settings.isReady = data?.is_ready === true;

    msg.textContent = "LOGIN OK";
    pinInput.value = "";
    S.role = "judge";
    S.index = 0;
    S.input = "";
    S.queue = [];
    loadBatchDrafts();
    saveSession("score");

    show("score");
    renderScore();
    await refreshAll();
    await buildJudgeQueue();
  }catch(err){
    console.error("Judge login error:", err);
    msg.textContent = "PIN 확인 중 오류가 발생했어. 인터넷 연결을 확인해줘.";
  }
}
function logout(){
  S.role = null; S.queue=[]; S.index=0; S.input=""; S.reviewRows=[];
  clearSession();
  show("home");
}

function renderAdmin(){
  $("modeCircle").classList.toggle("active", mode()==="circle");
  $("modeAll").classList.toggle("active", mode()==="all");
  $("nameA").value = judgeName("A"); $("pinA").value = S.settings.judges.A.pin;
  $("nameB").value = judgeName("B"); $("pinB").value = S.settings.judges.B.pin;
  $("nameC").value = judgeName("C"); $("pinC").value = S.settings.judges.C.pin;
  if($("topCount")) $("topCount").value = S.settings.topCount;
  $("adminInfo").textContent = `${currentRoundLabel()} · ${S.settings.isReady ? "심사 준비 완료" : "심사 준비 전"} · MODE ${mode().toUpperCase()} · 참가자 ${S.participants.length}명 · 점수row ${S.scores.length}개`;
  renderParticipants();
  renderProgress();
  renderRanking();
  renderResults();
  renderRound2Preview();
}
function setMode(m){ S.settings.mode = m; S.resultEdits = {}; renderAdmin(); }
function readAdminSettings(){
  const topCount = Number($("topCount")?.value || S.settings.topCount);
  if(!Number.isInteger(topCount) || topCount < 1 || topCount > 100) throw new Error("TOP 표기 인원은 1~100 사이 숫자로 입력해줘.");
  S.settings.topCount = topCount;
  const next = {};
  for(const c of circles()){
    const name = $(`name${c}`).value.trim() || `${c} JUDGE`;
    const pin = $(`pin${c}`).value.trim();
    if(!/^\d{4,8}$/.test(pin)){
      throw new Error(`${c} JUDGE PIN은 숫자 4~8자리로 입력해줘.`);
    }
    next[c] = {name, pin};
  }
  S.settings.judges = next;
}
async function saveAllSettings(){
  try{
    readAdminSettings();
    S.settings.isReady = false;
    await saveSettings();

    // 방금 저장된 PIN을 다시 읽어 실제 DB 반영 여부까지 검증한다.
    const {data, error} = await sb
      .from("dpp_settings")
      .select("judges")
      .eq("event_id", DPP_CONFIG.eventId)
      .single();
    if(error) throw error;

    for(const c of circles()){
      const expected = String(S.settings.judges[c].pin);
      const actual = String(data?.judges?.[c]?.pin ?? "");
      if(expected !== actual) throw new Error(`${c} JUDGE PIN 저장 확인에 실패했어.`);
    }

    await loadSettings();
    await refreshAll();
    alert("저장 완료 · 기존 PIN은 즉시 폐기됐어.");
  }catch(err){
    alert(err.message || "설정 저장 오류");
  }
}
async function resetPins(){
  S.settings.judges.A.pin="1111"; S.settings.judges.B.pin="2222"; S.settings.judges.C.pin="3333";
  renderAdmin();
  await saveSettings();
  alert("PIN 초기화 완료");
}

async function clearAllData(){
  if(!confirm("현재 테스트 참가자/점수/로그를 전부 삭제할까?")) return;
  try{
    await sb.from("dpp_logs").delete().eq("event_id", DPP_CONFIG.eventId);
    await sb.from("dpp_scores").delete().eq("event_id", DPP_CONFIG.eventId);
    await sb.from("dpp_participants").delete().eq("event_id", DPP_CONFIG.eventId);
    S.settings.isReady = false;
    await saveSettings();
    localStorage.clear();
    S.participants = [];
    S.scores = [];
    S.logs = [];
    S.queue = [];
    S.index = 0;
    S.input = "";
    await refreshAll();
    renderAdmin();
    alert("초기화 완료. 이제 참가자 파일을 새로 업로드해줘.");
  }catch(err){
    alert("초기화 오류: " + err.message);
  }
}

async function prepareJudging(){
  try{
    readAdminSettings();
    S.settings.isReady = false;
    await saveSettings();

    const {data: saved, error: settingsError} = await sb
      .from("dpp_settings")
      .select("judges")
      .eq("event_id", DPP_CONFIG.eventId)
      .single();
    if(settingsError) throw settingsError;
    for(const c of circles()){
      if(String(saved?.judges?.[c]?.pin ?? "") !== String(S.settings.judges[c].pin)){
        throw new Error(`${c} JUDGE PIN 저장 확인에 실패했어.`);
      }
    }

    S.participants = await fetchParticipants();
    if(!S.participants.length){ alert("참가자 명단이 없어."); return; }

    const rows = makeScoreRows(S.participants);
    const {error} = await sb.from("dpp_scores").upsert(rows,{onConflict:"event_id,score_mode,judge_circle,participant_order"});
    if(error) throw new Error("점수표 생성 오류: " + error.message + "\n필수 SQL 실행 여부를 확인해줘.");

    S.settings.isReady = true;
    await saveSettings();
    await loadSettings();
    await refreshAll();
    alert(`심사 준비 완료 · ${mode()} · ${S.participants.length}명`);
  }catch(err){
    alert(err.message || "심사 준비 오류");
  }
}
function clean(v){ return String(v??"").replace(/\uFEFF/g,"").trim(); }
function isOrder(v){ return /^[A-Z]-(?:나-)?\d+$/i.test(clean(v).replace(/\s+/g,"")); }
function fixOrder(v){ return clean(v).replace(/\s+/g,"").replace(/^([a-z])-/,(_,a)=>a.toUpperCase()+"-"); }
function circleFromOrder(o){ const m=String(o).match(/^([A-Z])/i); return m?m[1].toUpperCase():""; }
function isContact(v){ v=clean(v); return v.includes("@") || v.includes(".com") || /^\+?\d[\d\s\-–]{6,}$/.test(v); }
function decodeCsv(buffer){
  const u8 = new Uint8Array(buffer);
  if(u8[0]===0xEF&&u8[1]===0xBB&&u8[2]===0xBF) return new TextDecoder("utf-8").decode(u8);
  const utf8 = new TextDecoder("utf-8").decode(u8);
  return (utf8.match(/\uFFFD/g)||[]).length ? new TextDecoder("euc-kr").decode(u8) : utf8;
}
function parseRows(rows){
  const out=[];
  rows.forEach(r=>{
    r=Array.from(r||[]).map(clean);
    r.forEach((cell,idx)=>{
      if(!isOrder(cell)) return;
      const order=fixOrder(cell), circle=circleFromOrder(order);
      let name="", battle="";
      if(idx>=12){ name=r[8]||""; battle=r[9]||""; }
      else if(idx>=5){ name=r[1]||""; battle=r[2]||""; }
      else{
        const prev=r.slice(Math.max(0,idx-5),idx).filter(v=>v&&!isContact(v)&&!isOrder(v));
        name=prev[0]||""; battle=prev[1]||"";
      }
      if(!name && !battle) return;
      out.push({event_id:DPP_CONFIG.eventId, participant_order:order, participant_circle:circle, participant_name:name, battle_name:battle, updated_at:new Date().toISOString()});
    });
  });
  const seen=new Set();
  return out.filter(p=>{ if(seen.has(p.participant_order)) return false; seen.add(p.participant_order); return true; }).sort((a,b)=>compareParticipantOrder(a.participant_order,b.participant_order));
}
async function handleFile(e){
  const file=e.target.files[0]; if(!file) return;
  $("fileName").textContent=file.name;
  const reader=new FileReader();
  reader.onload=async ev=>{
    try{
      let rows=[];
      if(file.name.toLowerCase().endsWith(".csv")){
        const wb=XLSX.read(decodeCsv(ev.target.result),{type:"string"});
        rows=XLSX.utils.sheet_to_json(wb.Sheets[wb.SheetNames[0]],{header:1,defval:"",raw:false});
      }else{
        const wb=XLSX.read(ev.target.result,{type:"array"});
        rows=XLSX.utils.sheet_to_json(wb.Sheets[wb.SheetNames[0]],{header:1,defval:"",raw:false});
      }
      const participants=parseRows(rows);
      if(!participants.length){ alert("참가자를 읽지 못했어."); return; }
      S.settings.isReady = false;
      await saveSettings();
      const {error}=await sb.from("dpp_participants").upsert(participants,{onConflict:"event_id,participant_order"});
      if(error){ alert("참가자 저장 오류: " + error.message); return; }
      await refreshAll();
      alert(`참가자 업로드 완료 · ${participants.length}명`);
    }catch(err){ alert("업로드 오류: "+err.message); }
  };
  reader.readAsArrayBuffer(file);
}
function makeScoreRows(participants){
  const rows=[];
  circles().forEach(c=>{
    participants.forEach(p=>{
      if(mode()==="circle" && p.participant_circle!==c) return;
      rows.push({event_id:DPP_CONFIG.eventId,score_mode:mode(),judge_circle:c,judge_name:judgeName(c),participant_order:p.participant_order,participant_circle:p.participant_circle,participant_name:p.participant_name,battle_name:p.battle_name,score:null,updated_at:new Date().toISOString()});
    });
  });
  return rows;
}
function renderParticipants(){
  $("participantTable").innerHTML = S.participants.length ? S.participants.map(p=>`<tr><td>${esc(p.participant_order)}</td><td>${esc(p.participant_circle)}</td><td>${esc(p.participant_name)}</td><td>${esc(p.battle_name)}</td></tr>`).join("") : `<tr><td colspan="4" class="empty">참가자 없음</td></tr>`;
}

async function buildJudgeQueue(resetRender=true){
  if(!S.settings.isReady){
    S.participants = [];
    S.scores = [];
    S.queue = [];
    S.index = 0;
    S.input = "";
    renderScore();
    return;
  }

  S.participants = await fetchParticipants();
  S.scores = await fetchScores();

  if(!S.participants.length){
    S.queue = [];
    S.index = 0;
    renderScore();
    return;
  }

  const base = S.participants.filter(p => mode()==="all" || p.participant_circle===S.judge);
  S.queue = base.map(p=>{
    const found = S.scores.find(s=>s.score_mode===mode() && s.judge_circle===S.judge && s.participant_order===p.participant_order);
    return found || {event_id:DPP_CONFIG.eventId,score_mode:mode(),judge_circle:S.judge,judge_name:judgeName(S.judge),participant_order:p.participant_order,participant_circle:p.participant_circle,participant_name:p.participant_name,battle_name:p.battle_name,score:null,updated_at:new Date().toISOString()};
  }).sort((a,b)=>compareParticipantOrder(a.participant_order,b.participant_order));
  S.queue = mergePending(S.queue);
  loadBatchDrafts();
  S.queue = S.queue.map(r => S.batchDrafts[r.participant_order] !== undefined ? {...r, draft_score:S.batchDrafts[r.participant_order]} : r);
  if(S.index >= S.queue.length) S.index = 0;
  if(resetRender) renderScore(); else if(document.querySelector("#score.active")) renderScore();
}
function mergePending(rows){
  const pending=getPending();
  const map=new Map(rows.map(r=>[`${r.score_mode}|${r.judge_circle}|${r.participant_order}`,r]));
  pending.forEach(p=>map.set(`${p.score_mode}|${p.judge_circle}|${p.participant_order}`, {...(map.get(`${p.score_mode}|${p.judge_circle}|${p.participant_order}`)||{}), ...p}));
  return Array.from(map.values()).sort((a,b)=>compareParticipantOrder(a.participant_order,b.participant_order));
}
function renderScore(){
  if(S.role!=="judge") return;
  $("scoreTitle").textContent = `${S.judge} JUDGE`;
  $("scoreMeta").textContent = `${judgeName(S.judge)} · ${mode()==="all" ? "Mode 2 / All Judge" : "Mode 1 / Circle Judge"}`;
  $("debugLine").textContent = `${S.settings.isReady ? "READY" : "WAITING"} · QUEUE ${S.queue.length} · 참가자 ${S.participants.length} · 점수row ${S.scores.length}`;
  $("scoreBar").style.width = S.queue.length ? `${(S.index+1)/S.queue.length*100}%` : "0%";
  updateOfflineStatus();
  const item=S.queue[S.index];
  if(!item){
    $("orderBadge").textContent="ORDER -"; $("circleBadge").textContent="CIRCLE -";
    $("battleName").textContent=S.settings.isReady ? "NO DANCER" : "심사 준비 중"; $("realName").textContent=S.settings.isReady ? "배정된 참가자가 없습니다." : "관리자가 SAVE ALL SETTINGS / 심사 준비를 누르면 자동으로 시작됩니다.";
    $("scoreDisplay").textContent="0"; return;
  }
  $("orderBadge").textContent="ORDER "+item.participant_order;
  $("circleBadge").textContent="CIRCLE "+item.participant_circle;
  $("battleName").textContent=item.battle_name || item.participant_name || "NO NAME";
  $("realName").textContent="REAL NAME · "+(item.participant_name||"-");
  const shown = S.input || (item.draft_score ?? item.score ?? "0");
  $("scoreDisplay").textContent=shown;
  saveSession("score");
}
function tap(v){ if(v==="."&&S.input.includes("."))return; if(S.input.length>=5)return; if(S.input==="0"&&v!==".")S.input=""; S.input+=v; $("scoreDisplay").textContent=S.input; }
function backspace(){ S.input=S.input.slice(0,-1); $("scoreDisplay").textContent=S.input||"0"; }
function clearScore(){ S.input=""; $("scoreDisplay").textContent="0"; }
function currentScoreValue(){
  const item=S.queue[S.index];
  if(!item) return null;
  const raw=String(S.input || (item.draft_score ?? item.score ?? '')).trim();
  if(raw==='') return null;
  const value=Number(raw);
  return Number.isFinite(value)?value:null;
}
function stageCurrentScore(requireValue=true){
  const item=S.queue[S.index];
  if(!item){ alert('참가자가 없어.'); return false; }
  const value=currentScoreValue();
  if(value===null){ if(requireValue) alert('점수를 입력해줘.'); return false; }
  S.batchDrafts[item.participant_order]=value;
  item.draft_score=value;
  persistBatchDrafts();
  S.input='';
  return true;
}
async function saveScoreAndNext(){
  if(!stageCurrentScore(true)) return;
  const {end}=batchBounds();
  if(S.index+1>=end || S.index>=S.queue.length-1){ openBatchReview(); return; }
  S.index++; saveSession('score'); renderScore();
}
async function uploadScore(row){
  const {error}=await sb.from("dpp_scores").upsert(row,{onConflict:"event_id,score_mode,judge_circle,participant_order"});
  if(error) throw error;
}
async function syncPendingScores(){
  alert('이 버전은 10명 단위 검토 화면의 CONFIRM & UPLOAD 버튼으로만 본부에 저장돼.');
}
function nextDancer(){
  const hasInput=String(S.input||'').trim()!=='';
  if(hasInput && !stageCurrentScore(true)) return;
  const {end}=batchBounds();
  if(S.index+1>=end || S.index>=S.queue.length-1){ openBatchReview(); return; }
  S.index++; S.input=''; saveSession('score'); renderScore();
}
function prevDancer(){ if(S.index>0){S.index--;S.input='';saveSession('score');renderScore();} }
function openBatchReview(){
  if(!S.queue.length) return;
  const {start,end}=batchBounds();
  S.batchStart=start;
  S.reviewRows=S.queue.slice(start,end);
  renderBatchReview();
  show('batchReview');
}
function renderBatchReview(){
  const rows=S.reviewRows||[];
  if($("reviewTitle")) $("reviewTitle").textContent=`${S.judge} JUDGE · ${S.batchStart+1}–${S.batchStart+rows.length} REVIEW`;
  $("batchReviewList").innerHTML=rows.map((r,i)=>{
    const value=S.batchDrafts[r.participant_order] ?? r.score ?? '';
    return `<div class="batch-review-row"><div class="review-order">${esc(r.participant_order)}</div><div class="review-person"><b>${esc(r.battle_name||r.participant_name||'-')}</b><small>${esc(r.participant_name||'-')} · CIRCLE ${esc(r.participant_circle)}</small></div><input type="number" step="0.1" inputmode="decimal" data-order="${esc(r.participant_order)}" value="${esc(value)}"></div>`;
  }).join('');
}
function backToBatchScoring(){
  const inputs=[...document.querySelectorAll('#batchReviewList input[data-order]')];
  inputs.forEach(input=>{ const v=Number(input.value); if(Number.isFinite(v)) S.batchDrafts[input.dataset.order]=v; });
  persistBatchDrafts();
  S.index=S.batchStart; S.input=''; show('score'); renderScore();
}
async function confirmBatchScores(){
  if(!navigator.onLine){ alert('인터넷 연결 후 점수를 확정해줘. 검토 중 점수는 이 기기에 임시 저장돼 있어.'); return; }
  const inputs=[...document.querySelectorAll('#batchReviewList input[data-order]')];
  const values={};
  for(const input of inputs){
    const v=Number(input.value);
    if(!Number.isFinite(v)){ alert(`${input.dataset.order} 점수를 확인해줘.`); input.focus(); return; }
    values[input.dataset.order]=v;
  }
  const btn=$("confirmBatchBtn"); btn.disabled=true; btn.textContent='UPLOADING...';
  try{
    const now=new Date().toISOString();
    const rows=S.reviewRows.map(item=>({...item,event_id:DPP_CONFIG.eventId,score_mode:mode(),judge_circle:S.judge,judge_name:judgeName(S.judge),score:values[item.participant_order],updated_at:now})).map(({draft_score,...r})=>r);
    const {error}=await sb.from('dpp_scores').upsert(rows,{onConflict:'event_id,score_mode,judge_circle,participant_order'});
    if(error) throw error;
    const logs=rows.map(r=>({event_id:r.event_id,score_mode:r.score_mode,judge_circle:r.judge_circle,judge_name:r.judge_name,participant_order:r.participant_order,participant_circle:r.participant_circle,participant_name:r.participant_name,battle_name:r.battle_name,score:r.score}));
    const {error:logError}=await sb.from('dpp_logs').insert(logs);
    if(logError) console.warn('log insert',logError);
    clearBatchDraftsForOrders(rows.map(r=>r.participant_order));
    rows.forEach(r=>{ const idx=S.queue.findIndex(q=>q.participant_order===r.participant_order); if(idx>=0) S.queue[idx]={...S.queue[idx],score:r.score,draft_score:undefined}; });
    await refreshScoresOnly();
    const next=S.batchStart+S.reviewRows.length;
    if(next>=S.queue.length){ S.index=Math.max(0,S.queue.length-1); alert('전체 채점 저장 완료!'); }
    else S.index=next;
    S.input=''; S.reviewRows=[]; show('score'); renderScore();
  }catch(e){ console.error(e); alert('점수 저장 오류: '+e.message); }
  finally{ btn.disabled=false; btn.textContent='CONFIRM & UPLOAD / 점수 확정'; }
}


function currentRoundLabel(){
  return S.settings.prelimRound === 2 ? "2차 예선" : "1차 예선";
}
function rankedQualifiersForRound2(){
  const topN = Math.max(1, Number(S.settings.topCount || 10));
  if(mode()==="circle"){
    const rows=[];
    circles().forEach(c=>{
      cutoffRows(judgeRank(c), "score").forEach(r=>{
        rows.push({...r, source_circle:c, source_rank:r.rank});
      });
    });
    return rows.sort((a,b)=>
      Number(a.source_rank)-Number(b.source_rank) ||
      circles().indexOf(a.source_circle)-circles().indexOf(b.source_circle) ||
      compareParticipantOrder(a.participant_order,b.participant_order)
    );
  }
  return cutoffRows(totalRank(), "total")
    .map(r=>({...r,source_circle:r.participant_circle,source_rank:r.rank}))
    .sort((a,b)=>Number(a.source_rank)-Number(b.source_rank)||compareParticipantOrder(a.participant_order,b.participant_order));
}
function buildRound2Preview(){
  const qualifiers=rankedQualifiersForRound2();
  S.round2Preview=qualifiers.map((r,i)=>{
    const n=i+1;
    const groupIndex=Math.floor(i/10);
    const newCircle=String.fromCharCode(65+groupIndex);
    return {
      ...r,
      new_order:`${newCircle}-${(i%10)+1}`,
      new_circle:newCircle,
      round2_number:n
    };
  });
  renderRound2Preview();
}
function renderRound2Preview(){
  const box=$("round2Preview");
  const info=$("round2Info");
  if(!box) return;
  if(info) info.textContent=`현재 ${currentRoundLabel()} · TOP 설정 ${S.settings.topCount} · ${mode()==="circle"?"서클별 진출":"전체 합계 진출"}`;
  if(!S.round2Preview.length){
    box.innerHTML='<div class="empty">PREVIEW 버튼을 누르면 2차 예선 진출자와 새 번호/조가 표시됩니다.</div>';
    return;
  }
  box.innerHTML=`<div class="table-wrap"><table><thead><tr><th>2차 ORDER</th><th>2차 조</th><th>BATTLE</th><th>본명</th><th>1차 서클</th><th>1차 순위</th></tr></thead><tbody>${
    S.round2Preview.map(r=>`<tr><td>${esc(r.new_order)}</td><td>${esc(r.new_circle)}조</td><td>${esc(r.battle_name||"-")}</td><td>${esc(r.participant_name||"-")}</td><td>${esc(r.source_circle)}</td><td>#${esc(r.source_rank)}</td></tr>`).join("")
  }</tbody></table></div>`;
}
async function startRound2(){
  try{
    buildRound2Preview();
    if(!S.round2Preview.length){ alert("2차 예선 진출자를 만들 수 없어. 1차 예선 점수를 먼저 확인해줘."); return; }
    const incomplete = mode()==="circle"
      ? circles().some(c=>S.participants.filter(p=>p.participant_circle===c).some(p=>!S.scores.some(s=>s.judge_circle===c&&s.participant_order===p.participant_order&&s.score!==null&&s.score!==undefined)))
      : S.participants.some(p=>circles().some(c=>!S.scores.some(s=>s.judge_circle===c&&s.participant_order===p.participant_order&&s.score!==null&&s.score!==undefined)));
    if(incomplete && !confirm("아직 모든 참가자의 채점이 끝나지 않았어. 현재 순위 기준으로 2차 진출자를 만들까?")) return;
    if(!confirm(`2차 예선 진출자 ${S.round2Preview.length}명을 확정할까?\n\n1차 점수/명단은 ARCHIVE에 보관하고, 현재 채점 화면은 2차 예선용으로 교체됩니다.`)) return;

    const archivePayload={
      round:1,
      scoring_mode:mode(),
      top_count:S.settings.topCount,
      participants:S.participants,
      scores:S.scores,
      created_at:new Date().toISOString()
    };
    const {error:archiveError}=await sb.from("dpp_round_archives").insert({
      event_id:DPP_CONFIG.eventId,
      round_no:1,
      payload:archivePayload
    });
    if(archiveError) throw new Error("1차 기록 보관 오류: "+archiveError.message+" / ROUND2 SQL을 먼저 실행해줘.");

    const nextParticipants=S.round2Preview.map(r=>({
      event_id:DPP_CONFIG.eventId,
      participant_order:r.new_order,
      participant_circle:r.new_circle,
      participant_name:r.participant_name,
      battle_name:r.battle_name,
      updated_at:new Date().toISOString()
    }));

    S.settings.isReady=false;
    S.settings.prelimRound=2;
    await saveSettings();

    await sb.from("dpp_logs").delete().eq("event_id",DPP_CONFIG.eventId);
    await sb.from("dpp_scores").delete().eq("event_id",DPP_CONFIG.eventId);
    await sb.from("dpp_participants").delete().eq("event_id",DPP_CONFIG.eventId);

    const {error:participantError}=await sb.from("dpp_participants").insert(nextParticipants);
    if(participantError) throw participantError;

    S.participants=nextParticipants;
    const scoreRows2=makeScoreRows(nextParticipants);
    const {error:scoreError}=await sb.from("dpp_scores").upsert(scoreRows2,{onConflict:"event_id,score_mode,judge_circle,participant_order"});
    if(scoreError) throw scoreError;

    S.settings.isReady=true;
    await saveSettings();
    S.round2Preview=[];
    localStorage.clear();
    await loadSettings();
    await refreshAll();
    alert(`2차 예선 준비 완료 · ${nextParticipants.length}명 · 10명씩 새 조 편성 완료`);
  }catch(err){
    console.error(err);
    alert(err.message || "2차 예선 전환 오류");
  }
}

function scoreRows(){ return S.scores.filter(s=>s.score_mode===mode()); }
function judgeRank(c){ return scoreRows().filter(s=>s.judge_circle===c&&s.score!==null&&s.score!==undefined).sort((a,b)=>Number(b.score)-Number(a.score)||compareParticipantOrder(a.participant_order,b.participant_order)).map((x,i)=>({...x,rank:i+1})); }
function totalRank(){
  const map={};
  scoreRows().forEach(s=>{
    map[s.participant_order] ||= {participant_order:s.participant_order,participant_circle:s.participant_circle,participant_name:s.participant_name,battle_name:s.battle_name,total:0,count:0};
    if(s.score!==null&&s.score!==undefined){ map[s.participant_order].total += Number(s.score)||0; map[s.participant_order].count++; }
  });
  return Object.values(map).filter(x=>x.count>0).map(x=>({...x,avg:x.total/x.count})).sort((a,b)=>b.total-a.total||compareParticipantOrder(a.participant_order,b.participant_order)).map((x,i)=>({...x,rank:i+1}));
}
function setRankView(v){ S.rankView=v; ["Judge","Total","Log"].forEach(k=>$("tab"+k)?.classList.toggle("active",v===k.toLowerCase())); renderRanking(); }
function renderRanking(){
  const box=$("rankingList"); if(!box) return;
  if(S.rankView==="log"){
    box.innerHTML=S.logs.length?S.logs.map(s=>`<div class="rank-row"><b>${esc(s.judge_circle)}</b><span>${esc(s.battle_name||s.participant_name||"-")}<small>${esc(s.participant_order)} · ${esc(s.participant_circle)}</small></span><em>${s.score??"-"}</em></div>`).join(""):`<div class="empty">로그 없음</div>`; return;
  }
  if(S.rankView==="total"){
    const rows=totalRank();
    box.innerHTML=rows.length?rows.map(r=>`<div class="rank-row"><b>#${r.rank}</b><span>${esc(r.battle_name||r.participant_name||"-")}<small>${esc(r.participant_order)} · ${esc(r.participant_circle)} · ${r.count} scores</small></span><em>${r.total}</em></div>`).join(""):`<div class="empty">점수 없음</div>`; return;
  }
  box.innerHTML=circles().map(c=>`<div class="rank-group"><h4>${c} JUDGE</h4>${judgeRank(c).map(r=>`<div class="rank-row"><b>#${r.rank}</b><span>${esc(r.battle_name||r.participant_name||"-")}<small>${esc(r.participant_order)} · ${esc(r.participant_circle)}</small></span><em>${r.score}</em></div>`).join("")||`<div class="empty">점수 없음</div>`}</div>`).join("");
}
function renderProgress(){
  $("progressList").innerHTML=circles().map(c=>{
    const rows=scoreRows().filter(s=>s.judge_circle===c&&(mode()==="all"||s.participant_circle===c));
    const total=mode()==="all"?S.participants.length:S.participants.filter(p=>p.participant_circle===c).length;
    const done=rows.filter(s=>s.score!==null&&s.score!==undefined).length;
    const pct=total?Math.round(done/total*100):0;
    return `<div class="progress-item"><div><b>${c} JUDGE</b><em>${done}/${total}</em></div><div class="progress-line"><i style="width:${pct}%"></i></div></div>`;
  }).join("");
}
function rankWithTies(rows, scoreKey){
  let lastScore = null;
  let lastRank = 0;
  return rows.map((row, index) => {
    const score = Number(row[scoreKey]);
    const rank = index === 0 || score !== lastScore ? index + 1 : lastRank;
    lastScore = score;
    lastRank = rank;
    return {...row, rank};
  });
}
function cutoffRows(rows, scoreKey){
  const ranked = rankWithTies(rows, scoreKey);
  const topN = Math.max(1, Number(S.settings.topCount || 6));
  if(ranked.length <= topN) return ranked;
  const cutoffScore = Number(ranked[topN - 1]?.[scoreKey]);
  return ranked.filter((row, index) => index < topN || Number(row[scoreKey]) === cutoffScore);
}
function resultSets(){
  if(mode() === "circle"){
    return circles().map(c => ({
      key:c,
      title:`${c} JUDGE · ${judgeName(c)} · TOP ${Math.max(1, Number(S.settings.topCount || 6))}`,
      rows:cutoffRows(judgeRank(c), "score")
    }));
  }
  return [{
    key:"TOTAL",
    title:`ALL GROUPS · TOTAL / AVG · TOP ${Math.max(1, Number(S.settings.topCount || 6))}`,
    rows:cutoffRows(totalRank(), "total")
  }];
}
function editKey(setKey, row){ return `${mode()}|${setKey}|${row.participant_order}`; }
function editedValue(setKey, row, field, fallback){
  return S.resultEdits[editKey(setKey,row)]?.[field] ?? fallback;
}
function rememberResultEdit(el){
  const key = el.dataset.editKey;
  const field = el.dataset.field;
  S.resultEdits[key] ||= {};
  S.resultEdits[key][field] = el.textContent.trim();
}
function deleteResultRow(button){
  const row = button.closest(".result-row");
  const key = button.dataset.editKey;
  if(!row || !key) return;
  S.resultEdits[key] ||= {};
  S.resultEdits[key].deleted = true;
  row.remove();
  updateResultBoardDensity(button.closest(".result-board"));
}
function updateResultBoardDensity(board){
  if(!board) return;
  const count = board.querySelectorAll(".result-row").length;
  board.classList.toggle("compact", count > 8);
  board.classList.toggle("ultra-compact", count > 12);
  if(count === 0 && !board.querySelector(".result-empty")){
    const list = board.querySelector(".result-list");
    if(list) list.innerHTML = `<div class="result-empty">결과 없음</div>`;
  }
}
function resultRowHtml(setKey, r){
  const key = editKey(setKey,r);
  const battle = editedValue(setKey,r,"battle",r.battle_name || r.participant_name || "-");
  const real = editedValue(setKey,r,"real",r.participant_name || "-");
  const order = editedValue(setKey,r,"order",r.participant_order || "-");
  const circle = editedValue(setKey,r,"circle",r.participant_circle || "-");
  const rankLabel = editedValue(setKey,r,"rank",`#${r.rank}`);
  return `<div class="result-row">
    <button type="button" class="result-delete" data-edit-key="${esc(key)}" onclick="deleteResultRow(this)" aria-label="이 순위 삭제" title="이 순위 삭제">×</button>
    <b class="result-rank ${r.rank===1?'gold':'dark'}" contenteditable="true" spellcheck="false" data-edit-key="${esc(key)}" data-field="rank" oninput="rememberResultEdit(this)">${esc(rankLabel)}</b>
    <span class="result-person">
      <strong contenteditable="true" spellcheck="false" data-edit-key="${esc(key)}" data-field="battle" oninput="rememberResultEdit(this)">${esc(battle)}</strong>
      <small>REAL NAME · <span contenteditable="true" spellcheck="false" data-edit-key="${esc(key)}" data-field="real" oninput="rememberResultEdit(this)">${esc(real)}</span> · ORDER <span contenteditable="true" spellcheck="false" data-edit-key="${esc(key)}" data-field="order" oninput="rememberResultEdit(this)">${esc(order)}</span> · GROUP <span contenteditable="true" spellcheck="false" data-edit-key="${esc(key)}" data-field="circle" oninput="rememberResultEdit(this)">${esc(circle)}</span></small>
    </span>
  </div>`;
}
function resultBoardHtml(set){
  const visibleRows = set.rows.filter(r => !S.resultEdits[editKey(set.key,r)]?.deleted);
  const compact = visibleRows.length > 8 ? " compact" : "";
  const ultra = visibleRows.length > 12 ? " ultra-compact" : "";
  const headerKey = `header|${set.key}`;
  const logo = S.resultEdits[headerKey]?.logo ?? "D.I.S.C.O";
  const subtitle = S.resultEdits[headerKey]?.subtitle ?? set.title;
  return `<div class="result-image-block">
    <div class="result-image-actions"><b>${esc(set.key === "TOTAL" ? "TOTAL RESULT" : `${set.key} JUDGE RESULT`)}</b><button class="primary small" onclick="saveResultImage('${esc(set.key)}')">SAVE ${esc(set.key)} IMAGE</button></div>
    <div id="resultBoard_${esc(set.key)}" class="result-board${compact}${ultra}">
      <div class="result-logo" contenteditable="true" spellcheck="false" data-edit-key="${esc(headerKey)}" data-field="logo" oninput="rememberResultEdit(this)">${esc(logo)}</div>
      <div class="result-sub" contenteditable="true" spellcheck="false" data-edit-key="${esc(headerKey)}" data-field="subtitle" oninput="rememberResultEdit(this)">${esc(subtitle)}</div>
      <div class="result-list">${visibleRows.length ? visibleRows.map(r=>resultRowHtml(set.key,r)).join("") : `<div class="result-empty">결과 없음</div>`}</div>
    </div>
  </div>`;
}
function renderResults(){
  const host = $("resultBoards");
  if(!host) return;
  host.innerHTML = resultSets().map(resultBoardHtml).join("");
}
async function saveResultImage(setKey){
  const board = $(`resultBoard_${setKey}`);
  if(!board) return;
  board.classList.add("exporting");
  await new Promise(resolve => requestAnimationFrame(() => requestAnimationFrame(resolve)));
  try{
    const canvas = await html2canvas(board,{
      backgroundColor:"#081321", scale:2, useCORS:true,
      width:540, height:960, windowWidth:540, windowHeight:960, scrollX:0, scrollY:0
    });
    const a=document.createElement("a");
    a.href=canvas.toDataURL("image/png");
    const topN=Math.max(1,Number(S.settings.topCount||6));
    a.download=`DPP_${mode()==="circle"?setKey:"TOTAL"}_TOP_${topN}.png`;
    a.click();
  } finally { board.classList.remove("exporting"); }
}

window.addEventListener("error", e => {
  console.error("DPP ERROR", e.message, e.error);
  const msg=$("judgeMsg");
  if(msg && $("judgeLogin")?.classList.contains("active")) msg.textContent="앱 오류: "+e.message;
});
window.addEventListener("load", init);
