let sb=null;
function initDB(){sb=window.supabase.createClient(DPP_CONFIG.supabaseUrl,DPP_CONFIG.supabaseKey)}
function setOnline(text,ok=true){const a=document.getElementById('onlinePill'),b=document.getElementById('syncStatus');if(a){a.textContent=text;a.classList.toggle('offline',!ok)}if(b)b.textContent=text}
async function testDB(){try{const {error}=await sb.from('dpp_scores').select('id').limit(1);if(error)throw error;setOnline('ONLINE',true)}catch(e){setOnline('DB ERROR: '+e.message,false)}}

async function fetchRemoteSettings(){
  const {data,error}=await sb.from('dpp_settings').select('*').eq('event_id',DPP_CONFIG.eventId).maybeSingle();
  if(error){console.error(error);return null}
  return data;
}
async function saveRemoteSettings(){
  const {error}=await sb.from('dpp_settings').upsert({
    event_id:DPP_CONFIG.eventId,
    scoring_mode:currentMode(),
    judge_count:DPP.settings.judgeCount,
    top_count:DPP.settings.topCount,
    judges:DPP.settings.judges,
    updated_at:new Date().toISOString()
  },{onConflict:'event_id'});
  if(error)console.error(error);
}
async function applyRemoteSettings(){
  const s=await fetchRemoteSettings();
  if(!s)return;
  DPP.settings.scoringMode=s.scoring_mode||DPP.settings.scoringMode;
  DPP.settings.judgeCount=Number(s.judge_count||DPP.settings.judgeCount);
  DPP.settings.topCount=Number(s.top_count||DPP.settings.topCount);
  if(s.judges && typeof s.judges==='object'){
    DPP.settings.judges={...DPP.settings.judges,...s.judges};
  }
  saveLocalSettings();
}

async function fetchParticipants(){const {data,error}=await sb.from('dpp_participants').select('*').eq('event_id',DPP_CONFIG.eventId).order('participant_order');if(error){console.error(error);return[]}return data||[]}
async function fetchScores(){const {data,error}=await sb.from('dpp_scores').select('*').eq('event_id',DPP_CONFIG.eventId).eq('score_mode',currentMode()).order('updated_at',{ascending:false});if(error){console.error(error);return[]}return data||[]}
async function fetchLogs(){const {data,error}=await sb.from('dpp_logs').select('*').eq('event_id',DPP_CONFIG.eventId).eq('score_mode',currentMode()).order('created_at',{ascending:false}).limit(80);if(error){console.error(error);return[]}return data||[]}
async function upsertParticipants(rows){const {error}=await sb.from('dpp_participants').upsert(rows,{onConflict:'event_id,participant_order'});if(error)throw error}
async function upsertScores(rows){const {error}=await sb.from('dpp_scores').upsert(rows,{onConflict:'event_id,score_mode,judge_circle,participant_order'});if(error)throw error}
async function saveScore(row){const {error}=await sb.from('dpp_scores').upsert(row,{onConflict:'event_id,score_mode,judge_circle,participant_order'});if(error)throw error;await sb.from('dpp_logs').insert({...row,action:'score'})}
function subscribeRealtime(){sb.channel('dpp-v4-1').on('postgres_changes',{event:'*',schema:'public',table:'dpp_scores'},refreshScoresOnly).on('postgres_changes',{event:'*',schema:'public',table:'dpp_participants'},refreshAll).on('postgres_changes',{event:'*',schema:'public',table:'dpp_logs'},async()=>{DPP.logs=await fetchLogs();renderAllAdminViews()}).on('postgres_changes',{event:'*',schema:'public',table:'dpp_settings'},async()=>{await applyRemoteSettings();renderJudgeLoginOptions();updateModeUI();await refreshAll();}).subscribe()}
async function refreshScoresOnly(){DPP.scores=await fetchScores();DPP.logs=await fetchLogs();renderAllAdminViews();if(DPP.role==='judge')await loadJudgeParticipants(false)}
async function loadParticipants(){DPP.participants=await fetchParticipants();renderPreview()}
async function refreshAll(){DPP.participants=await fetchParticipants();DPP.scores=await fetchScores();DPP.logs=await fetchLogs();renderPreview();renderAllAdminViews()}
