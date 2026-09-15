const STORE = 'DISCO_SCORE_EVENTS_V2';
const AUTH_STORE = 'DISCO_LOCAL_PIN_AUTH_V3';

function getEvents(){
  try{return JSON.parse(localStorage.getItem(STORE)||'[]')}catch(e){return[]}
}
function setEvents(arr){
  localStorage.setItem(STORE,JSON.stringify(arr));
}
async function hashPin(text){
  try{
    if(window.crypto && crypto.subtle){
      const data=new TextEncoder().encode(String(text));
      const hash=await crypto.subtle.digest('SHA-256',data);
      return 'sha256:'+Array.from(new Uint8Array(hash)).map(b=>b.toString(16).padStart(2,'0')).join('');
    }
  }catch(e){}
  let h=2166136261;
  const str=String(text);
  for(let i=0;i<str.length;i++){
    h^=str.charCodeAt(i);
    h+=(h<<1)+(h<<4)+(h<<7)+(h<<8)+(h<<24);
  }
  return 'fallback:'+(h>>>0).toString(16);
}
function authData(){
  try{return JSON.parse(localStorage.getItem(AUTH_STORE)||'null')}catch(e){return null}
}
function saveAuthData(data){
  localStorage.setItem(AUTH_STORE,JSON.stringify(data));
}
function isPinCreated(){
  const d=authData();
  return !!(d && d.pinHash);
}
function saveCurrentEvent(){
  if(!isLoggedIn)return;
  if(!app.eventId)app.eventId='event_'+Date.now();
  const arr=getEvents();
  const data={
    id:app.eventId,
    date:new Date().toLocaleString('ko-KR'),
    settings:app.settings,
    dancers:app.dancers,
    scores:app.scores,
    selectedCircle:app.selectedCircle,
    fileName:el('fileName')?.textContent||''
  };
  const idx=arr.findIndex(x=>x.id===app.eventId);
  if(idx>=0)arr[idx]=data;else arr.unshift(data);
  setEvents(arr.slice(0,30));
  renderHistory();
}
function loadEvent(id){
  const item=getEvents().find(x=>x.id===id);
  if(!item)return;
  app.eventId=item.id;
  app.settings=item.settings;
  app.dancers=item.dancers||[];
  app.scores=item.scores||{};
  app.selectedCircle=item.selectedCircle||null;
  el('circleCount').value=app.settings.circleCount;
  el('judgeCount').value=app.settings.judgeCount;
  el('topCount').value=app.settings.topCount;
  el('eventName').value=app.settings.eventName;
  setScoreType(app.settings.scoreType,false);
  renderPreview();
  renderHomeCircles();
  go('admin');
}
function deleteEvent(id){
  if(!confirm('이 저장 데이터를 삭제할까?'))return;
  setEvents(getEvents().filter(x=>x.id!==id));
  renderHistory();
}
function renderHistory(){
  const box=el('historyList');
  if(!box)return;
  const arr=getEvents();
  if(!arr.length){
    box.innerHTML='<div class="empty">저장된 데이터가 아직 없어.</div>';
    return;
  }
  box.innerHTML=arr.map(x=>`<div class="history-item">
    <div>
      <b>${escapeHtml(x.settings?.eventName||'D.I.S.C.O')}</b>
      <div class="sub">${escapeHtml(x.date)} · ${escapeHtml(x.settings?.scoreType==='circle'?'한 서클 TOP':'전체 합산 TOP')} · 참가자 ${x.dancers?.length||0}명</div>
    </div>
    <div class="top-actions">
      <button class="btn ghost small" onclick="loadEvent('${escapeJs(x.id)}')">LOAD</button>
      <button class="btn ghost small" onclick="deleteEvent('${escapeJs(x.id)}')">DELETE</button>
    </div>
  </div>`).join('');
}