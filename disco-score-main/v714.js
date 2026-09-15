/* D.I.S.C.O Preliminary Program V7.14 Integrated Stability */
const V714 = {
  version:'7.14',
  deviceId:(()=>{const k='DPP_DEVICE_ID';let v=localStorage.getItem(k);if(!v){v=(crypto.randomUUID?.()||('dev-'+Date.now()+'-'+Math.random().toString(16).slice(2)));localStorage.setItem(k,v);}return v;})(),
  lastSync:null,
  busy:false,
  randomRaw:[],
  randomAssigned:[],
  assignmentVersion:0
};

function v714Now(){ return new Date().toISOString(); }
function v714SetSync(ok=true){
  V714.lastSync=new Date();
  const n=$('lastSyncAt');
  if(n) n.textContent=`마지막 서버 확인 ${V714.lastSync.toLocaleTimeString('ko-KR')} · ${ok?'정상':'오류'}`;
}
function v714ScorePresent(v){ return v!==null && v!==undefined && v!=='' && Number.isFinite(Number(v)); }
function v714ExpectedPairs(){
  const pairs=[];
  circles().forEach(c=>S.participants.forEach(p=>{ if(mode()==='all'||p.participant_circle===c) pairs.push({judge:c,order:p.participant_order,name:p.battle_name||p.participant_name||'-',circle:p.participant_circle}); }));
  return pairs;
}
function v714CompletionReport(){
  const saved=new Map(scoreRows().filter(r=>v714ScorePresent(r.score)).map(r=>[`${r.judge_circle}|${r.participant_order}`,r]));
  const missing=v714ExpectedPairs().filter(x=>!saved.has(`${x.judge}|${x.order}`));
  const byJudge={}; circles().forEach(c=>byJudge[c]={expected:0,done:0,missing:[]});
  v714ExpectedPairs().forEach(x=>{byJudge[x.judge].expected++; if(saved.has(`${x.judge}|${x.order}`))byJudge[x.judge].done++; else byJudge[x.judge].missing.push(x);});
  return {complete:missing.length===0,missing,byJudge,expected:v714ExpectedPairs().length,done:saved.size};
}
async function v714FetchCompletionReport(){
  S.participants=await fetchParticipants();
  S.scores=await fetchScores();
  v714SetSync(true);
  return v714CompletionReport();
}
function v714MissingHtml(report){
  return circles().map(c=>{
    const j=report.byJudge[c]; const names=j.missing.slice(0,12).map(x=>`${esc(x.order)} ${esc(x.name)}`).join(', ');
    return `<div class="completion-card ${j.done===j.expected?'ok':'bad'}"><b>${c} JUDGE</b><span>${j.done}/${j.expected}</span><small>${j.missing.length?`누락 ${j.missing.length}명 · ${names}${j.missing.length>12?' 외':''}`:'모든 점수 서버 저장 완료'}</small></div>`;
  }).join('');
}
async function v714RefreshCompletion(showMessage=false){
  try{
    const report=await v714FetchCompletionReport();
    const box=$('completionDetails'); if(box) box.innerHTML=v714MissingHtml(report);
    const btn=$('round2ConfirmBtn');
    if(btn && !isRound2ActivePhase()){
      btn.disabled=!report.complete || V714.busy || !S.round2Preview.length;
      btn.title=!report.complete?`서버 저장이 끝나지 않은 점수 ${report.missing.length}건`:(!S.round2Preview.length?'2차 명단을 먼저 만들어 주세요':'');
    }
    if(showMessage) alert(report.complete?'모든 져지 점수가 서버에 저장됐어.':`아직 서버에 저장되지 않은 점수가 ${report.missing.length}건 있어. 아래 누락 목록을 확인해줘.`);
    return report;
  }catch(e){v714SetSync(false); if(showMessage)alert('서버 완료 상태 확인 오류: '+e.message); throw e;}
}

async function v714Retry(fn,{tries=3,delay=700}={}){
  let last; for(let i=0;i<tries;i++){try{return await fn();}catch(e){last=e;if(i<tries-1)await new Promise(r=>setTimeout(r,delay*(i+1)));}} throw last;
}

