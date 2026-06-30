
function renderManualSeedInputs(){
  const box=document.getElementById('manualSeedInputs');
  if(!box)return;
  box.innerHTML=Array.from({length:16},(_,i)=>{
    const n=i+1;
    const val=localStorage.getItem(`DPP_SEED_${n}`)||'';
    return `<div class="manual-seed-box">
      <label>SEED ${n}</label>
      <input id="seedInput${n}" value="${escapeHtml(val)}" placeholder="직접 입력" oninput="localStorage.setItem('DPP_SEED_${n}',this.value);renderManualBracket()">
    </div>`;
  }).join('');
}
function getSeeds(){
  return Array.from({length:16},(_,i)=>{
    const n=i+1;
    const input=document.getElementById(`seedInput${n}`);
    const name=(input?.value||localStorage.getItem(`DPP_SEED_${n}`)||'').trim();
    return {seed:n,name:name||`시드 ${n} 직접 입력`};
  });
}
function renderManualBracket(){
  const board=document.getElementById('bracketBoard');
  if(!board)return;
  const seeds=getSeeds();
  const pairs=[];
  for(let i=0;i<16;i+=2)pairs.push([seeds[i],seeds[i+1]]);
  board.innerHTML=`<div class="bracket-round-title">TOP 16 MANUAL BRACKET</div>`+pairs.map((p,i)=>`
    <div class="bracket-match">
      <div class="match-no">M${i+1}</div>
      <div class="seed-player"><div class="seed-name">${escapeHtml(p[0].name)}</div><div class="seed-sub">SEED ${p[0].seed}</div></div>
      <div class="vs">VS</div>
      <div class="seed-player"><div class="seed-name">${escapeHtml(p[1].name)}</div><div class="seed-sub">SEED ${p[1].seed}</div></div>
    </div>
  `).join('');
  renderBracketStory();
}
function renderBracketStory(){
  const content=document.getElementById('bracketStoryContent');
  if(!content)return;
  const seeds=getSeeds();
  const pairs=[];
  for(let i=0;i<16;i+=2)pairs.push([seeds[i],seeds[i+1]]);
  content.innerHTML=`<div class="story-top16-grid">`+pairs.map(p=>`
    <div class="story-match">
      <div class="story-player"><div class="story-player-name">${escapeHtml(p[0].name)}</div><div class="story-player-seed">SEED ${p[0].seed}</div></div>
      <div class="story-vs">VS</div>
      <div class="story-player"><div class="story-player-name">${escapeHtml(p[1].name)}</div><div class="story-player-seed">SEED ${p[1].seed}</div></div>
    </div>
  `).join('')+`</div>`;
}
function saveBracketStoryImage(){
  renderManualBracket();
  setTimeout(()=>saveCanvas(document.getElementById('bracketStoryBoard'),'DPP_TOP16_BRACKET_STORY.png',1080,1920),200);
}
function clearBracketSeeds(){
  if(!confirm('시드 입력값을 모두 지울까?'))return;
  for(let i=1;i<=16;i++)localStorage.removeItem(`DPP_SEED_${i}`);
  renderManualSeedInputs();
  renderManualBracket();
}
