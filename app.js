
const DEFAULTS = {
  adminPin: "0000",
  mode: "circle",
  topCount: 16,
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
  rankView: "judge"
};

let sb = null;

function $(id){ return document.getElementById(id); }
function esc(v){ return String(v ?? "").replace(/[&<>"]/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;'}[c])); }
function circles(){ return ["A","B","C"]; }
function mode(){ return S.settings.mode || "circle"; }
function defaultPin(c){ return DEFAULTS.judges[c]?.pin || "1111"; }
function judgeName(c){ return S.settings.judges[c]?.name || `${c} JUDGE`; }
function allowedPins(c){
  const saved = String(S.settings.judges[c]?.pin || "").trim();
  return Array.from(new Set([saved, defaultPin(c)].filter(Boolean)));
}
function show(id){
  document.querySelectorAll(".screen").forEach(s => s.classList.remove("active"));
  $(id).classList.add("active");
  if(id === "admin") renderAdmin();
  if(id === "score") renderScore();
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
    setStatus("DB ERROR", false);
  }
  renderJudgeSelect();
  updateOfflineStatus();
  if("serviceWorker" in navigator) navigator.serviceWorker.register("./sw.js").catch(()=>{});
}

function subscribe(){
  sb.channel("dpp-v7")
    .on("postgres_changes",{event:"*",schema:"public",table:"dpp_settings"}, async()=>{await loadSettings(); if(S.role==="admin") renderAdmin();})
    .on("postgres_changes",{event:"*",schema:"public",table:"dpp_participants"}, refreshAll)
    .on("postgres_changes",{event:"*",schema:"public",table:"dpp_scores"}, refreshScoresOnly)
    .on("postgres_changes",{event:"*",schema:"public",table:"dpp_logs"}, refreshScoresOnly)
    .subscribe();
}

async function loadSettings(){
  const {data,error} = await sb.from("dpp_settings").select("*").eq("event_id",DPP_CONFIG.eventId).maybeSingle();
  if(error) throw error;
  if(data){
    S.settings.mode = data.scoring_mode || DEFAULTS.mode;
    if(data.judges && typeof data.judges === "object"){
      circles().forEach(c => {
        S.settings.judges[c] = {
          name: String(data.judges[c]?.name || DEFAULTS.judges[c].name),
          pin: String(data.judges[c]?.pin || DEFAULTS.judges[c].pin)
        };
      });
    }
  }
}
async function saveSettings(){
  const {error} = await sb.from("dpp_settings").upsert({
    event_id:DPP_CONFIG.eventId,
    scoring_mode:S.settings.mode,
    judge_count:3,
    top_count:S.settings.topCount,
    judges:S.settings.judges,
    updated_at:new Date().toISOString()
  },{onConflict:"event_id"});
  if(error) throw error;
}
async function fetchParticipants(){
  const {data,error} = await sb.from("dpp_participants").select("*").eq("event_id",DPP_CONFIG.eventId).order("participant_order");
  if(error) throw error;
  return data || [];
}
async function fetchScores(){
  const {data,error} = await sb.from("dpp_scores").select("*").eq("event_id",DPP_CONFIG.eventId).eq("score_mode",mode()).order("participant_order");
  if(error) throw error;
  return data || [];
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
  if(S.role === "admin") renderAdmin();
}

function renderJudgeSelect(){
  const sel = $("judgeSelect");
  if(!sel) return;
  const keep = sel.value || S.judge || "A";
  sel.innerHTML = circles().map(c => `<option value="${c}">${c} JUDGE · ${esc(judgeName(c))}</option>`).join("");
  sel.value = circles().includes(keep) ? keep : "A";
  S.judge = sel.value;
  sel.onchange = () => { S.judge = sel.value; $("judgeMsg").textContent = ""; };
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
  show("admin");
}
async function judgeLogin(){
  const c = $("judgeSelect").value;
  const pin = $("judgePin").value.trim();
  S.judge = c;
  if(!allowedPins(c).includes(pin)){
    $("judgeMsg").textContent = `${c} JUDGE PIN이 틀렸어. 현재 선택: ${c}`;
    return;
  }
  $("judgeMsg").textContent = "";
  $("judgePin").value = "";
  S.role = "judge";
  S.index = 0;
  S.input = "";
  await refreshAll();
  await buildJudgeQueue();
  show("score");
}
function logout(){
  S.role = null; S.queue=[]; S.index=0; S.input="";
  show("home");
}

function renderAdmin(){
  $("modeCircle").classList.toggle("active", mode()==="circle");
  $("modeAll").classList.toggle("active", mode()==="all");
  $("nameA").value = judgeName("A"); $("pinA").value = S.settings.judges.A.pin;
  $("nameB").value = judgeName("B"); $("pinB").value = S.settings.judges.B.pin;
  $("nameC").value = judgeName("C"); $("pinC").value = S.settings.judges.C.pin;
  $("adminInfo").textContent = `MODE ${mode().toUpperCase()} · 참가자 ${S.participants.length}명 · 점수row ${S.scores.length}개`;
  renderParticipants();
  renderProgress();
  renderRanking();
  renderResults();
}
function setMode(m){ S.settings.mode = m; renderAdmin(); }
function readAdminSettings(){
  S.settings.judges.A = {name:$("nameA").value.trim()||"A JUDGE", pin:$("pinA").value.trim()||"1111"};
  S.settings.judges.B = {name:$("nameB").value.trim()||"B JUDGE", pin:$("pinB").value.trim()||"2222"};
  S.settings.judges.C = {name:$("nameC").value.trim()||"C JUDGE", pin:$("pinC").value.trim()||"3333"};
}
async function saveAllSettings(){
  readAdminSettings();
  await saveSettings();
  await refreshAll();
  alert("저장 완료");
}
async function resetPins(){
  S.settings.judges.A.pin="1111"; S.settings.judges.B.pin="2222"; S.settings.judges.C.pin="3333";
  renderAdmin();
  await saveSettings();
  alert("PIN 초기화 완료");
}
async function prepareJudging(){
  readAdminSettings();
  await saveSettings();
  S.participants = await fetchParticipants();
  if(!S.participants.length){ alert("참가자 명단이 없어."); return; }
  const rows = makeScoreRows(S.participants);
  const {error} = await sb.from("dpp_scores").upsert(rows,{onConflict:"event_id,score_mode,judge_circle,participant_order"});
  if(error){ alert("점수표 생성 오류: " + error.message + "\\n필수 SQL 실행 여부를 확인해줘."); return; }
  await refreshAll();
  alert(`심사 준비 완료 · ${mode()} · ${S.participants.length}명`);
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
  return out.filter(p=>{ if(seen.has(p.participant_order)) return false; seen.add(p.participant_order); return true; });
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

async function buildJudgeQueue(){
  if(!S.participants.length) S.participants = await fetchParticipants();
  if(!S.scores.length) S.scores = await fetchScores();
  const base = S.participants.filter(p => mode()==="all" || p.participant_circle===S.judge);
  S.queue = base.map(p=>{
    const found = S.scores.find(s=>s.score_mode===mode() && s.judge_circle===S.judge && s.participant_order===p.participant_order);
    return found || {event_id:DPP_CONFIG.eventId,score_mode:mode(),judge_circle:S.judge,judge_name:judgeName(S.judge),participant_order:p.participant_order,participant_circle:p.participant_circle,participant_name:p.participant_name,battle_name:p.battle_name,score:null,updated_at:new Date().toISOString()};
  }).sort((a,b)=>String(a.participant_order).localeCompare(String(b.participant_order),"ko"));
  S.queue = mergePending(S.queue);
  if(S.index >= S.queue.length) S.index = 0;
  renderScore();
}
function mergePending(rows){
  const pending=getPending();
  const map=new Map(rows.map(r=>[`${r.score_mode}|${r.judge_circle}|${r.participant_order}`,r]));
  pending.forEach(p=>map.set(`${p.score_mode}|${p.judge_circle}|${p.participant_order}`, {...(map.get(`${p.score_mode}|${p.judge_circle}|${p.participant_order}`)||{}), ...p}));
  return Array.from(map.values()).sort((a,b)=>String(a.participant_order).localeCompare(String(b.participant_order),"ko"));
}
function renderScore(){
  if(S.role!=="judge") return;
  $("scoreTitle").textContent = `${S.judge} JUDGE`;
  $("scoreMeta").textContent = `${judgeName(S.judge)} · ${mode()==="all" ? "Mode 2 / All Judge" : "Mode 1 / Circle Judge"}`;
  $("debugLine").textContent = `QUEUE ${S.queue.length} · 참가자 ${S.participants.length} · 점수row ${S.scores.length}`;
  $("scoreBar").style.width = S.queue.length ? `${(S.index+1)/S.queue.length*100}%` : "0%";
  updateOfflineStatus();
  const item=S.queue[S.index];
  if(!item){
    $("orderBadge").textContent="ORDER -"; $("circleBadge").textContent="CIRCLE -";
    $("battleName").textContent="NO DANCER"; $("realName").textContent="관리자에서 참가자 업로드 후 심사 준비 버튼 확인";
    $("scoreDisplay").textContent="0"; return;
  }
  $("orderBadge").textContent="ORDER "+item.participant_order;
  $("circleBadge").textContent="CIRCLE "+item.participant_circle;
  $("battleName").textContent=item.battle_name || item.participant_name || "NO NAME";
  $("realName").textContent="REAL NAME · "+(item.participant_name||"-");
  $("scoreDisplay").textContent=S.input || (item.score ?? "0");
}
function tap(v){ if(v==="."&&S.input.includes("."))return; if(S.input.length>=5)return; if(S.input==="0"&&v!==".")S.input=""; S.input+=v; $("scoreDisplay").textContent=S.input; }
function backspace(){ S.input=S.input.slice(0,-1); $("scoreDisplay").textContent=S.input||"0"; }
function clearScore(){ S.input=""; $("scoreDisplay").textContent="0"; }
async function saveScoreAndNext(){
  const item=S.queue[S.index]; if(!item){ alert("참가자가 없어."); return; }
  const score=Number(S.input || $("scoreDisplay").textContent); if(Number.isNaN(score)){ alert("점수를 입력해줘."); return; }
  const row={...item, event_id:DPP_CONFIG.eventId, score_mode:mode(), judge_circle:S.judge, judge_name:judgeName(S.judge), score, updated_at:new Date().toISOString()};
  putPending(row);
  S.queue[S.index]=row;
  if(navigator.onLine){
    try{ await uploadScore(row); removePending([row]); }catch(e){ console.warn(e); }
  }
  S.input="";
  nextDancer();
}
async function uploadScore(row){
  const {error}=await sb.from("dpp_scores").upsert(row,{onConflict:"event_id,score_mode,judge_circle,participant_order"});
  if(error) throw error;
  await sb.from("dpp_logs").insert({event_id:row.event_id,score_mode:row.score_mode,judge_circle:row.judge_circle,judge_name:row.judge_name,participant_order:row.participant_order,participant_circle:row.participant_circle,participant_name:row.participant_name,battle_name:row.battle_name,score:row.score});
}
async function syncPendingScores(){
  const pending=getPending();
  if(!pending.length){ alert("업로드 대기 점수가 없어."); return; }
  if(!navigator.onLine){ alert(`오프라인이야. 인터넷 연결 후 눌러줘. 대기 ${pending.length}건`); return; }
  const done=[]; let fail=0;
  for(const r of pending){
    try{ await uploadScore(r); done.push(r); removePending(done); }catch(e){ console.error(e); fail++; }
  }
  await refreshScoresOnly();
  await buildJudgeQueue();
  alert(fail ? `일부 실패 · 성공 ${done.length} / 실패 ${fail}` : `SYNC 완료 · ${done.length}건`);
}
function nextDancer(){ if(S.index<S.queue.length-1){S.index++;S.input="";renderScore();}else{alert("채점 끝");renderScore();} }
function prevDancer(){ if(S.index>0){S.index--;S.input="";renderScore();} }

function scoreRows(){ return S.scores.filter(s=>s.score_mode===mode()); }
function judgeRank(c){ return scoreRows().filter(s=>s.judge_circle===c&&s.score!==null&&s.score!==undefined).sort((a,b)=>Number(b.score)-Number(a.score)||String(a.participant_order).localeCompare(String(b.participant_order),"ko")).map((x,i)=>({...x,rank:i+1})); }
function totalRank(){
  const map={};
  scoreRows().forEach(s=>{
    map[s.participant_order] ||= {participant_order:s.participant_order,participant_circle:s.participant_circle,participant_name:s.participant_name,battle_name:s.battle_name,total:0,count:0};
    if(s.score!==null&&s.score!==undefined){ map[s.participant_order].total += Number(s.score)||0; map[s.participant_order].count++; }
  });
  return Object.values(map).filter(x=>x.count>0).map(x=>({...x,avg:x.total/x.count})).sort((a,b)=>b.total-a.total||String(a.participant_order).localeCompare(String(b.participant_order),"ko")).map((x,i)=>({...x,rank:i+1}));
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
function renderResults(){
  const rows=totalRank();
  $("resultList").innerHTML=rows.length?rows.map(r=>`<div class="result-row"><b class="${r.rank===1?'gold':r.rank===2?'silver':r.rank===3?'bronze':'dark'}">#${r.rank}</b><span>${esc(r.battle_name||r.participant_name||"-")}<small>REAL NAME · ${esc(r.participant_name||"-")} · ORDER ${esc(r.participant_order)} · CIRCLE ${esc(r.participant_circle)}</small></span></div>`).join(""):`<div class="empty">결과 없음</div>`;
}
function saveResultImage(){
  renderResults();
  html2canvas($("resultBoard"),{backgroundColor:"#07070a",scale:2,useCORS:true}).then(canvas=>{
    const a=document.createElement("a"); a.href=canvas.toDataURL("image/png"); a.download="DPP_RESULTS.png"; a.click();
  });
}

window.addEventListener("error", e => {
  console.error("DPP ERROR", e.message, e.error);
  const msg=$("judgeMsg");
  if(msg && $("judgeLogin")?.classList.contains("active")) msg.textContent="앱 오류: "+e.message;
});
window.addEventListener("load", init);
