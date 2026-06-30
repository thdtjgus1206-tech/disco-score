
function getParticipantKey(row){return row.participant_order}

function calculateJudgeRank(circle){
  return app.scores
    .filter(s=>s.judge_circle===circle && s.score!==null && s.score!==undefined)
    .sort((a,b)=>Number(b.score)-Number(a.score) || String(a.participant_order).localeCompare(String(b.participant_order),'ko'))
    .map((x,i)=>({...x,rank:i+1}));
}

function calculateTotalRank(){
  const map={};
  app.scores.forEach(s=>{
    const key=getParticipantKey(s);
    if(!key)return;
    if(!map[key]){
      map[key]={
        participant_order:s.participant_order,
        participant_group:s.participant_group,
        participant_name:s.participant_name,
        battle_name:s.battle_name,
        total:0,
        count:0
      };
    }
    if(s.score!==null && s.score!==undefined){
      map[key].total+=Number(s.score)||0;
      map[key].count+=1;
    }
  });
  return Object.values(map)
    .filter(x=>x.count>0)
    .map(x=>({...x,avg:x.total/x.count}))
    .sort((a,b)=>b.total-a.total || String(a.participant_order).localeCompare(String(b.participant_order),'ko'))
    .map((x,i)=>({...x,rank:i+1}));
}

function setRankView(view){
  app.rankView=view;
  ['Judge','Total','Log'].forEach(k=>{
    const btn=document.getElementById('rankTab'+k);
    if(btn)btn.classList.toggle('active',view===k.toLowerCase());
  });
  renderRankingPanel();
}

function renderRankingPanel(){
  const box=document.getElementById('rankingList');
  const info=document.getElementById('rankingInfo');
  if(!box)return;

  if(app.rankView==='log'){
    if(info)info.textContent='최근 입력 로그';
    const rows=(app.logs||[]).slice(0,40);
    box.innerHTML=rows.length?rows.map(s=>`
      <div class="live-rank-row">
        <div class="lr-rank">${escapeHtml(s.judge_circle||'-')}</div>
        <div>
          <div class="lr-name">${escapeHtml(s.battle_name||s.participant_name||'-')}</div>
          <div class="lr-sub">${escapeHtml(s.participant_order||'')} · ${escapeHtml(s.participant_group||'')} GROUP · ${escapeHtml(s.judge_name||'')}</div>
        </div>
        <div class="lr-score">${s.score ?? '-'}</div>
        <div class="lr-avg">${new Date(s.created_at).toLocaleTimeString('ko-KR')}</div>
      </div>
    `).join(''):'<div class="live-empty">아직 입력 로그가 없어.</div>';
    return;
  }

  if(app.rankView==='total'){
    if(info)info.textContent='전체 합계 랭킹';
    const rows=calculateTotalRank().slice(0,app.settings.topCount);
    box.innerHTML=rows.length?`
      <div class="live-rank-group">
        <div class="live-rank-group-title"><span>TOTAL RANKING</span><span>SUM / AVG</span></div>
        ${rows.map(x=>`
          <div class="live-rank-row">
            <div class="lr-rank">#${x.rank}</div>
            <div>
              <div class="lr-name">${escapeHtml(x.battle_name||x.participant_name||'-')}</div>
              <div class="lr-sub">${escapeHtml(x.participant_order)} · ${escapeHtml(x.participant_group)} GROUP · ${x.count} scores</div>
            </div>
            <div class="lr-score">${x.total}</div>
            <div class="lr-avg">AVG ${x.avg.toFixed(1)}</div>
          </div>
        `).join('')}
      </div>
    `:'<div class="live-empty">아직 입력된 점수가 없어.</div>';
    return;
  }

  if(info)info.textContent='져지별 담당 조 랭킹';
  box.innerHTML=getJudgeCircles().map(c=>{
    const judge=app.settings.judges[c] || {};
    const rows=calculateJudgeRank(c).slice(0,app.settings.topCount);
    return `<div class="live-rank-group">
      <div class="live-rank-group-title"><span>${c} JUDGE</span><span>${escapeHtml(judge.name||`${c} JUDGE`)}</span></div>
      ${rows.length?rows.map(x=>`
        <div class="live-rank-row">
          <div class="lr-rank">#${x.rank}</div>
          <div>
            <div class="lr-name">${escapeHtml(x.battle_name||x.participant_name||'-')}</div>
            <div class="lr-sub">${escapeHtml(x.participant_order)} · ${escapeHtml(x.participant_group)} GROUP</div>
          </div>
          <div class="lr-score">${x.score}</div>
          <div class="lr-avg"></div>
        </div>
      `).join(''):'<div class="live-empty">아직 입력된 점수가 없어.</div>'}
    </div>`;
  }).join('');
}

function renderProgress(){
  const box=document.getElementById('progressList');
  if(!box)return;
  box.innerHTML=getJudgeCircles().map(c=>{
    const total=app.scores.filter(s=>s.judge_circle===c && s.participant_group===c).length;
    const done=app.scores.filter(s=>s.judge_circle===c && s.participant_group===c && s.score!==null && s.score!==undefined).length;
    const pct=total?Math.round(done/total*100):0;
    const judge=app.settings.judges[c] || {};
    return `<div class="progress-item">
      <div class="progress-head"><b>${c} JUDGE</b><span>${escapeHtml(judge.name||'')}</span><em>${done}/${total}</em></div>
      <div class="progress-line"><div style="width:${pct}%"></div></div>
    </div>`;
  }).join('');
}

function renderResults(){
  const rows=calculateTotalRank().slice(0,app.settings.topCount);
  const full=document.getElementById('resultList');
  const upload=document.getElementById('uploadResultList');
  if(full)full.innerHTML=renderResultRows(rows,false);
  if(upload)upload.innerHTML=renderResultRows(rows,true);
}

function rankClass(rank){
  if(rank===1)return 'gold-rank';
  if(rank===2)return 'silver-rank';
  if(rank===3)return 'bronze-rank';
  return 'dark-rank';
}

function renderResultRows(rows,hideScore){
  if(!rows.length)return '<div class="empty">아직 결과가 없어.</div>';
  return rows.map(x=>`
    <div class="result-item">
      <div class="rank ${hideScore?rankClass(x.rank):''}">#${x.rank}</div>
      <div>
        <div class="name">${escapeHtml(x.battle_name||x.participant_name||'-')}</div>
        <div class="sub">REAL NAME · ${escapeHtml(x.participant_name||'-')} · ORDER ${escapeHtml(x.participant_order)} · GROUP ${escapeHtml(x.participant_group)}</div>
      </div>
      ${hideScore?'':`<div class="score">${x.total}</div><div class="avg">${x.avg.toFixed(1)}</div>`}
    </div>
  `).join('');
}

function downloadCSV(){
  const rows=[['rank','order','group','name','battle_name','total','average','count'],
    ...calculateTotalRank().map(x=>[x.rank,x.participant_order,x.participant_group,x.participant_name,x.battle_name,x.total,x.avg.toFixed(2),x.count])
  ];
  const csv=rows.map(r=>r.map(v=>`"${String(v??'').replaceAll('"','""')}"`).join(',')).join('\n');
  const blob=new Blob(['\ufeff'+csv],{type:'text/csv;charset=utf-8;'});
  const url=URL.createObjectURL(blob);
  const a=document.createElement('a');
  a.href=url;
  a.download='DPP_RESULTS.csv';
  a.click();
  URL.revokeObjectURL(url);
}
