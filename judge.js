
function renderJudgeLoginOptions(){
  const select=document.getElementById('judgeCircleSelect');
  if(!select)return;
  select.innerHTML=getJudgeCircles().map(c=>`<option value="${c}">${c} JUDGE</option>`).join('');
}

async function judgeLogin(){
  const c=document.getElementById('judgeCircleSelect').value;
  const pin=document.getElementById('judgePinInput').value.trim();
  const judge=app.settings.judges[c]||{};
  if(pin!==String(judge.pin||'')){
    document.getElementById('judgeLoginError').textContent='PIN이 틀렸어.';
    return;
  }
  app.role='judge';
  app.judgeCircle=c;
  app.judgeName=judge.name||`${c} JUDGE`;
  app.currentIndex=0;
  await loadJudgeParticipants();
  go('score');
}

async function loadJudgeParticipants(showAlert=false){
  await refreshScoresOnly();
  app.judgeParticipants=app.scores
    .filter(s=>s.judge_circle===app.judgeCircle && s.participant_group===app.judgeCircle)
    .sort((a,b)=>String(a.participant_order).localeCompare(String(b.participant_order),'ko'));
  if(showAlert)alert('동기화 완료');
  renderScore();
}

function renderScore(){
  const list=app.judgeParticipants;
  const p=list[app.currentIndex];
  const bar=document.getElementById('bar');
  if(bar)bar.style.width=(((app.currentIndex+1)/(list.length||1))*100)+'%';

  document.getElementById('circleTag').textContent=`${app.judgeCircle} JUDGE`;
  document.getElementById('judgeBadge').textContent=`${app.judgeCircle} JUDGE`;
  document.getElementById('judgeNameLine').textContent=app.judgeName;

  if(!p){
    document.getElementById('orderBadge').textContent='ORDER -';
    document.getElementById('groupBadge').textContent='GROUP -';
    document.getElementById('dancerName').textContent='NO DANCER';
    document.getElementById('realName').textContent='관리자에게 참가자 업로드를 요청해줘.';
    document.getElementById('scoreDisplay').textContent='0';
    return;
  }

  document.getElementById('orderBadge').textContent='ORDER '+p.participant_order;
  document.getElementById('groupBadge').textContent='GROUP '+p.participant_group;
  document.getElementById('dancerName').textContent=p.battle_name||p.participant_name||'NO NAME';
  document.getElementById('realName').textContent='REAL NAME · '+(p.participant_name||'-');
  document.getElementById('scoreDisplay').textContent=app.input || (p.score ?? '0');
}

function tap(v){
  if(v==='.'&&app.input.includes('.'))return;
  if(app.input.length>=5)return;
  if(app.input==='0'&&v!=='.')app.input='';
  app.input+=v;
  document.getElementById('scoreDisplay').textContent=app.input;
}
function backspace(){
  app.input=app.input.slice(0,-1);
  document.getElementById('scoreDisplay').textContent=app.input||'0';
}
function clearScore(){
  app.input='';
  document.getElementById('scoreDisplay').textContent='0';
}
async function saveScoreAndNext(){
  const p=app.judgeParticipants[app.currentIndex];
  if(!p){alert('참가자가 없어.');return}
  const score=Number(app.input||document.getElementById('scoreDisplay').textContent);
  if(Number.isNaN(score)){alert('점수를 입력해줘.');return}

  const row={
    event_id:DPP_CONFIG.eventId,
    judge_circle:app.judgeCircle,
    judge_name:app.judgeName,
    participant_order:p.participant_order,
    participant_group:p.participant_group,
    participant_name:p.participant_name,
    battle_name:p.battle_name,
    score,
    updated_at:new Date().toISOString()
  };

  await upsertOneScore(row);
  app.input='';
  await loadJudgeParticipants(false);
  nextDancer();
}
function nextDancer(){
  if(app.currentIndex<app.judgeParticipants.length-1){
    app.currentIndex++;
    app.input='';
    renderScore();
  }else{
    alert('이 서클 채점이 끝났어.');
    renderScore();
  }
}
function prevDancer(){
  if(app.currentIndex>0){
    app.currentIndex--;
    app.input='';
    renderScore();
  }
}
