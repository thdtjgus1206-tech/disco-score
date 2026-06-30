
function saveCanvas(node,name,width=null,height=null){
  html2canvas(node,{backgroundColor:'#07070a',scale:2,useCORS:true,width:width||node.offsetWidth,height:height||node.offsetHeight}).then(canvas=>{
    const a=document.createElement('a');
    a.href=canvas.toDataURL('image/png');
    a.download=name;
    a.click();
  });
}
function saveFullResultImage(){
  renderResults();
  saveCanvas(document.getElementById('resultBoard'),'DPP_FULL_SCORE_RESULT.png');
}
function saveUploadResultImage(){
  renderResults();
  saveCanvas(document.getElementById('uploadResultBoard'),'DPP_UPLOAD_NO_SCORE_RESULT.png',860,null);
}
