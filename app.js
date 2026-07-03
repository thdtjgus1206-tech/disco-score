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
  role: null
};

let supabaseClient = null;

function el(id){ return document.getElementById(id); }

function showScreen(id){
  document.querySelectorAll(".screen").forEach(s => s.classList.remove("active"));
  el(id).classList.add("active");

  if(id === "admin") renderAdmin();
  if(id === "judgeLogin") renderJudgeSelect();
}

function setStatus(text, ok=true){
  const pill = el("statusPill");
  if(pill){
    pill.textContent = text;
    pill.classList.toggle("bad", !ok);
  }
  const admin = el("adminStatus");
  if(admin) admin.textContent = text;
}

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

function getCircles(){
  return Array.from({ length: Number(state.settings.judgeCount) || 3 }, (_, i) =>
    String.fromCharCode(65 + i)
  );
}

async function init(){
  supabaseClient = window.supabase.createClient(
    DPP_CONFIG.supabaseUrl,
    DPP_CONFIG.supabaseKey
  );

  await loadSettings();
  renderJudgeSelect();

  supabaseClient
    .channel("dpp-v5-settings")
    .on("postgres_changes", {
      event: "*",
      schema: "public",
      table: "dpp_settings"
    }, async () => {
      await loadSettings();
      renderJudgeSelect();
      if(state.role === "admin") renderAdmin();
    })
    .subscribe();

  if("serviceWorker" in navigator){
    navigator.serviceWorker.register("./sw.js").catch(()=>{});
  }
}

async function loadSettings(){
  try{
    const { data, error } = await supabaseClient
      .from("dpp_settings")
      .select("*")
      .eq("event_id", DPP_CONFIG.eventId)
      .maybeSingle();

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
  const payload = {
    event_id: DPP_CONFIG.eventId,
    scoring_mode: settings.scoringMode,
    judge_count: Number(settings.judgeCount || 3),
    top_count: Number(settings.topCount || 16),
    judges: settings.judges,
    updated_at: new Date().toISOString()
  };

  const { error } = await supabaseClient
    .from("dpp_settings")
    .upsert(payload, { onConflict: "event_id" });

  if(error) throw error;
}

function renderJudgeSelect(){
  const select = el("judgeSelect");
  if(!select) return;

  const keep = select.value || state.selectedJudge || "A";
  select.innerHTML = getCircles()
    .map(c => `<option value="${c}">${c} JUDGE</option>`)
    .join("");

  if([...select.options].some(o => o.value === keep)){
    select.value = keep;
  }else{
    select.value = "A";
  }

  select.onchange = () => {
    state.selectedJudge = select.value;
  };
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

function judgeLogin(){
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
  el("judgeLoginMsg").textContent = "";
  el("judgePinInput").value = "";

  el("judgeTitle").textContent = `${circle} JUDGE`;
  el("judgeSub").textContent = judge.name || `${circle} JUDGE`;
  el("judgeSuccessText").innerHTML =
    `<b>${circle} JUDGE 로그인 성공</b><br>현재 모드: ${state.settings.scoringMode === "all" ? "Mode 2 / All Judge" : "Mode 1 / Circle Judge"}`;

  showScreen("judgeHome");
}

function renderAdmin(){
  el("adminStatus").textContent = "ONLINE / SETTINGS SYNCED";

  el("modeCircleBtn").classList.toggle("active", state.settings.scoringMode === "circle");
  el("modeAllBtn").classList.toggle("active", state.settings.scoringMode === "all");

  const box = el("judgeSettings");
  box.innerHTML = getCircles().map(c => {
    const j = state.settings.judges[c] || { name: `${c} JUDGE`, pin: "" };
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

function setMode(mode){
  state.settings.scoringMode = mode;
  renderAdmin();
}

async function saveAdminSettings(){
  getCircles().forEach(c => {
    state.settings.judges[c] = {
      name: el(`name_${c}`).value.trim() || `${c} JUDGE`,
      pin: el(`pin_${c}`).value.trim()
    };
  });

  try{
    await saveSettings(state.settings);
    await loadSettings();
    renderAdmin();
    alert("저장 완료");
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

function logout(){
  state.role = null;
  showScreen("home");
}

function escapeHtml(str){
  return String(str ?? "").replace(/[&<>"]/g, ch => ({
    "&": "&amp;",
    "<": "&lt;",
    ">": "&gt;",
    '"': "&quot;"
  }[ch]));
}

window.addEventListener("load", init);
