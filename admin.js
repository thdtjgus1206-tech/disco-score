
function adminLogin(){
  const pin=document.getElementById('adminPinInput').value.trim();
  if(pin!==String(app.settings.adminPin||'0000')){
    document.getElementById('adminLoginError').textContent='관리자 PIN이 틀렸어.';
    return;
  }
  app.role='admin';
  go('admin');
}

function renderAdmin(){
  document.getElementById('adminPinSetting').value=app.settings.adminPin||'0000';
  document.getElementById('judgeCount').value=app.settings.judgeCount||3;
  document.getElementById('topCount').value=app.settings.topCount||16;
  renderJudgeSettings();
  renderPreview();
  renderAllAdminViews();
  renderManualSeedInputs();
  renderManualBracket();
}

function renderJudgeSettings(){
  const box=document.getElementById('judgeSettings');
  if(!box)return;
  box.innerHTML=getJudgeCircles().map(c=>{
    const j=app.settings.judges[c]||{name:'',pin:''};
    return `<div class="judge-name-box">
      <label>${c} JUDGE NAME</label>
      <input id="judgeName_${c}" value="${escapeHtml(j.name||'')}" placeholder="${c} JUDGE 이름" oninput="saveSettings()">
      <label>${c} JUDGE PIN</label>
      <input id="judgePin_${c}" value="${escapeHtml(j.pin||'')}" placeholder="${c} PIN" oninput="saveSettings()">
    </div>`;
  }).join('');
}

function renderPreview(){
  const body=document.getElementById('previewBody');
  if(!body)return;
  if(!app.participants.length){
    body.innerHTML='<tr><td colspan="4" class="empty">참가자 파일을 업로드해줘.</td></tr>';
    return;
  }
  body.innerHTML=app.participants.map(p=>`
    <tr>
      <td>${escapeHtml(p.participant_order||'')}</td>
      <td>${escapeHtml(p.participant_group||'')}</td>
      <td>${escapeHtml(p.participant_name||'')}</td>
      <td>${escapeHtml(p.battle_name||'')}</td>
    </tr>
  `).join('');
}

function renderAllAdminViews(){
  renderProgress();
  renderRankingPanel();
  renderResults();
}