/* 10명 저장: 저장 후 서버에 정확히 들어갔는지 재검증 */
confirmBatchScores=async function(){
  if(V714.busy)return;
  if(!navigator.onLine){ alert('인터넷 연결 후 점수를 확정해줘. 입력한 점수는 이 기기에 임시 저장돼 있어.'); return; }
  const inputs=[...document.querySelectorAll('#batchReviewList input[data-order]')];
  const values={};
  for(const input of inputs){
    const raw=String(input.value).trim(); const v=Number(raw);
    if(raw===''||!Number.isFinite(v)||v<0||v>1000){alert(`${input.dataset.order} 점수를 확인해줘. 허용 범위는 0~1000이야.`);input.focus();return;}
    values[input.dataset.order]=v;
  }
  const btn=$('confirmBatchBtn'); V714.busy=true; btn.disabled=true; btn.textContent='서버 저장·검증 중...';
  try{
    const now=v714Now();
    const rows=S.reviewRows.map(item=>({...item,event_id:DPP_CONFIG.eventId,score_mode:mode(),judge_circle:S.judge,judge_name:judgeName(S.judge),score:values[item.participant_order],updated_at:now})).map(({draft_score,...r})=>r);
    rows.forEach(putPending);
    await v714Retry(async()=>{const {error}=await sb.from('dpp_scores').upsert(rows,{onConflict:'event_id,score_mode,judge_circle,participant_order'});if(error)throw error;});
    const orders=rows.map(r=>r.participant_order);
    const {data:verified,error:verifyError}=await sb.from('dpp_scores').select('participant_order,score').eq('event_id',DPP_CONFIG.eventId).eq('score_mode',mode()).eq('judge_circle',S.judge).in('participant_order',orders);
    if(verifyError)throw verifyError;
    const map=new Map((verified||[]).map(r=>[r.participant_order,Number(r.score)]));
    const failed=rows.filter(r=>!map.has(r.participant_order)||map.get(r.participant_order)!==Number(r.score));
    if(failed.length)throw new Error(`서버 저장 확인 실패: ${failed.map(x=>x.participant_order).join(', ')}`);
    const logs=rows.map(r=>({event_id:r.event_id,score_mode:r.score_mode,judge_circle:r.judge_circle,judge_name:r.judge_name,participant_order:r.participant_order,participant_circle:r.participant_circle,participant_name:r.participant_name,battle_name:r.battle_name,score:r.score,action:'score_verified'}));
    const {error:logError}=await sb.from('dpp_logs').insert(logs); if(logError)console.warn(logError);
    removePending(rows); clearBatchDraftsForOrders(orders);
    await refreshScoresOnly(); v714SetSync(true);
    const next=S.batchStart+S.reviewRows.length;
    if(next>=S.queue.length){S.index=Math.max(0,S.queue.length-1);alert('전체 채점이 서버에 저장되고 확인됐어! 관리자 화면은 자동 동기화돼.');}else S.index=next;
    S.input='';S.reviewRows=[];show('score');renderScore();
  }catch(e){console.error(e);updateOfflineStatus();alert('점수 저장 오류: '+e.message+'\n\n점수는 기기에 남아 있어. 인터넷 확인 후 다시 눌러줘.');}
  finally{V714.busy=false;btn.disabled=false;btn.textContent='CONFIRM & UPLOAD / 점수 확정';}
};

/* 관리자만 한 번 누르는 원자적 2차 전환 */
startRound2=async function(){
  if(S.role!=='admin'){alert('라운드 전환은 관리자 노트북에서만 할 수 있어.');return;}
  if(V714.busy)return;
  if(isRound2ActivePhase()){await restoreConfirmedRound2List({showAlert:true});return;}
  if(!S.round2Preview.length){const restored=await restoreRound2Selection({showAlert:false});if(!restored){alert('먼저 2차 진출 명단을 만들어줘.');return;}}
  renumberRound2Preview();
  const report=await v714RefreshCompletion(false);
  if(!report.complete){alert(`2차 채점을 열 수 없어. 서버에 저장되지 않은 점수가 ${report.missing.length}건 있어.\n\n관리자 화면의 누락 목록을 확인해줘.`);return;}
  if(!confirm(`현재 편집한 ${S.round2Preview.length}명을 최종 확정하고 2차 채점을 열까?\n\n관리자 노트북에서 한 번만 누르면 져지 태블릿은 자동으로 전환돼.`))return;
  V714.busy=true; const btn=$('round2ConfirmBtn'); if(btn){btn.disabled=true;btn.textContent='서버에서 안전하게 전환 중...';}
  try{
    await saveRound2Selections('confirmed');
    const {data,error}=await sb.rpc('dpp_activate_round2_v714',{p_event_id:DPP_CONFIG.eventId,p_device_id:V714.deviceId});
    if(error)throw new Error(error.message+'\nV7.14 필수 SQL 실행 여부를 확인해줘.');
    if(!data?.ok)throw new Error(data?.message||'2차 전환 실패');
    await loadSettings();await refreshAll();v714SetSync(true);renderAdmin();
    alert(`2차 예선 오픈 완료 · ${data.participant_count||S.round2Preview.length}명\n져지 태블릿은 자동으로 새 명단을 불러와.`);
  }catch(e){console.error(e);await loadSettings().catch(()=>{});setStatus('2차 전환 오류',false);alert('2차 전환 오류: '+e.message+'\n\n기존 1차 데이터는 서버 트랜잭션으로 보호돼. 상태 확인 후 다시 시도해줘.');}
  finally{V714.busy=false;if(btn){btn.textContent='명단 최종 확정 · 2차 채점 열기';}await v714RefreshCompletion(false).catch(()=>{});}
};

