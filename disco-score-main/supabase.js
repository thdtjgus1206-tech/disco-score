
let dppSupabase = null;

function initSupabase(){
  dppSupabase = window.supabase.createClient(DPP_CONFIG.supabaseUrl, DPP_CONFIG.supabaseKey);
  return dppSupabase;
}

function setOnlineStatus(text, ok=true){
  const pill=document.getElementById('onlinePill');
  const status=document.getElementById('syncStatus');
  if(pill){
    pill.textContent=text;
    pill.classList.toggle('offline', !ok);
  }
  if(status) status.textContent=text;
}

async function testConnection(){
  try{
    const { error } = await dppSupabase.from('dpp_scores').select('id').limit(1);
    if(error) throw error;
    setOnlineStatus('ONLINE', true);
  }catch(e){
    console.error(e);
    setOnlineStatus('CONNECTION ERROR: '+e.message, false);
  }
}

async function fetchParticipants(){
  const { data, error } = await dppSupabase
    .from('dpp_participants')
    .select('*')
    .eq('event_id', DPP_CONFIG.eventId)
    .order('participant_order', { ascending:true });
  if(error){ console.error(error); return []; }
  return data || [];
}

async function fetchScores(){
  const { data, error } = await dppSupabase
    .from('dpp_scores')
    .select('*')
    .eq('event_id', DPP_CONFIG.eventId)
    .order('updated_at', { ascending:false });
  if(error){ console.error(error); return []; }
  return data || [];
}

async function fetchLogs(){
  const { data, error } = await dppSupabase
    .from('dpp_logs')
    .select('*')
    .eq('event_id', DPP_CONFIG.eventId)
    .order('created_at', { ascending:false })
    .limit(50);
  if(error){ console.error(error); return []; }
  return data || [];
}

async function upsertParticipants(rows){
  const { error } = await dppSupabase
    .from('dpp_participants')
    .upsert(rows, { onConflict:'event_id,participant_order' });
  if(error) throw error;
}

async function upsertScores(rows){
  const { error } = await dppSupabase
    .from('dpp_scores')
    .upsert(rows, { onConflict:'event_id,judge_circle,participant_order' });
  if(error) throw error;
}

async function upsertOneScore(row){
  const { error } = await dppSupabase
    .from('dpp_scores')
    .upsert(row, { onConflict:'event_id,judge_circle,participant_order' });
  if(error) throw error;

  await dppSupabase.from('dpp_logs').insert({
    event_id:row.event_id,
    judge_circle:row.judge_circle,
    judge_name:row.judge_name,
    participant_order:row.participant_order,
    participant_group:row.participant_group,
    participant_name:row.participant_name,
    battle_name:row.battle_name,
    score:row.score,
    action:'score'
  });
}

function subscribeRealtime(){
  dppSupabase.channel('dpp-realtime')
    .on('postgres_changes',{event:'*',schema:'public',table:'dpp_scores'}, async ()=>{
      await refreshScoresOnly();
    })
    .on('postgres_changes',{event:'*',schema:'public',table:'dpp_participants'}, async ()=>{
      await refreshAll();
    })
    .on('postgres_changes',{event:'*',schema:'public',table:'dpp_logs'}, async ()=>{
      app.logs=await fetchLogs();
      renderAllAdminViews();
    })
    .subscribe();
}
