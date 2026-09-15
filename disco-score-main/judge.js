function renderJudgeLoginOptions(){
  const s=document.getElementById('judgeCircleSelect');
  if(!s)return;
  const current=s.value || DPP.judgeCircle || 'A';
  s.innerHTML=getJudgeCircles().map(c=>`<option value="${c}">${c} JUDGE</option>`).join('');
  if([...s.options].some(o=>o.value===current)) s.value=current;
}

async function judgeLogin(){
  const select=document.getElementById('judgeCircleSelect');
  const selectedCircle=select ? (select.value || 'A') : 'A';
  const inputPin=document.getElementById('judgePinInput').value.trim();

  await applyRemoteSettings();
  renderJudgeLoginOptions();
  if(select) select.value=selectedCircle;

  const expectedPin=getJudgePin(selectedCircle);
  if(inputPin!==expectedPin){
    document.getElementById('judgeLoginError').textContent=`${selectedCircle} JUDGE PIN이 틀렸어.`;
    return;
  }

  DPP.role='judge';
  DPP.judgeCircle=selectedCircle;
  DPP.judgeName=getJudgeName(selectedCircle);
  DPP.currentIndex=0;
  await loadJudgeParticipants();
  go('score');
}
async function loadJudgeParticipants(show=false){
  await applyRemoteSettings();
  if(!DPP.participants.length)DPP.participants=await fetchParticipants();
  await refreshScoresOnly();

  let rows=scoreRows().filter(s=>s.judge_circle===DPP.judgeCircle&&(currentMode()==='all'||circleOf(s)===DPP.judgeCircle));
  if(!rows.length && DPP.participants.length){
    await createEmptyScores(DPP.participants);
    await refreshScoresOnly();
    rows=scoreRows().filter(s=>s.judge_circle===DPP.judgeCircle&&(currentMode()==='all'||circleOf(s)===DPP.judgeCircle));
  }
  DPP.judgeParticipants=rows.sort((a,b)=>a.participant_order.localeCompare(b.participant_order,'ko'));
  if(show)alert('동기화 완료');
  renderScore();
}
function renderScore(){const list=DPP.judgeParticipants,p=list[DPP.currentIndex];document.getElementById('bar').style.width=(((DPP.currentIndex+1)/(list.length||1))*100)+'%';document.getElementById('circleTag').textContent=`${DPP.judgeCircle} JUDGE · ${currentMode()==='all'?'ALL':'CIRCLE'}`;document.getElementById('judgeBadge').textContent=`${DPP.judgeCircle} JUDGE`;document.getElementById('judgeNameLine').textContent=DPP.judgeName;if(!p){document.getElementById('orderBadge').textContent='ORDER -';document.getElementById('circleBadge').textContent='CIRCLE -';document.getElementById('dancerName').textContent='NO DANCER';document.getElementById('realName').textContent='관리자에게 참가자 업로드 요청';document.getElementById('scoreDisplay').textContent='0';return}document.getElementById('orderBadge').textContent='ORDER '+p.participant_order;document.getElementById('circleBadge').textContent='CIRCLE '+circleOf(p);document.getElementById('dancerName').textContent=p.battle_name||p.participant_name||'NO NAME';document.getElementById('realName').textContent='REAL NAME · '+(p.participant_name||'-');document.getElementById('scoreDisplay').textContent=DPP.input||(p.score??'0')}
function tap(v){if(v==='.'&&DPP.input.includes('.'))return;if(DPP.input.length>=5)return;if(DPP.input==='0'&&v!=='.')DPP.input='';DPP.input+=v;document.getElementById('scoreDisplay').textContent=DPP.input}
function backspace(){DPP.input=DPP.input.slice(0,-1);document.getElementById('scoreDisplay').textContent=DPP.input||'0'}
function clearScore(){DPP.input='';document.getElementById('scoreDisplay').textContent='0'}
async function saveScoreAndNext(){const p=DPP.judgeParticipants[DPP.currentIndex];if(!p){alert('참가자가 없어.');return}const score=Number(DPP.input||document.getElementById('scoreDisplay').textContent);if(Number.isNaN(score)){alert('점수 입력해줘');return}await saveScore({...p,event_id:DPP_CONFIG.eventId,score_mode:currentMode(),judge_circle:DPP.judgeCircle,judge_name:DPP.judgeName,score,updated_at:new Date().toISOString()});DPP.input='';await loadJudgeParticipants(false);nextDancer()}
function nextDancer(){if(DPP.currentIndex<DPP.judgeParticipants.length-1){DPP.currentIndex++;DPP.input='';renderScore()}else{alert('채점 끝');renderScore()}}
function prevDancer(){if(DPP.currentIndex>0){DPP.currentIndex--;DPP.input='';renderScore()}}
