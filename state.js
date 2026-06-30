const DPP = {
  role:null, judgeCircle:null, judgeName:'', currentIndex:0, input:'',
  participants:[], scores:[], logs:[], judgeParticipants:[], rankView:'judge',
  settings:{adminPin:'0000', judgeCount:3, topCount:16, scoringMode:'circle', judges:{A:{name:'',pin:'1111'},B:{name:'',pin:'2222'},C:{name:'',pin:'3333'}}}
};
const app = DPP;
function escapeHtml(s){return String(s??'').replace(/[&<>"]/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;'}[c]))}
function getJudgeCircles(){return Array.from({length:Number(DPP.settings.judgeCount)||3},(_,i)=>String.fromCharCode(65+i))}
function currentMode(){return DPP.settings.scoringMode||'circle'}
function circleOf(row){return row.participant_circle||row.participant_group||''}
function saveLocalSettings(){localStorage.setItem('DPP_V4_SETTINGS',JSON.stringify(DPP.settings))}
function loadLocalSettings(){try{const s=JSON.parse(localStorage.getItem('DPP_V4_SETTINGS')||'null');if(s)DPP.settings={...DPP.settings,...s,judges:{...DPP.settings.judges,...(s.judges||{})}}}catch(e){}}
function go(id){document.querySelectorAll('.screen').forEach(s=>s.classList.remove('active'));document.getElementById(id).classList.add('active');if(id==='admin')renderAdmin();if(id==='score')renderScore();}
