function scoreValuesFor(index, mode){
  const arr=app.scores[index]||[];
  if(mode==='circle') return [arr[0]];
  return arr.slice(0, app.settings.judgeCount||1);
}

function rankedForIndices(indices, mode='current'){
  const scoreMode = mode==='current'
    ? (app.settings.scoreType==='circle'?'circle':'total')
    : mode;

  const list=indices.map(i=>{
    const d=app.dancers[i];
    const used=scoreValuesFor(i, scoreMode);
    const valid=used.filter(v=>v!==null&&v!==undefined&&v!==''&&!isNaN(parseFloat(v)));
    const total=valid.reduce((s,v)=>s+(parseFloat(v)||0),0);
    const avg=valid.length?total/valid.length:0;
    return {...d,total,avg,scores:used,entered:valid.length,needed:used.length,index:i};
  });

  list.sort((a,b)=>{
    if(b.total!==a.total)return b.total-a.total;
    return orderCompare(a,b);
  });

  return list.map((x,i)=>({...x,rank:i+1}));
}

function getFinalRanked(){
  const top=app.settings.topCount;
  const indices=(app.activeIndices&&app.activeIndices.length)?app.activeIndices:app.dancers.map((_,i)=>i);
  const list=rankedForIndices(indices, app.settings.scoreType==='circle'?'circle':'total');
  const cutoff=list[top-1]?.total;
  return list.map((x,i)=>({...x,cutTie:cutoff!==undefined&&i>=top&&x.total===cutoff}))
             .filter((x,i)=>i<top || x.cutTie);
}

function renderResultItems(targetId, hideScore=false){
  const list=getFinalRanked();
  const box=el(targetId);
  if(!box)return;
  if(!list.length){
    box.innerHTML='<div class="empty">결과가 아직 없어.</div>';
    return;
  }
  box.innerHTML=list.map(x=>{
    const scoreDetail=x.scores.map((s,i)=>`J${i+1}: ${s??'-'}`).join(' · ');
    return `<div class="result-item">
      <div class="rank">#${x.rank}</div>
      <div>
        <div class="name">${escapeHtml(x.battle||x.name)}</div>
        <div class="sub">REAL NAME · ${escapeHtml(x.name||'-')} · ORDER ${escapeHtml(x.order)} · CIRCLE ${escapeHtml(x.circle)}</div>
        ${hideScore?'':`<div class="sub score-line">${scoreDetail}</div>`}
        ${x.cutTie?'<div class="tie-note">커트라인 동점 추가 표기</div>':''}
      </div>
      ${hideScore?'':`<div class="score">${x.total}</div><div class="avg">${x.avg.toFixed(1)}</div>`}
    </div>`;
  }).join('');
}

function setLiveView(view){
  app.liveView=view;
  ['current','circle','total'].forEach(k=>{
    const node=el('liveTab'+capitalize(k));
    if(node)node.classList.toggle('active',k===view);
  });
  renderLiveRanking();
}

function renderLiveRows(list, showAvg){
  const entered=list.filter(x=>x.entered>0);
  if(!entered.length)return '<div class="live-empty">아직 입력된 점수가 없어.</div>';
  return entered.map(x=>{
    const scoreText=x.entered<x.needed?`${x.total} <span style="color:var(--muted);font-size:11px">(${x.entered}/${x.needed})</span>`:`${x.total}`;
    return `<div class="live-rank-row">
      <div class="lr-rank">#${x.rank}</div>
      <div>
        <div class="lr-name">${escapeHtml(x.battle||x.name||'NO NAME')}</div>
        <div class="lr-sub">REAL NAME · ${escapeHtml(x.name||'-')} · ORDER ${escapeHtml(x.order)} · CIRCLE ${escapeHtml(x.circle)}</div>
      </div>
      <div class="lr-score">${scoreText}</div>
      <div class="lr-avg">${showAvg?'AVG '+x.avg.toFixed(1):''}</div>
    </div>`;
  }).join('');
}

