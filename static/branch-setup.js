// Only alternative stories use this preparation flow. Ordinary writing stays unchanged.
(()=>{
 const active=()=>project?.state?.branch_origin?.setup_flow&&!project.state.branch_origin.setup_complete;
 const stage=()=>project?.state?.branch_origin?.setup_stage;
 const message=()=>stage()==='revise'?'가져온 회차를 먼저 수정하고 수락해 주세요.':stage()==='review'?'수정한 회차의 설정 검토와 필요한 변경 수락을 먼저 마쳐 주세요.':'앞으로의 분량과 회차 구성을 정하고 수락해 주세요.';
 async function openBranchSetup(){
  if(!active())return;
  if(!['length','plan'].includes(stage())){notice(message());showApprovalGuide();return;}
  if(busy)throw Error('진행 중인 작업이 끝난 뒤 다시 요청해 주세요.');
  if(document.getElementById('branchSetupDialog'))return;
  safeMove();
  const requested=pid,start=project.state.branch_origin.episode;
  const settings=project.state.drafts['plot:0']?.branch_setup_settings||project.state.settings;
  const dialog=node('dialog','');dialog.id='branchSetupDialog';dialog.className='length-dialog';
  const form=node('form','');
  const total=node('input','');total.type='number';total.min=String(start+1);total.max='10000';total.step='1';total.value=settings.total_episodes??'';
  const chars=node('input','');chars.type='number';chars.min='1000';chars.max='5000';chars.step='1';chars.required=true;chars.value=settings.target_chars;
  const totalLabel=node('label','총 회차수 (비워두면 자유)');totalLabel.append(total);
  const charsLabel=node('label','앞으로 쓸 회차의 목표 글자수');charsLabel.append(chars);
  const fields=node('div','');fields.className='length-fields';fields.append(totalLabel,charsLabel);
  const error=node('p','');error.setAttribute('role','alert');error.hidden=true;
  let saving=false;
  const cancel=styledButton('취소',()=>{if(!saving)dialog.close();});cancel.type='button';
  const submit=node('button','이후 회차 구성 만들기');submit.type='submit';submit.className='primary';
  const footer=node('footer','');footer.append(cancel,submit);
  form.append(node('h2','다른 줄거리의 분량 정하기'),node('p',start+'화까지의 원고는 유지하고, '+(start+1)+'화부터의 구성을 만들어요.'),fields,error,footer);
  dialog.append(form);document.body.append(dialog);
  dialog.addEventListener('cancel',event=>{if(saving)event.preventDefault();});
  dialog.addEventListener('close',()=>dialog.remove(),{once:true});
  form.onsubmit=async event=>{
   event.preventDefault();if(saving||!form.reportValidity())return;
   saving=true;submit.disabled=cancel.disabled=chars.disabled=total.disabled=true;error.hidden=true;submit.textContent='이후 회차 구성 만드는 중…';
   try{
    await api('/projects/'+requested+'/branch-setup',{selection:{target_chars:Number(chars.value),total_episodes:total.value===''?null:Number(total.value)}});
    if(pid!==requested){dialog.close();return;}
    await load();dialog.close();await select('plot');
   }catch(exc){error.textContent=exc.message;error.hidden=false;}
   finally{saving=false;submit.disabled=cancel.disabled=chars.disabled=total.disabled=false;submit.textContent='이후 회차 구성 만들기';}
  };
  dialog.showModal();
 }
 const previousLength=openLengthDialog;
 openLengthDialog=function(...args){return active()?openBranchSetup():previousLength(...args);};
 const previousGuide=showApprovalGuide;
 showApprovalGuide=function(){
  previousGuide();
  if(!active()||!['length','plan'].includes(stage()))return;
  const impact=$('revisionImpactPanel');
  if((impact&&!impact.hidden)||$('revisionImpactProgress')?.open)return;
  const guide=$('approvalGuide');
  guide.hidden=false;guide.replaceChildren();
  if(stage()==='plan'){
   const proposed=project.state.drafts['plot:0']?.branch_setup_settings;
   const pendingLength=proposed?' ('+(proposed.total_episodes===null?'총 회차 자유':'총 '+proposed.total_episodes+'화')+' · 회차당 '+Number(proposed.target_chars).toLocaleString()+'자)':'';
   guide.append(node('strong','이후 회차 구성을 검토하고 수락해 주세요.'+pendingLength),styledButton('회차 구성 검토',()=>select('plot'),'primary'),styledButton('분량 다시 정하기',openBranchSetup));
  }else guide.append(node('strong','시작 회차 검토를 마쳤어요. 앞으로의 분량과 회차 구성을 정해 주세요.'),styledButton('분량·회차 구성 정하기',openBranchSetup,'primary'));
 };
 const previousWrite=writeNextEpisode;
 writeNextEpisode=async function(...args){if(active()){showApprovalGuide();notice(message());return;}return previousWrite(...args);};
 const previousSend=send;
 send=async function(text,scope){
  if(active()&&!scope){
   const request=(pending?.text||text||$('chatInput').value||'').trim();
   const numbered=request.match(/(\d+)\s*화.{0,20}(?:집필|써|작성)/);
   if((numbered&&Number(numbered[1])>project.state.branch_origin.episode)||/다음\s*화.{0,20}(?:집필|써|작성)/.test(request)){
    showApprovalGuide();notice(message());return;
   }
  }
  return previousSend(text,scope);
 };
})();
