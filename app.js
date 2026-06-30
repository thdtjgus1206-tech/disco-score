
const app={
  role:null,
  judgeCircle:null,
  judgeName:'',
  currentIndex:0,
  input:'',
  participants:[],
  scores:[],
  logs:[],
  judgeParticipants:[],
  rankView:'judge',
  settings:{
    adminPin:'0000',
    judgeCount:3,
    topCount:16,
    judges:{
      A:{name:'',pin:'1111'},
      B:{name:'',pin:'2222'},
      C:{name:'',pin:'3333'}
    }
  }
};

function escapeHtml(s){return String(s??'').replace(/[&<>"]/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;'}[c]))}
function getJudgeCircles(){return Array.from({length:Number(app.settings.judgeCount)||3},(_,i)=>String.fromCharCode(65+i))}
function go(id){
  document.querySelectorAll('.screen').forEach(s=>s.classList.remove('active'));
  document.getElementById(id).classList.add('active');
  if(id==='admin')renderAdmin();
  if(id==='score')renderScore();
}
function saveLocalSettings(){localStorage.setItem('DPP_V3_SETTINGS',JSON.stringify(app.settings))}
function loadLocalSettings(){
  try{
    const saved=JSON.parse(localStorage.getItem('DPP_V3_SETTINGS')||'null');
    if(saved)app.settings={...app.settings,...saved,judges:{...app.settings.judges,...(saved.judges||{})}};
  }catch(e){}
}
function saveSettings(){
  app.settings.adminPin=document.getElementById('adminPinSetting')?.value||app.settings.adminPin||'0000';
  app.settings.judgeCount=Number(document.getElementById('judgeCount')?.value||app.settings.judgeCount||3);
  app.settings.topCount=Number(document.getElementById('topCount')?.value||app.settings.topCount||16);
  getJudgeCircles().forEach(c=>{
    app.settings.judges[c] ||= {name:'',pin:''};
    app.settings.judges[c].name=document.getElementById(`judgeName_${c}`)?.value ?? app.settings.judges[c].name;
    app.settings.judges[c].pin=document.getElementById(`judgePin_${c}`)?.value ?? app.settings.judges[c].pin;
  });
  saveLocalSettings();
  renderJudgeSettings();
  renderJudgeLoginOptions();
  renderAllAdminViews();
}
async function refreshScoresOnly(){
  app.scores=await fetchScores();
  app.logs=await fetchLogs();
  renderAllAdminViews();
}
async function loadParticipants(){
  app.participants=await fetchParticipants();
  renderPreview();
}
async function refreshAll(){
  app.participants=await fetchParticipants();
  app.scores=await fetchScores();
  app.logs=await fetchLogs();
  renderPreview();
  renderAllAdminViews();
}
window.addEventListener('load',async()=>{
  loadLocalSettings();
  renderJudgeLoginOptions();
  initSupabase();
  await testConnection();
  await refreshAll();
  subscribeRealtime();
  renderManualSeedInputs();
  renderManualBracket();
  if('serviceWorker' in navigator){
    navigator.serviceWorker.register('./sw.js').catch(()=>{});
  }
});