/* 진행 화면 확장 */
const v714OriginalRenderProgress=renderProgress;
renderProgress=function(){
  v714OriginalRenderProgress();
  const report=v714CompletionReport();
  const box=$('completionDetails');if(box)box.innerHTML=v714MissingHtml(report);
  const sync=$('lastSyncAt');if(sync&&V714.lastSync)sync.textContent=`마지막 서버 확인 ${V714.lastSync.toLocaleTimeString('ko-KR')}`;
};

/* 랜덤 A/B/C 배정 */
function v714NormalizeKey(k){return String(k||'').trim().toLowerCase().replace(/[\s_.-]/g,'');}
function v714Pick(row,names){for(const [k,v] of Object.entries(row)){if(names.some(n=>v714NormalizeKey(n)===v714NormalizeKey(k))&&v!==undefined&&v!==null)return String(v).trim();}return '';}
function v714ParseRandomRow(row,index){
  const battle=v714Pick(row,['댄서네임','배틀네임','battle_name','battlename','dancername','닉네임','활동명','이름']);
  const name=v714Pick(row,['본명','성명','real_name','realname','name']);
  return {sourceIndex:index+1,battle_name:battle||name,participant_name:name};
}
function v714Shuffle(items){const a=[...items];for(let i=a.length-1;i>0;i--){const j=Math.floor(Math.random()*(i+1));[a[i],a[j]]=[a[j],a[i]];}return a;}
function randomAssignParticipants(){
  if(!V714.randomRaw.length)return;
  const shuffled=v714Shuffle(V714.randomRaw);const base=Math.floor(shuffled.length/3),rem=shuffled.length%3;const sizes={A:base,B:base,C:base};v714Shuffle(circles()).slice(0,rem).forEach(c=>sizes[c]++);
  const slots=v714Shuffle(circles().flatMap(c=>Array(sizes[c]).fill(c))),counts={A:0,B:0,C:0};
  V714.randomAssigned=shuffled.map((p,i)=>{const c=slots[i];counts[c]++;return {...p,participant_circle:c,participant_order:`${c}-${counts[c]}`,scoring_order:i+1};});
  V714.assignmentVersion=Date.now();renderRandomAssignment();
}
function renderRandomAssignment(){
  const box=$('randomPreview');if(!box)return;const rows=V714.randomAssigned;
  $('randomSummary').textContent=rows.length?`${rows.length}명 · A ${rows.filter(x=>x.participant_circle==='A').length} / B ${rows.filter(x=>x.participant_circle==='B').length} / C ${rows.filter(x=>x.participant_circle==='C').length}`:'0명';
  box.innerHTML=rows.length?rows.map(r=>`<tr><td>${r.scoring_order}</td><td>${esc(r.participant_order)}</td><td>${esc(r.battle_name)}</td><td>${esc(r.participant_name)}</td></tr>`).join(''):'<tr><td colspan="4" class="empty">원본 명단을 올린 뒤 랜덤 배정을 눌러줘.</td></tr>';
  ['randomAssignBtn','randomRerollBtn'].forEach(id=>{if($(id))$(id).disabled=!V714.randomRaw.length;});['randomApplyBtn','randomExcelBtn','randomZipBtn'].forEach(id=>{if($(id))$(id).disabled=!rows.length;});
}
async function handleRandomSourceFile(e){
  const file=e.target.files[0];if(!file)return;
  const data=await file.arrayBuffer();const wb=XLSX.read(data,{type:'array'});const ws=wb.Sheets[wb.SheetNames[0]];const rows=XLSX.utils.sheet_to_json(ws,{defval:'',raw:false});
  V714.randomRaw=rows.map(v714ParseRandomRow).filter(x=>x.battle_name||x.participant_name);V714.randomAssigned=[];$('randomFileName').textContent=`${file.name} · ${V714.randomRaw.length}명`;renderRandomAssignment();
}
async function applyRandomAssignment(){
  if(!V714.randomAssigned.length)return;if(!confirm(`랜덤 배정 ${V714.randomAssigned.length}명을 현재 1차 참가자 명단으로 저장할까? 기존 참가자와 점수는 초기화돼.`))return;
  if(roundPhase()!=='round1_scoring'){alert('랜덤 명단 적용은 1차 예선 상태에서만 가능해.');return;}
  V714.busy=true;
  try{
    S.settings.isReady=false;await saveSettings();
    await sb.from('dpp_logs').delete().eq('event_id',DPP_CONFIG.eventId);await sb.from('dpp_scores').delete().eq('event_id',DPP_CONFIG.eventId);await sb.from('dpp_participants').delete().eq('event_id',DPP_CONFIG.eventId);
    const rows=V714.randomAssigned.map(r=>({event_id:DPP_CONFIG.eventId,participant_order:r.participant_order,participant_circle:r.participant_circle,participant_name:r.participant_name,battle_name:r.battle_name,updated_at:v714Now()}));
    const {error}=await sb.from('dpp_participants').insert(rows);if(error)throw error;await refreshAll();alert('랜덤 배정 명단을 저장했어. 이제 심사 준비 버튼을 눌러 점수표를 생성해줘.');
  }catch(e){alert('랜덤 명단 저장 오류: '+e.message);}finally{V714.busy=false;}
}
function downloadRandomExcel(){
  const rows=V714.randomAssigned.map(r=>({'채점 순서':r.scoring_order,'참가번호':r.participant_order,'서클':r.participant_circle,'댄서네임':r.battle_name,'본명':r.participant_name,'배정버전':V714.assignmentVersion}));
  const wb=XLSX.utils.book_new();XLSX.utils.book_append_sheet(wb,XLSX.utils.json_to_sheet(rows),'전체 명단');circles().forEach(c=>XLSX.utils.book_append_sheet(wb,XLSX.utils.json_to_sheet(rows.filter(r=>r['서클']===c)),`${c} CIRCLE`));XLSX.writeFile(wb,`DISCO_V714_랜덤배정_${V714.assignmentVersion}.xlsx`);
}
async function downloadRandomImagesZip(){
  if(typeof JSZip==='undefined'){alert('ZIP 라이브러리를 불러오지 못했어. 인터넷 연결 후 다시 시도해줘.');return;}
  const zip=new JSZip();const stage=$('randomPosterStage');
  for(const c of circles()){
    const list=V714.randomAssigned.filter(x=>x.participant_circle===c).sort((a,b)=>compareParticipantOrder(a.participant_order,b.participant_order));const per=24,total=Math.max(1,Math.ceil(list.length/per));
    for(let page=0;page<total;page++){
      const part=list.slice(page*per,(page+1)*per);stage.innerHTML=`<div class="random-poster"><h2>${c} CIRCLE</h2><p>PRELIMINARY PARTICIPANT LIST</p><div>${part.map(x=>`<span><b>${esc(x.participant_order)}</b>${esc(x.battle_name)}</span>`).join('')}</div><footer>D.I.S.C.O · ${page+1}/${total}</footer></div>`;
      const canvas=await html2canvas(stage.firstElementChild,{scale:1,backgroundColor:null,useCORS:true});const blob=await new Promise(r=>canvas.toBlob(r,'image/png'));zip.file(`${c}_CIRCLE_${page+1}of${total}.png`,blob);
    }
  }
  stage.innerHTML='';const blob=await zip.generateAsync({type:'blob'});const a=document.createElement('a');a.href=URL.createObjectURL(blob);a.download='DISCO_V714_CIRCLE_IMAGES.zip';a.click();setTimeout(()=>URL.revokeObjectURL(a.href),1000);
}

