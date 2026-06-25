const app={
  settings:{scoreType:'circle',circleCount:3,judgeCount:3,topCount:6,eventName:'D.I.S.C.O',judgeNames:{}},
  dancers:[],
  scores:{},
  currentJudge:0,
  currentIndex:0,
  input:'',
  selectedCircle:null,
  activeIndices:[],
  eventId:null,
  liveView:'current'
};
let isLoggedIn=false;
let pendingAction=null;

function el(id){return document.getElementById(id)}
function clean(s){return String(s??'').replace(/\uFEFF/g,'').trim()}
function escapeHtml(s){return String(s??'').replace(/[&<>"]/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;'}[c]))}
function escapeJs(s){return String(s??'').replace(/\\/g,'\\\\').replace(/'/g,"\\'")}
function capitalize(s){return s.charAt(0).toUpperCase()+s.slice(1)}
function circles(){return Array.from({length:app.settings.circleCount},(_,i)=>String.fromCharCode(65+i))}
function judgeCircleForIndex(judgeIndex){return circles()[judgeIndex]||String.fromCharCode(65+judgeIndex)}
function judgeNameForIndex(judgeIndex){
  const c=judgeCircleForIndex(judgeIndex);
  return app.settings.judgeNames?.[c] || `${c}서클 져지`;
}
function participantGroupLabel(d){return d.circle||''}
function orderCircle(order){const m=clean(order).match(/^([A-Z])/i);return m?m[1].toUpperCase():''}
function orderNum(order){const m=clean(order).match(/(\d+)\s*$/);return m?parseInt(m[1],10):999999}
function orderSide(order){return clean(order).includes('나')?1:0}
function orderCompare(a,b){return a.circle.localeCompare(b.circle)||orderSide(a.order)-orderSide(b.order)||orderNum(a.order)-orderNum(b.order)}
function isPhoneLike(s){s=clean(s);return /^(\+?\d[\d\s\-–]{6,}|\d{4,})$/.test(s)}
function isContactLike(s){s=clean(s);return isPhoneLike(s)||s.includes('@')||s.includes('.com')}
function isOrderToken(s){return /^[A-Z]-(?:나-)?\d+$/i.test(clean(s).replace(/\s+/g,''))}
function fixOrder(s){return clean(s).replace(/\s+/g,'').replace(/^([a-z])-/,(_,a)=>a.toUpperCase()+'-')}

function decodeCsvBuffer(buffer){
  const u8=new Uint8Array(buffer);
  if(u8[0]===0xEF&&u8[1]===0xBB&&u8[2]===0xBF)return new TextDecoder('utf-8').decode(u8);
  const utf8=new TextDecoder('utf-8',{fatal:false}).decode(u8);
  const bad=(utf8.match(/\uFFFD/g)||[]).length;
  return bad>0?new TextDecoder('euc-kr').decode(u8):utf8;
}

function updateLoginMode(){
  const setup=!isPinCreated();
  const data=authData();
  el('loginGuide').textContent=setup?'처음 실행이야. 관리자 이름과 PIN을 직접 만들어줘.':'관리자 PIN으로 로그인해줘.';
  el('loginButton').textContent=setup?'CREATE & LOGIN':'LOGIN';
  el('resetPinButton').style.display=setup?'none':'block';
  if(data?.adminName&&!el('loginId').value)el('loginId').value=data.adminName;
  el('loginPw').value='';
}
function requireLogin(action){
  if(isLoggedIn){runAction(action);return}
  pendingAction=action;
  el('loginError').textContent='';
  updateLoginMode();
  go('login');
}
function runAction(action){
  if(action==='admin')go('admin');
  else if(action==='score')startScoring();
  else go('home');
}
async function attemptLogin(){
  const adminName=el('loginId').value.trim();
  const pin=el('loginPw').value.trim();
  el('loginError').textContent='';
  if(!adminName){el('loginError').textContent='관리자 이름을 입력해줘.';return}
  if(pin.length<4){el('loginError').textContent='PIN은 4자리 이상으로 입력해줘.';return}

  const data=authData();
  const pinHash=await hashPin(pin);

  if(!data?.pinHash){
    saveAuthData({adminName,pinHash,createdAt:new Date().toISOString()});
    isLoggedIn=true;
  }else{
    if(pinHash!==data.pinHash){el('loginError').textContent='PIN이 올바르지 않아.';return}
    isLoggedIn=true;
  }

  if(!app.eventId)app.eventId='event_'+Date.now();
  saveCurrentEvent();
  const action=pendingAction||'admin';
  pendingAction=null;
  runAction(action);
}
function resetPin(){
  if(confirm('이 태블릿에 저장된 PIN을 초기화할까? 행사 저장 데이터는 유지돼.')){
    localStorage.removeItem(AUTH_STORE);
    isLoggedIn=false;
    updateLoginMode();
    el('loginError').textContent='PIN이 초기화됐어. 새 PIN을 만들어줘.';
  }
}
function cancelLogin(){pendingAction=null;go('home')}
function logout(){isLoggedIn=false;go('home')}

function go(id){
  document.querySelectorAll('.screen').forEach(s=>s.classList.remove('active'));
  el(id).classList.add('active');
  if(id==='home')renderHomeCircles();
  if(id==='score')renderScore();
  if(id==='results')renderResults();
  if(id==='admin'){renderJudgeNameInputs();renderLiveRanking();}
  if(id==='mypage')renderHistory();
  renderJudgeNameInputs();
}

function setScoreType(type, shouldSave=true){
  app.settings.scoreType=type;
  el('typeCircle').classList.toggle('active',type==='circle');
  el('typeAll').classList.toggle('active',type==='all');
  if(type==='circle')el('judgeCount').value=el('circleCount').value||3;
  syncSettings();
  renderHomeCircles();
  if(shouldSave)saveCurrentEvent();
}
function syncSettings(){
  app.settings.circleCount=Math.min(26,Math.max(1,parseInt(el('circleCount').value||'1')));
  app.settings.judgeCount=Math.max(1,parseInt(el('judgeCount').value||'1'));
  app.settings.topCount=Math.max(1,parseInt(el('topCount').value||'1'));
  app.settings.eventName=el('eventName').value||'D.I.S.C.O';
  if(app.settings.scoreType==='circle')app.settings.judgeCount=Math.max(1,app.settings.circleCount);
  if(!app.settings.judgeNames)app.settings.judgeNames={};
  circles().forEach(c=>{if(app.settings.judgeNames[c]===undefined)app.settings.judgeNames[c]='';});
  el('scoreTitle').textContent=app.settings.eventName+' SCORE';
  renderJudgeTabs();
}

function renderJudgeNameInputs(){
  const box=el('judgeNameInputs');
  if(!box)return;
  if(!app.settings.judgeNames)app.settings.judgeNames={};
  const list=circles();
  box.innerHTML=list.map((c,i)=>{
    const value=escapeHtml(app.settings.judgeNames[c]||'');
    return `<div class="judge-name-box">
      <label>${c}서클 져지 이름</label>
      <input value="${value}" placeholder="${c}서클 져지" oninput="app.settings.judgeNames['${c}']=this.value;saveCurrentEvent();renderLiveRanking()">
    </div>`;
  }).join('');
}

function parseParticipants(rows){
  const allowed=circles();
  const out=[];
  rows.forEach(row=>{
    row=Array.from(row||[]).map(clean);
    row.forEach((cell,idx)=>{
      if(!isOrderToken(cell))return;
      const order=fixOrder(cell);
      const circle=orderCircle(order);
      if(!allowed.includes(circle))return;
      let name='',battle='';
      if(idx>=12){name=row[8]||'';battle=row[9]||''}
      else if(idx>=5){name=row[1]||'';battle=row[2]||''}
      else{
        const prev=row.slice(Math.max(0,idx-5),idx).filter(v=>v&&!isContactLike(v)&&!isOrderToken(v));
        name=prev[0]||'';battle=prev[1]||'';
      }
      if(!name&&!battle)return;
      out.push({order,circle,name,battle});
    });
  });
  const seen=new Set();
  return out.filter(d=>{
    const key=d.order+'|'+d.name+'|'+d.battle;
    if(seen.has(key))return false;
    seen.add(key);
    return true;
  }).sort(orderCompare);
}
function fallbackParse(rows){
  const allowed=circles();
  const header=(rows[0]||[]).map(x=>clean(x).toLowerCase());
  const find=names=>header.findIndex(h=>names.some(n=>h.includes(n)));
  const oi=find(['순서','order','번호','no']);
  const ci=find(['서클','circle','조']);
  const ni=find(['이름','name','댄서','participant']);
  const bi=find(['배틀','battle','닉네임','aka']);
  if(oi<0||ni<0)return [];
  return rows.slice(1).map((r,i)=>{
    const order=clean(r[oi]||i+1);
    const circle=clean(r[ci]||orderCircle(order)).toUpperCase().replace('서클','').trim();
    return {order,circle,name:clean(r[ni]),battle:clean(r[bi])};
  }).filter(d=>(d.name||d.battle)&&allowed.includes(d.circle)).sort(orderCompare);
}
function handleFile(e){
  const file=e.target.files[0];
  if(!file)return;
  el('fileName').textContent=file.name;
  const reader=new FileReader();
  reader.onload=evt=>{
    const buffer=evt.target.result;
    let rows=[];
    if(file.name.toLowerCase().endsWith('.csv')){
      const text=decodeCsvBuffer(buffer);
      const wb=XLSX.read(text,{type:'string'});
      rows=XLSX.utils.sheet_to_json(wb.Sheets[wb.SheetNames[0]],{header:1,defval:'',raw:false});
    }else{
      const wb=XLSX.read(buffer,{type:'array'});
      rows=XLSX.utils.sheet_to_json(wb.Sheets[wb.SheetNames[0]],{header:1,defval:'',raw:false});
    }
    let dancers=parseParticipants(rows);
    if(!dancers.length)dancers=fallbackParse(rows);
    app.dancers=dancers;
    renderPreview();
    renderHomeCircles();
    resetScores(false);
    saveCurrentEvent();
    if(!app.dancers.length)alert('참가자를 읽지 못했어. 관리자 서클 개수와 파일 형식을 확인해줘.');
  };
  reader.readAsArrayBuffer(file);
}
function renderPreview(){
  const body=el('previewBody');
  if(!app.dancers.length){
    body.innerHTML='<tr><td colspan="4" class="empty">참가자 파일을 넣어줘.</td></tr>';
    return;
  }
  body.innerHTML=app.dancers.map(d=>`<tr><td>${escapeHtml(d.order)}</td><td>${escapeHtml(participantGroupLabel(d))}</td><td>${escapeHtml(d.name)}</td><td>${escapeHtml(d.battle)}</td></tr>`).join('');
}
function loadSample(){
  app.dancers=[
    {order:'A-1',circle:'A',name:'권세은',battle:'SEEUN'},
    {order:'A-2',circle:'A',name:'July',battle:'JULY'},
    {order:'A-나-1',circle:'A',name:'리야레지',battle:'RAKUSHI'},
    {order:'B-1',circle:'B',name:'비댄서',battle:'BIPI'},
    {order:'C-1',circle:'C',name:'씨댄서',battle:'CERA'}
  ];
  el('fileName').textContent='예시 참가자 사용 중';
  renderPreview();
  renderHomeCircles();
  resetScores(false);
  saveCurrentEvent();
}
function renderHomeCircles(){
  const box=el('homeCircleButtons');
  if(!box)return;
  box.innerHTML='';
}
function startFromHome(){
  if(app.settings.scoreType==='circle'){
    app.selectedCircle=judgeCircleForIndex(0);
  }else{
    app.selectedCircle=null;
  }
  requireLogin('score');
}
function chooseCircle(c){app.selectedCircle=c;requireLogin('score')}
function chooseAll(){app.selectedCircle=null;requireLogin('score')}

function resetScores(alertUser=true){
  app.scores={};
  app.currentJudge=0;
  app.currentIndex=0;
  app.input='';
  app.dancers.forEach((_,i)=>app.scores[i]=Array(app.settings.judgeCount).fill(null));
  renderScore();
  renderLiveRanking();
  saveCurrentEvent();
  if(alertUser)alert('점수가 초기화됐어.');
}
function ensureScores(){
  app.dancers.forEach((_,i)=>{
    if(!Array.isArray(app.scores[i])||app.scores[i].length!==app.settings.judgeCount){
      app.scores[i]=Array(app.settings.judgeCount).fill(null);
    }
  });
}
function computeActiveIndices(){
  if(app.settings.scoreType==='circle'){
    const c=judgeCircleForIndex(app.currentJudge);
    app.selectedCircle=c;
    app.activeIndices=app.dancers.map((d,i)=>i).filter(i=>participantGroupLabel(app.dancers[i])===c);
  }else{
    app.activeIndices=app.dancers.map((d,i)=>i);
  }
}
function startScoring(){
  syncSettings();
  if(!app.dancers.length){alert('관리자 모드에서 참가자 파일을 먼저 업로드해줘.');go('home');return}
  ensureScores();
  computeActiveIndices();
  if(!app.activeIndices.length){alert('선택한 서클 참가자가 없어.');go('home');return}
  app.currentJudge=0;
  app.currentIndex=0;
  app.input='';
  saveCurrentEvent();
  go('score');
}
function renderJudgeTabs(){
  const tabs=el('judgeTabs');
  if(!tabs)return;
  tabs.innerHTML='';
  const count=app.settings.scoreType==='circle'?app.settings.judgeCount:app.settings.judgeCount;
  for(let i=0;i<count;i++){
    const c=judgeCircleForIndex(i);
    const b=document.createElement('button');
    b.className='judge-tab '+(i===app.currentJudge?'active':'');
    if(app.settings.scoreType==='circle'){
      b.innerHTML=`<span class="judge-tab-circle">${c} JUDGE</span><span class="judge-tab-name">${escapeHtml(judgeNameForIndex(i))}</span>`;
    }else{
      b.innerHTML=`<span class="judge-tab-circle">JUDGE ${i+1}</span><span class="judge-tab-name">${escapeHtml(judgeNameForIndex(i))}</span>`;
    }
    b.onclick=()=>{
      app.currentJudge=i;
      app.currentIndex=0;
      app.input='';
      computeActiveIndices();
      renderScore();
    };
    tabs.appendChild(b);
  }
}
function renderScore(){
  syncSettings();
  renderJudgeTabs();
  if(app.settings.scoreType==='circle')computeActiveIndices();
  const indices=app.activeIndices||[];
  const origIdx=indices[app.currentIndex];
  const d=origIdx!==undefined?app.dancers[origIdx]:null;
  el('bar').style.width=(((app.currentIndex+1)/(indices.length||1))*100)+'%';
  el('circleTag').textContent=app.settings.scoreType==='circle'?(`${judgeCircleForIndex(app.currentJudge)} CIRCLE · ${judgeNameForIndex(app.currentJudge)}`):'ALL CIRCLES';

  if(!d){
    el('dancerName').textContent='NO DANCER';
    el('battleName').textContent='참가자를 불러와줘.';
    el('scoreDisplay').textContent='0';
    if(el('judgeNameLine'))el('judgeNameLine').textContent='';
    return;
  }
  el('orderBadge').textContent='ORDER '+d.order;
  el('circleBadge').textContent='GROUP '+participantGroupLabel(d);
  el('judgeBadge').textContent=app.settings.scoreType==='circle'
    ? (judgeCircleForIndex(app.currentJudge)+' JUDGE')
    : ('JUDGE '+(app.currentJudge+1));
  const judgeNameNode=el('judgeNameLine');
  if(judgeNameNode){
    judgeNameNode.textContent=app.settings.scoreType==='circle'
      ? judgeNameForIndex(app.currentJudge)
      : judgeNameForIndex(app.currentJudge);
  }
  el('dancerName').textContent=d.battle||d.name||'NO NAME';
  el('battleName').textContent=d.name?'REAL NAME · '+d.name:'';
  const saved=app.scores[origIdx]?.[app.currentJudge];
  el('scoreDisplay').textContent=app.input||(saved!==null&&saved!==undefined?saved:'0');
}
function tap(v){
  if(v==='.'&&app.input.includes('.'))return;
  if(app.input.length>=5)return;
  if(app.input==='0'&&v!=='.')app.input='';
  app.input+=v;
  el('scoreDisplay').textContent=app.input;
}
function backspace(){
  app.input=app.input.slice(0,-1);
  el('scoreDisplay').textContent=app.input||'0';
}
function clearScore(){
  app.input='';
  el('scoreDisplay').textContent='0';
}
function saveAndNext(){
  const indices=app.activeIndices||[];
  const origIdx=indices[app.currentIndex];
  const value=parseFloat(app.input||el('scoreDisplay').textContent);
  if(isNaN(value)){alert('점수를 입력해줘.');return}
  app.scores[origIdx][app.currentJudge]=value;
  app.input='';
  saveCurrentEvent();
  renderLiveRanking();
  nextDancer();
}
function nextDancer(){
  const indices=app.activeIndices||[];
  if(app.currentIndex<indices.length-1){
    app.currentIndex++;
    app.input='';
    renderScore();
  }else if(app.currentJudge<app.settings.judgeCount-1){
    app.currentJudge++;
    app.currentIndex=0;
    app.input='';
    computeActiveIndices();
    renderScore();
  }else{
    showResults();
  }
}
function prevDancer(){
  if(app.currentIndex>0)app.currentIndex--;
  else if(app.currentJudge>0){
    app.currentJudge--;
    app.currentIndex=(app.activeIndices||[]).length-1;
  }
  app.input='';
  if(app.settings.scoreType==='circle')computeActiveIndices();
  renderScore();
}
function showResults(){
  renderResults();
  saveCurrentEvent();
  go('results');
}

window.addEventListener('load',()=>{
  renderPreview();
  renderHomeCircles();
  syncSettings();
  renderHistory();
  if('serviceWorker' in navigator){
    navigator.serviceWorker.register('./sw.js').catch(()=>{});
  }
});