function renderLiveRanking(){
  const box=el('liveRankList');
  const info=el('liveRankInfo');
  if(!box)return;

  if(!app.dancers.length){
    box.innerHTML='<div class="live-empty">참가자 파일을 먼저 업로드해줘.</div>';
    if(info)info.textContent='참가자 데이터 없음';
    return;
  }

  const view=app.liveView||'current';
  ['current','circle','total'].forEach(k=>{
    const node=el('liveTab'+capitalize(k));
    if(node)node.classList.toggle('active',k===view);
  });

  const allowed=circles();

  if(view==='current'){
    if(app.settings.scoreType==='circle'){
      const c=app.selectedCircle||allowed[0]||'A';
      const indices=app.dancers.map((d,i)=>i).filter(i=>app.dancers[i].circle===c);
      const list=rankedForIndices(indices,'circle');
      if(info)info.textContent=`현재 모드1 · ${c} CIRCLE · JUDGE 1 기준 실시간 랭킹`;
      box.innerHTML=`<div class="live-rank-group"><div class="live-rank-group-title"><span>${escapeHtml(c)} CIRCLE</span><span>JUDGE 1</span></div>${renderLiveRows(list,false)}</div>`;
    }else{
      const indices=app.dancers.map((d,i)=>i);
      const list=rankedForIndices(indices,'total');
      if(info)info.textContent=`현재 모드2 · 전체 서클 · 져지 ${app.settings.judgeCount}명 합계/평균 실시간 랭킹`;
      box.innerHTML=`<div class="live-rank-group"><div class="live-rank-group-title"><span>ALL CIRCLES TOTAL</span><span>SUM / AVG</span></div>${renderLiveRows(list,true)}</div>`;
    }
    return;
  }

  if(view==='circle'){
    if(info)info.textContent='모드1 조회 · 각 서클별 JUDGE 1 점수 기준 랭킹';
    box.innerHTML=allowed.map(c=>{
      const indices=app.dancers.map((d,i)=>i).filter(i=>app.dancers[i].circle===c);
      const list=rankedForIndices(indices,'circle');
      return `<div class="live-rank-group"><div class="live-rank-group-title"><span>${escapeHtml(c)} CIRCLE</span><span>JUDGE 1</span></div>${renderLiveRows(list,false)}</div>`;
    }).join('');
    return;
  }

  if(view==='total'){
    const list=rankedForIndices(app.dancers.map((d,i)=>i),'total');
    if(info)info.textContent=`모드2 조회 · 져지 ${app.settings.judgeCount}명 점수 합계 + 평균 기준 전체 랭킹`;
    box.innerHTML=`<div class="live-rank-group"><div class="live-rank-group-title"><span>ALL CIRCLES TOTAL</span><span>SUM / AVG</span></div>${renderLiveRows(list,true)}</div>`;
  }
}

function renderResults(){
  const title=app.settings.scoreType==='circle'
    ? `${app.selectedCircle} CIRCLE · JUDGE 1 · TOP ${app.settings.topCount}`
    : `ALL CIRCLES · TOTAL / AVG · TOP ${app.settings.topCount}`;
  el('resultModeTitle').textContent=title;
  el('uploadModeTitle').textContent=title;
  renderResultItems('resultList',false);
  renderResultItems('uploadResultList',true);
}

function downloadCSV(){
  const rows=[['rank','order','circle','name','battle_name','total','average','cutline_tie'],
    ...getFinalRanked().map(x=>[x.rank,x.order,x.circle,x.name,x.battle,x.total,x.avg.toFixed(2),x.cutTie?'Y':''])
  ];
  const csv=rows.map(r=>r.map(v=>`"${String(v??'').replaceAll('"','""')}"`).join(',')).join('\n');
  const blob=new Blob(['\ufeff'+csv],{type:'text/csv;charset=utf-8;'});
  const url=URL.createObjectURL(blob);
  const a=document.createElement('a');
  a.href=url;
  a.download=`DISCO_${app.settings.scoreType==='circle'?app.selectedCircle+'_CIRCLE':'ALL'}_TOP_RESULT.csv`;
  a.click();
  URL.revokeObjectURL(url);
}

function saveCanvas(node,name){
  html2canvas(node,{backgroundColor:'#07070a',scale:2,useCORS:true}).then(canvas=>{
    const a=document.createElement('a');
    a.href=canvas.toDataURL('image/png');
    a.download=name;
    a.click();
  });
}
function saveResultImage(){saveCanvas(el('resultBoard'),'DISCO_FULL_SCORE_RESULT.png')}
function saveUploadImage(){saveCanvas(el('uploadBoard'),'DISCO_UPLOAD_NO_SCORE_RESULT.png')}