/* 실시간 상태 변경: 져지는 관리자 버튼 없이 자동 전환 */
function v714Subscribe(){
  sb.channel('dpp-v714-auto-sync')
   .on('postgres_changes',{event:'UPDATE',schema:'public',table:'dpp_settings',filter:`event_id=eq.${DPP_CONFIG.eventId}`},async payload=>{
      const before=roundPhase();await loadSettings();const after=roundPhase();
      if(S.role==='judge'&&before!==after){
        const pending=getPending();if(pending.length){updateOfflineStatus();alert(`관리자가 ${after==='round2_active'?'2차 채점':'새 단계'}을 열었지만 업로드 대기 점수가 ${pending.length}건 있어. 먼저 저장을 완료해줘.`);return;}
        S.index=0;S.input='';S.reviewRows=[];await buildJudgeQueue(false);show('score');
        if(after==='round2_active')alert('관리자가 2차 채점을 열었어. 새 명단으로 자동 전환됐어.');
      }
      if(S.role==='admin')renderAdmin();
   }).subscribe();
}

window.addEventListener('beforeunload',e=>{if(getPending().length||Object.keys(S.batchDrafts||{}).length){e.preventDefault();e.returnValue='';}});
window.addEventListener('load',()=>{setTimeout(()=>{v714Subscribe();v714SetSync(true);renderRandomAssignment();v714RefreshCompletion(false).catch(()=>{});},700);});
