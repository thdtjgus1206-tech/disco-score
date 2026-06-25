function scoreValuesFor(index, mode){
  const arr=app.scores[index]||[];
  if(mode==='circle') return [arr[app.currentJudge] ?? arr[0]];
  return arr.slice(0, app.settings.judgeCount||1);
}

function scoreValuesForJudge(index, judgeIndex){
  const arr=app.scores[index]||[];
  return [arr[judgeIndex]];
}

function rankedForIndices(indices, mode='current', judgeIndex=null){
  const list=indices.map(i=>{
    const d=app.dancers[i];
    const used = judgeIndex===null ? scoreValuesFor(i, mode) : scoreValuesForJudge(i, judgeIndex);
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

function finalIndices(){
  if(app.settings.scoreType==='circle'){
    return app.dancers.map((d,i)=>i);
  }
  return (app.activeIndices&&app.activeIndices.length)?app.activeIndices:app.dancers.map((_,i)=>i);
}

function getFinalRanked(){
  const top=app.settings.topCount;
  const indices=finalIndices();

  let list;
  if(app.settings.scoreType==='circle'){
    // 모드1 최종은 각 져지별 결과를 합쳐서 보기 위해 현재 져지 기준 대신 전체 합계로 정렬
    list=rankedForIndices(indices,'total');
  }else{
    list=rankedForIndices(indices,'total');
  }

  const cutoff=list[top-1]?.total;
  return list.map((x,i)=>({...x,cutTie:cutoff!==undefined&&i>=top&&x.total===cutoff}))
             .filter((x,i)=>i<top || x.cutTie);
}

function rankClass(rank){
  if(rank===1)return 'gold-rank';
  if(rank===2)return 'silver-rank';
  if(rank===3)return 'bronze-rank';
  return 'dark-rank';
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
    const scoreDetail=x.scores.map((s,i)=>`${judgeCircleForIndex(i)}: ${s??'-'}`).join(' · ');
    return `<div class="result-item">
      <div class="rank ${hideScore?rankClass(x.rank):''}">#${x.rank}</div>
      <div>
        <div class="name">${escapeHtml(x.battle||x.name)}</div>
        <div class="sub">REAL NAME · ${escapeHtml(x.name||'-')} · ORDER ${escapeHtml(x.order)} · GROUP ${escapeHtml(participantGroupLabel(x))}</div>
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
        <div class="lr-sub">REAL NAME · ${escapeHtml(x.name||'-')} · ORDER ${escapeHtml(x.order)} · GROUP ${escapeHtml(participantGroupLabel(x))}</div>
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

  const judgeCircles=circles();

  if(view==='current'){
    if(app.settings.scoreType==='circle'){
      const j=app.currentJudge||0;
      const c=judgeCircleForIndex(j);
      const indices=app.dancers.map((d,i)=>i).filter(i=>participantGroupLabel(app.dancers[i])===c);
      const list=rankedForIndices(indices,'circle',j);
      if(info)info.textContent=`현재 모드1 · ${c}서클 져지 ${judgeNameForIndex(j)} · 담당 ${c}조 랭킹`;
      box.innerHTML=`<div class="live-rank-group"><div class="live-rank-group-title"><span>${escapeHtml(c)}서클 져지</span><span>${escapeHtml(judgeNameForIndex(j))}</span></div>${renderLiveRows(list,false)}</div>`;
    }else{
      const indices=app.dancers.map((d,i)=>i);
      const list=rankedForIndices(indices,'total');
      if(info)info.textContent=`현재 모드2 · 전체 조 · 져지 ${app.settings.judgeCount}명 합계/평균 실시간 랭킹`;
      box.innerHTML=`<div class="live-rank-group"><div class="live-rank-group-title"><span>ALL GROUPS TOTAL</span><span>SUM / AVG</span></div>${renderLiveRows(list,true)}</div>`;
    }
    return;
  }

  if(view==='circle'){
    if(info)info.textContent='모드1 조회 · 져지별 담당 조 랭킹';
    box.innerHTML=judgeCircles.map((c,j)=>{
      const indices=app.dancers.map((d,i)=>i).filter(i=>participantGroupLabel(app.dancers[i])===c);
      const list=rankedForIndices(indices,'circle',j);
      return `<div class="live-rank-group"><div class="live-rank-group-title"><span>${escapeHtml(c)}서클 져지</span><span>${escapeHtml(judgeNameForIndex(j))}</span></div>${renderLiveRows(list,false)}</div>`;
    }).join('');
    return;
  }

  if(view==='total'){
    const list=rankedForIndices(app.dancers.map((d,i)=>i),'total');
    if(info)info.textContent=`모드2 조회 · 져지 ${app.settings.judgeCount}명 점수 합계 + 평균 기준 전체 랭킹`;
    box.innerHTML=`<div class="live-rank-group"><div class="live-rank-group-title"><span>ALL GROUPS TOTAL</span><span>SUM / AVG</span></div>${renderLiveRows(list,true)}</div>`;
  }
}

function renderResults(){
  const title=app.settings.scoreType==='circle'
    ? `JUDGE CIRCLES · TOP ${app.settings.topCount}`
    : `ALL GROUPS · TOTAL / AVG · TOP ${app.settings.topCount}`;
  el('resultModeTitle').textContent=title;
  el('uploadModeTitle').textContent=title;
  renderResultItems('resultList',false);
  renderResultItems('uploadResultList',true);
}

function downloadCSV(){
  const rows=[['rank','order','group','name','battle_name','total','average','cutline_tie'],
    ...getFinalRanked().map(x=>[x.rank,x.order,participantGroupLabel(x),x.name,x.battle,x.total,x.avg.toFixed(2),x.cutTie?'Y':''])
  ];
  const csv=rows.map(r=>r.map(v=>`"${String(v??'').replaceAll('"','""')}"`).join(',')).join('\n');
  const blob=new Blob(['\ufeff'+csv],{type:'text/csv;charset=utf-8;'});
  const url=URL.createObjectURL(blob);
  const a=document.createElement('a');
  a.href=url;
  a.download=`DISCO_${app.settings.scoreType==='circle'?'JUDGE_CIRCLE':'ALL'}_TOP_RESULT.csv`;
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
