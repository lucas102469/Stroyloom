'use strict';
// Presentation layer only: the existing API, generation and approval paths remain.
let registering=false,documentView='preview',projectDisplay='grid',toastTimer=null,viewingOfficial=false;
function svgIcon(name){const s=document.createElementNS('http://www.w3.org/2000/svg','svg');s.setAttribute('class','icon');s.setAttribute('aria-hidden','true');const use=document.createElementNS('http://www.w3.org/2000/svg','use');use.setAttribute('href','/static/icons.svg#'+name);s.append(use);return s;}
function genreWords(value) {
 const genres=String(value||'').replace(/[(（][^()（）]*(?:대기|미정|미확정|추후\s*결정)[^()（）]*[)）]/g,'').split(/[,，、;；/／]+/)
  .filter(part=>!/(?:미정|미확정|미분류|선택\s*(?:대기|예정|필요)|정하지\s*않|추후\s*(?:결정|선택))/.test(part));
 const words=genres.join(' ').match(/[\p{L}\p{N}]+(?:[-+][\p{L}\p{N}]+)*/gu)||[];
 return [...new Set(words)];
}
function renderChatText(message) {
 const bubble=node('div',message.text);
 bubble.className='message-text';
 if(message.role!=='user')return bubble;

 const quoteMarker='\n선택 구절:\n';
 const requestMarker='\n수정 요청: ';
 const quoteStart=message.text.indexOf(quoteMarker);
 const requestStart=message.text.lastIndexOf(requestMarker);
 if(quoteStart<0||requestStart<=quoteStart)return bubble;

 const lead=message.text.slice(0,quoteStart);
 if(!lead.endsWith('에서 다음 구절만 수정하고 나머지 원문은 유지해줘.'))return bubble;

 const quote=node('blockquote',message.text.slice(quoteStart+quoteMarker.length,requestStart));
 const request=node('p',message.text.slice(requestStart+requestMarker.length));
 const quoteSection=node('section','');
 quoteSection.className='chat-edit-quote';
 quoteSection.append(node('strong','선택 구절'),quote);
 const requestSection=node('section','');
 requestSection.className='chat-edit-request';
 requestSection.append(node('strong','수정 요청'),request);
 bubble.classList.add('chat-edit-message');
 bubble.replaceChildren(node('p',lead),quoteSection,requestSection);
 return bubble;
}
function projectCoverColor(id) {
 const colors=['#ad613a','#6f7c50','#576a78','#8d627e','#655b50','#638076'];
 const index=Array.from(id).reduce((sum,char)=>sum+char.charCodeAt(0),0)%colors.length;
 return colors[index];
}
function styledButton(text,handler,style='secondary'){const b=button(text,handler);b.className=style;return b;}
function safeMove(){if(dirty||saving)throw Error('먼저 편집을 저장하거나 로컬에 보관하고 닫아주세요.');}
const profileSummary=$('avatar').querySelector('summary');
const profileInitial=node('span','');
profileInitial.className='profile-initial';
profileInitial.setAttribute('aria-hidden','true');
profileSummary.replaceChildren(profileInitial,svgIcon('chevron'));
const nicknameButton=styledButton('닉네임 변경',openNicknameEditor,'text-button');
$('logoutBtn').before(nicknameButton);
function updateProfileLabel(){
 const nickname=account?.nickname||account?.username||'';
 $('account').textContent=nickname;
 profileInitial.textContent=/^\d{2}/.test(nickname)?nickname.slice(0,2):Array.from(nickname)[0]||'작';
 profileSummary.setAttribute('aria-label',nickname?nickname+' 프로필':'프로필');
 nicknameButton.hidden=!account?.required;
}
function openNicknameEditor(){
 $('avatar').open=false;
 const dialog=node('dialog','');
 dialog.className='length-dialog nickname-dialog';
 const title=node('h2','닉네임 변경');
 title.id='nicknameDialogTitle';
 dialog.setAttribute('aria-labelledby',title.id);
 const form=node('form','');
 form.noValidate=true;
 const label=node('label','새 닉네임');
 const input=node('input','');
 input.value=account.nickname||'';
 input.maxLength=20;
 input.required=true;
 input.autofocus=true;
 label.append(input);
 const error=node('p','');
 error.setAttribute('role','alert');
 error.hidden=true;
 const footer=node('footer','');
 const cancel=styledButton('취소',()=>dialog.close());
 cancel.type='button';
 const save=node('button','저장');
 save.className='primary';
 footer.append(cancel,save);
 form.append(label,error,footer);
 form.onsubmit=async event=>{
  event.preventDefault();
  save.disabled=true;
  error.hidden=true;
  try{
   const result=await api('/profile/nickname',{nickname:input.value.trim()});
   account.nickname=result.nickname;
   updateProfileLabel();
   dialog.close();
  }catch(err){
   error.textContent=err.message;
   error.hidden=false;
  }finally{save.disabled=false;}
 };
 dialog.append(title,form);
 dialog.addEventListener('close',()=>{dialog.remove();profileSummary.focus();},{once:true});
 document.body.append(dialog);
 dialog.showModal();
 input.select();
}
const coreShow=show;
show=function(page){coreShow(page);document.body.dataset.page=page;try{if(!window.STORYLOOM_PREVIEW)window.sessionStorage.setItem('storyloom.page',page);}catch{}if(page!=='work'){documentView='preview';$('notice').hidden=true;}$('headerLogin').hidden=!!account?.logged_in;$('headerStart').hidden=!!account?.logged_in;$('avatar').hidden=!account?.logged_in;$('avatar').open=false;updateProfileLabel();$('libraryBtn').hidden=!account?.logged_in;$('logoutBtn').hidden=!account?.required||!account?.logged_in;if(page==='libraryPage')libraryBtn.setAttribute('aria-current','page');else libraryBtn.removeAttribute('aria-current');if(page==='discover')$('discoverBtn').setAttribute('aria-current','page');else $('discoverBtn').removeAttribute('aria-current');};
$('discoverBtn').onclick=run(()=>{safeMove();show('discover');window.scrollTo(0,0);});
document.addEventListener('click',event=>{if(!$('avatar').contains(event.target))$('avatar').open=false;});
$('avatar').addEventListener('keydown',event=>{
 if(event.key==='Escape'&&$('avatar').open){
  $('avatar').open=false;
  $('avatar').querySelector('summary').focus();
 }
});
notice=function(text){if(/^(AI 처리 중|AI 응답 대기 중|요청을 보내고 있습니다)/.test(text||'')){const n=$('notice');n.textContent='';n.hidden=true;return;}if(text==='저장된 상태를 불러왔습니다.')text='';const n=$('notice');n.textContent=text;n.hidden=!text;n.classList.toggle('error',/실패|오류|초과|없습니다|먼저|확인하세요|보존할 수/.test(text));clearTimeout(toastTimer);if(!n.classList.contains('error'))toastTimer=setTimeout(()=>{n.hidden=true;},4200);};
let usageInfo=null;
async function refreshUsage(){usageInfo=await api('/usage');const unlimited=usageInfo.unlimited||usageInfo.remaining===null;$('usageCount').textContent=unlimited?usageInfo.used+'회 · 앱 제한 없음':usageInfo.used+' / '+usageInfo.limit+'회';$('usageBar').hidden=unlimited;$('usageBar').max=usageInfo.limit||1;$('usageBar').value=unlimited?0:usageInfo.used;$('usageRemaining').textContent=unlimited?'테스트 중 · 호출 횟수만 기록 · Gemini 자체 한도는 별도':'남은 '+usageInfo.remaining+'회 · 한국시간 자정 초기화 · 앱 자체 제한';$('workUsage').textContent=unlimited?'오늘 '+usageInfo.used+'회 · 앱 제한 없음':usageInfo.used+'/'+usageInfo.limit+'회 · 남은 '+usageInfo.remaining+'회';$('workUsage').title='이 앱 전체 호출 시도 · Gemini 잔여 할당량이 아닙니다';$('sendBtn').disabled=busy||usageInfo.remaining===0;return usageInfo;}
$('usageRefresh').onclick=run(refreshUsage);
const coreLock=lock;
lock=function(value){coreLock(value);if(usageInfo?.remaining===0)$('sendBtn').disabled=true;$('saveIndicator').querySelector('span').textContent=value?'AI 작업 중':dirty?'저장 대기':'저장됨';for(const b of document.querySelectorAll('#approvalActions button, #approvalGuide button, #episodeReviewFooter button'))b.disabled=value;};
init=async function(){account=await api('/auth/session');if(window.STORYLOOM_PREVIEW){pid='preview';await load();show('work');return;}$('account').textContent=account.nickname||account.username||'';let previous;try{previous=window.sessionStorage.getItem('storyloom.page');}catch{}if(previous==='discover'){show('discover');return;}if(account.logged_in){if(previous==='projectHome'&&pid){try{await openProjectHome(pid);return;}catch{pid=null;}}if(previous==='work'&&pid){try{await load();show('work');return;}catch{pid=null;}}await library();}else{show('home');$('notice').hidden=true;}};
// Registration owns its reveal controls; login keeps its existing behaviour.
function syncRegistrationPasswordControls(enabled){
 $('authForm').classList.toggle('registration-password-controls',enabled);
 for(const id of ['password','passwordConfirm']){
  const input=$(id);
  let toggle=input.parentElement.querySelector('.registration-password-toggle');
  if(!toggle){
   toggle=document.createElement('button');
   toggle.type='button';
   toggle.className='registration-password-toggle';
   toggle.setAttribute('aria-controls',id);
   toggle.onclick=()=>{
    input.type=input.type==='password'?'text':'password';
    update();
   };
   input.parentElement.append(toggle);
  }
  function update(){
   const visible=input.type==='text';
   const label=id==='password'?'비밀번호':'비밀번호 확인';
   toggle.setAttribute('aria-label',label+(visible?' 숨기기':' 표시'));
   toggle.setAttribute('aria-pressed',String(visible));
   toggle.innerHTML='<svg class="icon" viewBox="0 0 24 24" aria-hidden="true" fill="none" stroke="currentColor" stroke-width="1.6"><path d="M2 12s3.5-7 10-7 10 7 10 7-3.5 7-10 7S2 12 2 12Z"/><circle cx="12" cy="12" r="3"/>'+(!visible?'<path d="m3 3 18 18"/>':'')+'</svg>';
  }
  if(enabled||!toggle.hidden)input.type='password';
  toggle.hidden=!enabled;
  update();
 }
}
const registrationFields=['nickname','username','password','passwordConfirm'];
function registrationError(id,message){
 const input=$(id);
 let error=$(id+'RegistrationError');
 if(!error){
  error=document.createElement('p');
  error.id=id+'RegistrationError';
  error.className='registration-field-error';
  error.setAttribute('aria-live','polite');
  input.parentElement.after(error);
 }
 error.textContent=message||'';
 error.hidden=!message;
 input.setAttribute('aria-invalid',String(Boolean(message)));
 if(message)input.setAttribute('aria-describedby',error.id);
 else input.removeAttribute('aria-describedby');
}
function clearRegistrationErrors(){
 for(const id of registrationFields)registrationError(id,'');
 const error=$('registrationFormError');
 if(error){error.hidden=true;error.textContent='';}
}
function registrationValidation(){
 const nickname=$('nickname').value.trim(),username=$('username').value.trim();
 const password=$('password').value,confirm=$('passwordConfirm').value;
 const errors={};
 if(!nickname||Array.from(nickname).length>20||/[\x00-\x1f]/.test(nickname))errors.nickname='닉네임은 1~20자로 입력해 주세요.';
 if(Array.from(username).length<4)errors.username='아이디는 4자 이상 입력해 주세요.';
 else if(Array.from(username).length>50)errors.username='아이디는 50자 이하로 입력해 주세요.';
 else if(/[\x00-\x1f\x7f]/.test(username))errors.username='아이디에 사용할 수 없는 문자가 있어요.';
 if(Array.from(password).length<8)errors.password='비밀번호는 8자 이상 입력해 주세요.';
 else if(Array.from(password).length>200)errors.password='비밀번호는 200자 이하로 입력해 주세요.';
 if(!confirm)errors.passwordConfirm='비밀번호를 한 번 더 입력해 주세요.';
 else if(password!==confirm)errors.passwordConfirm='비밀번호가 일치하지 않아요. 다시 확인해 주세요.';
 return errors;
}
for(const id of registrationFields)$(id).addEventListener('input',()=>{
 if(registering){registrationError(id,'');if(id==='password')registrationError('passwordConfirm','');
 const error=$('registrationFormError');if(error)error.hidden=true;}
});
async function submitRegistration(){
 if($('authSubmit').disabled)return;
 clearRegistrationErrors();
 const errors=registrationValidation();
 for(const [id,message] of Object.entries(errors))registrationError(id,message);
 if(Object.keys(errors).length){$(Object.keys(errors)[0]).focus();return;}
 $('authSubmit').disabled=true;
 try{await authenticate(true);}
 catch(error){
  if(!registering)return;
  const message=error.message||'';
  let id=message.includes('닉네임')?'nickname':message.includes('아이디')?'username':message.includes('일치')?'passwordConfirm':message.includes('비밀번호')?'password':null;
  if(id){
   const friendly=message.includes('이미')?(id==='nickname'?'이미 사용 중인 닉네임이에요. 다른 닉네임을 입력해 주세요.':'이미 사용 중인 아이디예요. 다른 아이디를 입력해 주세요.'):
    id==='nickname'?'닉네임은 1~20자로 입력해 주세요.':id==='username'?(Array.from($('username').value.trim()).length>50?'아이디는 50자 이하로 입력해 주세요.':Array.from($('username').value.trim()).length<4?'아이디는 4자 이상 입력해 주세요.':'아이디에 사용할 수 없는 문자가 있어요.'):id==='passwordConfirm'?'비밀번호가 일치하지 않아요. 다시 확인해 주세요.':(Array.from($('password').value).length>200?'비밀번호는 200자 이하로 입력해 주세요.':'비밀번호는 8자 이상 입력해 주세요.');
   registrationError(id,friendly);$(id).focus();
  }else{
   let feedback=$('registrationFormError');
   if(!feedback){feedback=document.createElement('p');feedback.id='registrationFormError';feedback.className='registration-field-error';feedback.setAttribute('role','alert');$('authSubmit').before(feedback);}
   feedback.textContent='가입을 완료하지 못했어요. 잠시 후 다시 시도해 주세요.';feedback.hidden=false;
  }
 }finally{$('authSubmit').disabled=false;}
}
function authMode(value){clearRegistrationErrors();$('authForm').noValidate=value;syncRegistrationPasswordControls(value);registering=value;$('username').minLength=value?4:1;$('authTitle').textContent=value?'새로운 이야기를 시작하세요.':'내 이야기를 이어가세요.';$('authSubmit').textContent=value?'회원가입':'로그인';$('nicknameField').hidden=!value;$('nickname').required=value;$('confirmField').hidden=!value;$('passwordConfirm').required=value;$('authQuestion').textContent=value?'이미 계정이 있나요?':'아직 회원이 아닌가요?';$('registerBtn').textContent=value?'로그인':'회원가입';$('password').autocomplete=value?'new-password':'current-password';$('passwordConfirm').value='';}
const coreAuthenticate=authenticate;
authenticate=async function(value=registering){if(value&&$('password').value!==$('passwordConfirm').value)throw Error('비밀번호가 서로 일치하지 않습니다.');await coreAuthenticate(value);$('passwordConfirm').value='';};
$('registerBtn').onclick=()=>authMode(!registering);
$('authForm').onsubmit=e=>{e.preventDefault();if(registering)submitRegistration();else run(()=>authenticate(false))();};
for(const b of document.querySelectorAll('[data-auth]'))b.onclick=run(()=>{safeMove();authMode(false);show('auth');});
for(const b of document.querySelectorAll('[data-start]'))b.onclick=run(()=>{safeMove();return account?.logged_in?library():(authMode(false),show('auth'));});
for(const b of document.querySelectorAll('[data-home]'))b.onclick=run(()=>{safeMove();show('home');window.scrollTo(0,0);});
for(const b of document.querySelectorAll('[data-library]'))b.onclick=run(()=>library());
$('libraryBtn').onclick=run(()=>library());
$('homeBtn').onclick=run(()=>{safeMove();show('home');});
$('startBtn').onclick=run(()=>account?.logged_in?library():(authMode(false),show('auth')));

function openNewProject(){safeMove();$('newTitle').value='';$('newModal').hidden=false;setTimeout(()=>$('newTitle').focus(),0);}
function closeNewProject(){if($('newModal').hidden)return;$('newModal').hidden=true;document.querySelector('.new-book')?.focus();}
const coreNew=$('newBtn').onclick;
$('newBtn').onclick=async()=>{const b=$('newBtn');if(b.disabled)return;b.disabled=true;try{await coreNew();if(!$('work').hidden)closeNewProject();}finally{b.disabled=false;}};
$('untitledBtn').onclick=async()=>{$('newTitle').value='';await $('newBtn').onclick();};
$('closeNewBtn').onclick=closeNewProject;$('cancelNewBtn').onclick=closeNewProject;
$('newModal').addEventListener('click',e=>{if(e.target===$('newModal'))closeNewProject();});
$('newTitle').addEventListener('keydown',e=>{if(e.key==='Enter'){e.preventDefault();$('newBtn').click();}});
document.addEventListener('keydown',e=>{if($('newModal').hidden)return;if(e.key==='Escape')closeNewProject();if(e.key==='Tab'){const items=Array.from($('newModal').querySelectorAll('button,input')).filter(n=>!n.disabled);const first=items[0],last=items[items.length-1];if(e.shiftKey&&document.activeElement===first){e.preventDefault();last.focus();}else if(!e.shiftKey&&document.activeElement===last){e.preventDefault();first.focus();}}});

async function confirmProjectDeletion(title){
 if($('projectDeletionDialog'))return false;
 const dialog=node('dialog','');
 dialog.id='projectDeletionDialog';
 dialog.className='length-dialog draft-save-dialog';
 dialog.setAttribute('aria-labelledby','projectDeletionTitle');
 dialog.setAttribute('aria-describedby','projectDeletionDescription');
 const form=node('form','');
 form.method='dialog';
 const heading=node('h2','작품을 삭제하시겠어요?');
 heading.id='projectDeletionTitle';
 const description=node('p','‘'+title+'’ 작품을 휴지통으로 이동해요.');
 description.id='projectDeletionDescription';
 const footer=node('footer','');
 for(const [value,label,style] of [['no','아니요','secondary'],['yes','예','primary']]){
  const button=node('button',label);
  button.type='submit';
  button.value=value;
  button.className=style;
  button.autofocus=value==='no';
  footer.append(button);
 }
 form.append(heading,description,footer);
 dialog.append(form);
 document.body.append(dialog);
 const confirmed=await new Promise(resolve=>{
  dialog.addEventListener('close',()=>resolve(dialog.returnValue==='yes'),{once:true});
  dialog.showModal();
 });
 dialog.remove();
 return confirmed;
}
library=async function(){if(!account?.logged_in){authMode(false);show('auth');return;}safeMove();await refreshUsage();clearTimeout(pollTimer);activeJob=null;let projects=await api('/projects');projects=projects.filter(p=>Boolean(p.archived)===$('showArchived').checked);projects.sort($('sortProjects').value==='title'?(a,b)=>a.title.localeCompare(b.title,'ko'):(a,b)=>(b.updated||0)-(a.updated||0));show('libraryPage');$('projectCount').textContent=projects.length;$('collectionLabel').textContent=$('showArchived').checked?'휴지통':'내 작품';$('libraryPage').querySelector('h1').textContent=$('showArchived').checked?'삭제한 작품을 보관하고 있어요.':'오늘은 어떤 이야기를 이어갈까요?';$('projectList').replaceChildren();$('projectList').classList.toggle('list-view',projectDisplay==='list');const newCard=node('article','');newCard.className='book-card new-book-card';const newButton=styledButton('새 작품',openNewProject,'new-book');newButton.prepend(svgIcon('plus'));newCard.append(newButton);if(!$('showArchived').checked)$('projectList').append(newCard);if(!projects.length&&$('showArchived').checked)$('projectList').append(node('p','휴지통이 비어 있어요.'));for(const [i,p] of projects.entries()){const card=node('article','');card.className='book-card';const open=()=>openProjectHome(p.id);const cover=button('',open);cover.className='book-cover';cover.style.setProperty('--cover',p.origin?.coverColor||projectCoverColor(p.id));cover.setAttribute('aria-label',p.title+' 열기');const title=node('span',p.title);title.className='book-title';cover.append(title);const info=node('div','');info.className='book-info';const description=node('p',p.description||'아직 작품 소개가 없어요. AI와 함께 이야기를 시작해보세요.');description.className='book-description';const tags=node('div','');tags.className='book-tags';for(const [index,value] of genreWords(p.genre).entries()){const genre=node('span','#'+value.replace(/^#+/,''));genre.className=index?'book-tag':'book-tag genre-tag';tags.append(genre);}const items=Array.isArray(p.tags)?p.tags:[];for(const t of (projectDisplay==='list'?items:items.slice(0,3))){const tag=node('span','#'+String(t).replace(/^#+/,''));tag.className='book-tag';tags.append(tag);}if(items.length>3&&projectDisplay!=='list'){const more=node('span','+'+(items.length-3));more.className='book-tag';more.title=items.slice(3).join(' · ');tags.append(more);}const meta=node('p','');meta.className='book-compact-meta';const work=p.archived?'휴지통':(p.current_work||'기획 중').replace('초안 작성중','초안').replace('수정안 검토중','수정 중').replace('기획 정리중','기획 중');const date=p.updated?new Intl.DateTimeFormat('en-US',{month:'2-digit',day:'2-digit',timeZone:'Asia/Seoul'}).format(new Date(p.updated*1000)).replace('/','.')+' 수정':'수정 기록 없음';meta.replaceChildren();const workLabel=node('span',work);workLabel.className='book-work-status';const dateLabel=node('span',date);dateLabel.className='book-modified-date';meta.append(workLabel,dateLabel);const listTitle=node('h2',p.title);listTitle.className='book-list-title';info.append(listTitle,description,tags,meta);if(p.origin){const origin=node('p','다른 줄거리 · '+p.origin.author+' 원작 · '+p.origin.episode+'화부터');origin.className='alternative-library-origin';info.append(origin);}const menu=node('details','');menu.className='book-menu';const more=node('summary','⋯');more.setAttribute('aria-label',p.title+' 작품 메뉴');const pop=node('div','');pop.className='book-menu-popover';if(!p.archived){pop.append(styledButton('작품 이름 변경',()=>{menu.open=false;openLibraryRename(p);},'text-button'));}pop.append(styledButton(p.archived?'작품 복원':'작품 삭제',async()=>{safeMove();menu.open=false;if(!p.archived&&!(await confirmProjectDeletion(p.title)))return;await api('/projects/'+p.id+'/manage',{archived:!p.archived});await library();notice(p.archived?'작품을 복원했습니다.':'휴지통으로 이동했습니다. 언제든 복원할 수 있어요.');},'text-button '+(p.archived?'':'delete-work')));menu.append(more,pop);card.append(menu);card.append(cover,info);$('projectList').append(card);}$('notice').hidden=true;};
$('sortProjects').onchange=run(library);$('showArchived').onchange=run(library);
$('gridBtn').onclick=run(()=>{projectDisplay='grid';$('gridBtn').classList.add('active');$('listBtn').classList.remove('active');return library();});
$('listBtn').onclick=run(()=>{projectDisplay='list';$('listBtn').classList.add('active');$('gridBtn').classList.remove('active');return library();});

let referenceExpanded=true;
const referenceKinds=['characters','world','places','lore'];
function sidebar(){
 const s=project.state,nav=$('tabs');nav.replaceChildren();
 function link(name,text,icon,nested=false){const b=button(text,()=>select(name));b.className=(nested?'nested ':'')+(s.selected===name?'active':'');if(icon)b.prepend(svgIcon(icon));nav.append(b);return b;}
 link('plan','작품 개요','file');
 const group=button('',async()=>{safeMove();referenceExpanded=true;await select(referenceKinds.includes(project.state.selected)?project.state.selected:'characters');});group.className='nav-group-label reference-group';group.append(svgIcon('folder'),node('span','설정 자료집'));
 const toggle=button('',()=>{referenceExpanded=!referenceExpanded;sidebar();});toggle.className='reference-toggle';toggle.setAttribute('aria-label',referenceExpanded?'설정 자료집 접기':'설정 자료집 펼치기');toggle.setAttribute('aria-expanded',String(referenceExpanded));toggle.append(svgIcon('chevron'));
 const groupRow=node('div','');groupRow.className='reference-group-row';groupRow.append(group,toggle);nav.append(groupRow);
 if(referenceExpanded){link('characters','등장인물',null,true);link('world','세계관',null,true);link('places','장소',null,true);link('lore','주요 설정',null,true);link('plot','플롯·회차 구성',null,true);}
 const space=node('div','');space.className='nav-spacer';nav.append(space);link('episode','원고 집필','pen');
}
for(const b of document.querySelectorAll('[data-reference]'))b.onclick=run(()=>select(b.dataset.reference));
for(const b of document.querySelectorAll('[data-tool]'))b.onclick=run(()=>select(b.dataset.tool));

const coreRender=render;
render=function(){coreRender();if($('approvalGuide').dataset.project!==pid)$('approvalGuide').hidden=true;document.body.dataset.document=project.state.selected;refreshUsage().catch(e=>notice(e.message));sidebar();if($('inlineRename').hidden)$('renameTitle').value=project.title;$('chatHeading').textContent={plan:'AI와 함께 기획',characters:'등장인물 함께 다듬기',world:'세계관 함께 정리하기',places:'장소 함께 정리하기',lore:'주요 설정 함께 정리하기',plot:'이야기의 흐름 만들기',episode:'AI와 함께 집필',settings:'작품 분량 설정',memory:'이야기를 기억하는 공간',guidelines:'작가 지침 정리'}[project.state.selected];$('documentTabLabel').textContent={plan:'기획안 미리보기',characters:'등장인물',world:'세계관',places:'장소',lore:'주요 설정',plot:'플롯·회차 구성',episode:'원고 미리보기',settings:'분량 설정',memory:'장기 기억'}[project.state.selected];if(project.state.selected==='episode'&&Array.from($('episodeList').options).some(o=>o.value===String(project.state.episode)))$('episodeList').value=String(project.state.episode);$('episodeInput').parentElement.hidden=true;$('officialSettings').textContent=formatEpisodeTotal(project.state.settings.total_episodes)+' · 회차 목표 '+project.state.settings.target_chars.toLocaleString()+'자';$('officialSettings').hidden=project.state.selected!=='plot';$('workProjectTitle').textContent=project.title;$('messages').replaceChildren(...project.state.messages.map(m=>{const row=node('div','');row.className='message '+(m.role==='user'?'user':'assistant');const avatar=node('span','');avatar.className='message-avatar';avatar.append(svgIcon(m.role==='user'?'user':'spark'));const content=node('div','');content.className='message-content';const name=node('span',m.role==='user'?'나':'Storyloom AI');name.className='message-name';const text=renderChatText(m);content.append(name,text);row.append(avatar,content);return row;}));$('messages').scrollTop=$('messages').scrollHeight;setDocumentView(documentView);};
const coreSelect=select;
select=async function(name){if(dirty||saving)throw Error('편집 저장이 완료된 뒤 이동해주세요.');dismissRevisionImpactForNavigation();$('chatInput').placeholder='AI에게 이야기를 들려주세요…';documentView='preview';await coreSelect(name);};
function setDocumentView(view){if(view==='history')dismissRevisionImpactForNavigation();documentView=view;if(!editKey)$('editPanel').hidden=true;$('editPanel').hidden=view!=='preview'||!editKey;$('preview').hidden=view!=='preview'||!!editKey;$('diff').hidden=view!=='diff';$('historyPanel').hidden=view!=='history';$('documentTab').classList.toggle('active',view==='preview');$('historyNav').classList.toggle('active',view==='history');$('editBtn').hidden=view!=='preview'||viewingOfficial;$('approvalActions').hidden=view==='history'||viewingOfficial;$('episodeList').hidden=view!=='preview'||project?.state.selected!=='episode';}
$('documentTab').onclick=()=>setDocumentView('preview');
$('historyNav').onclick=run(async()=>{safeMove();historySelection=null;selectedHistory=null;$('historyDetail').hidden=true;setDocumentView('history');await renderHistory();});


function reflectedSettingFacts(state,kind){
 const facts=new Map(),targets=new Map(Object.entries(state.linked_names||{}).map(([old,name])=>[old,new Set([name])]));
 for(const record of Object.values(state.records||{})){
  if(['continuity','organize'].includes(record.setting_review))continue;
  for(const entry of record.findings||[]){
   if(entry.kind!=='characters'||entry.reason||entry.removed||!entry.previous_name)continue;
   const escape=value=>String(value).replace(/[.*+?^${}()|[\]\\]/g,'\\$&');
   const old=escape(entry.previous_name),name=escape(entry.name),quote=entry.quote||'';
   if(!new RegExp(old+'(?:의)?\\s*(?:본명|이름|성명)(?:은|는|이|가)?\\s*["“‘\x27]?'+name+'(?=["”’\x27\\s.,。]|이|였|입|$)').test(quote)&&!new RegExp(old+'(?:은|는|이|가)?\\s*자신을\\s*["“‘\x27]?'+name+'["”’\x27]?(?:이)?라고\\s*소개').test(quote))continue;
   const headings=(state.official?.['characters:0']?.text||'').split('\n').map(line=>line.match(/^#{1,6}\s+(.+?)\s*$/)?.[1]).filter(Boolean);
   if(headings.filter(value=>value===entry.previous_name).length>1||(headings.includes(entry.previous_name)&&headings.includes(entry.name)))continue;
   const values=targets.get(entry.previous_name)||new Set();values.add(entry.name);targets.set(entry.previous_name,values);
  }
 }
 const resolve=name=>{const seen=new Set();let current=name;while(targets.get(current)?.size===1&&!seen.has(current)){seen.add(current);current=[...targets.get(current)][0];}return seen.has(current)?name:current;};
 for(const record of Object.values(state.records||{})){
  if(['continuity','organize'].includes(record.setting_review))continue;
  for(const entry of record.findings||[]){
   if(entry.kind!==kind||entry.reason||entry.removed)continue;
   const fact=entry.fact.trim();
   if(fact){
    const id=fact.replace(/[.!。]\s*$/,'').replace(/\s+/g,'');
    if(!facts.has(id)||entry.name)facts.set(id,{fact,name:kind==='characters'?resolve(entry.name):entry.name,role:entry.role,field:entry.field});
   }
  }
 }
 return [...facts.values()];
}
function normalizeManuscriptBreaks(text){
 return text.replace(/\\r\\n|\\n/g,'\n').replace(/([.!?。！？]["”’']?)nn(?=[가-힣"“‘'])/g,'$1\n\n');
}
function formatManuscriptParagraphs(text){
 return normalizeManuscriptBreaks(text).split(/\r?\n[ \t]*\r?\n/).map(paragraph=>{
  if(paragraph.length<=350)return paragraph;
  let start=0;
  const parts=[];
  for(const sentence of paragraph.matchAll(/[.!?。！？]["”’']?[ \t]+/g)){
   if(sentence.index-start<200||paragraph.length-sentence.index<100)continue;
   const end=sentence.index+sentence[0].trimEnd().length;
   parts.push(paragraph.slice(start,end));
   start=sentence.index+sentence[0].length;
  }
  return [...parts,paragraph.slice(start)].join('\n\n');
 }).join('\n\n');
}
function reflectedFactsForDocument(state,kind,text,reflected){
 const source=[state.drafts?.[kind+':0'],state.official?.[kind+':0']].find(item=>item?.text===text);
 if(source?.reference_materialized_facts)reflected=reflected.filter(item=>!source.reference_materialized_facts.includes(item.fact));
 const official=state.drafts?.[kind+':0']?.reference_edit_base||state.official[kind+':0']?.text;
 if(!official||official===text||!reflected.length)return reflected;
 const before=parseSettingRecords(official),after=parseSettingRecords(text);
 const oldNames=new Set(before.map(card=>card.name)),newNames=new Set(after.map(card=>card.name));
 const removed=before.filter(card=>!newNames.has(card.name));
 const added=after.filter(card=>!oldNames.has(card.name));
 const signature=card=>JSON.stringify([
  Object.entries(card.fields).sort(([a],[b])=>a.localeCompare(b)),card.notes
 ]);
 const renames=new Map();
 for(const card of removed){
  const matches=added.filter(candidate=>signature(candidate)===signature(card));
  if(matches.length===1&&removed.filter(other=>signature(other)===signature(card)).length===1)
   renames.set(card.name,matches[0].name);
 }
 if(!renames.size)return reflected;
 const escape=value=>value.replace(/[.*+?^$(){}|[\]\\]/g,'\\$&');
 const pattern=new RegExp('(?<![\\p{L}\\p{N}_])('+[...renames.keys()].sort((a,b)=>b.length-a.length).map(escape).join('|')+
  ')(에게서는|에게서|에게는|에서|에게|으로|께서|부터|까지|처럼|보다|은|는|이|가|을|를|과|와|로|의|에|도|만|께)?(?![\\p{L}\\p{N}_])','gu');
 const rename=value=>value.replace(pattern,(_,name,particle='')=>{
  const replacement=renames.get(name),last=replacement.charCodeAt(replacement.length-1);
  const pairs={'은':'은는','는':'은는','이':'이가','가':'이가','을':'을를','를':'을를','과':'과와','와':'과와'};
  if(last>=0xac00&&last<=0xd7a3){
   const ending=(last-0xac00)%28;
   if(pairs[particle])particle=pairs[particle][Number(ending===0)];
   else if(particle==='으로'||particle==='로')particle=ending!==0&&ending!==8?'으로':'로';
  }
  return replacement+particle;
 });
 return reflected.map(item=>Object.fromEntries(Object.entries(item)
  .map(([field,value])=>[field,typeof value==='string'?rename(value):value])));
}
function documentContent(text,kind,status,reflected=[],editCard=null){
 if(kind!=='characters')text=parseSettingRecords.normalizeAttributes(text);
 if(kind==='episode')return richText(formatManuscriptParagraphs(text));
 if(kind==='plot')return plotDocument(text);
 if(kind==='plan')return planDocument(text);
 if(kind==='settings'){try{const values=JSON.parse(text),dl=node('dl','');dl.className='settings-values';for(const [label,value] of [['회차 목표 글자수',Number(values.target_chars).toLocaleString()+'자'],['총 회차수',formatEpisodeTotal(values.total_episodes)]])dl.append(node('dt',label),node('dd',value));return dl;}catch{}}
 reflected=reflectedFactsForDocument(project.state,kind,text,reflected);
 const body=richText(text);
 if(!referenceKinds.includes(kind))return body;
 const compactText=value=>{
  const text=value.replace(/^[ \t]*\d+[.)][ \t]+(?=\S)/gm,'').trim();
  const firstSentence=text.match(/^[^\n]*?(?:[.!?。](?=\s|$)|(?=\n|$))/)?.[0]||text;
  const truncated=firstSentence.length>160;
  const excerpt=truncated?firstSentence.slice(0,157).trimEnd():firstSentence.trimEnd();
  const remaining=text.slice(excerpt.length).trimStart();
  if(!remaining)return node('span',text);
  const details=node('details','');
  details.append(node('summary',truncated?excerpt+'…':excerpt),node('p',remaining));
  details.lastChild.style.whiteSpace='pre-wrap';
  return details;
 };
 const settingCard=(title,rows)=>{
  const edit=editCard?.(title);
  const confirmed=status==='confirmed';
  const card=node('section','');
  card.className='setting-sheet '+(confirmed?'official-setting':'proposed-setting');
  const heading=node('div','');
  heading.className='setting-sheet-heading';
  const label=confirmed?'확정 설정 (공식)':status==='review'?'검토 중':'제안 설정 (초안)';
  heading.append(svgIcon(confirmed?'check':'spark'),node('strong',label));
  const entity=node('article','');
  entity.className=kind==='characters'?'setting-entity character-entity':'setting-entity';
  const world=kind==='world';
  if(['world','places','lore'].includes(kind))entity.classList.add('world-entity');
  const name=node('h3','');
  if(kind!=='characters'&&title)name.append(svgIcon('file'));
  if(title||edit){
   const titleText=node('span',title);
   titleText.className='setting-entity-title';
   if(edit)titleText.replaceChildren(edit.name);
   name.append(titleText);
  }
  const role=kind==='characters'?rows.find(([label])=>label==='역할')?.[1]:null;
  if(role){const badge=node('span',role);badge.className='character-role';if(edit)badge.replaceChildren(edit.field('역할',role));name.append(badge);}
  if(name.childNodes.length&&(!world||!/^(?:세계관|(?:이름\s*)?미정|미확정|미상)$/.test(title)))entity.append(name);
  else entity.classList.add('setting-entity-full-width');
  const fields=node('dl','');
  fields.className='entity-fields';
  const compactCharacter=kind==='characters'&&!edit;
  const extraFields=node('dl','');
  extraFields.className='entity-fields';
  let description=null;
  for(const [label,value] of rows){
   if(kind==='characters'&&label==='역할')continue;
   if(kind==='characters'&&label==='설명'){
    description=node('div','');description.className='character-description';
    if(compactCharacter)description.className+=' character-intro';
    description.append(edit?edit.field(label,value):compactText(value));continue;
   }
   if(world&&label==='설명'){
    const paragraph=node('div','');
    paragraph.className='world-description';
    paragraph.append(edit?edit.field(label,value):compactText(value));
    entity.append(paragraph);
    continue;
   }
   const cell=node('dd','');
   const ability=kind==='characters'&&label==='능력'&&
    parseSettingRecords(project.state.official['lore:0']?.text||'').some(record=>record.name===value);
   if(edit){
    cell.append(edit.field(label,value));
   }else if(ability){
    cell.append(styledButton(value,async()=>{
     await select('lore');
     const heading=[...$('preview').querySelectorAll('.setting-entity h3')]
      .find(title=>title.textContent.trim()===value);
     heading?.scrollIntoView({block:'nearest'});
    },'text-button'));
   }else{
    cell.append(compactText(value));
   }
   const term=node('dt',label);
   if((!edit&&(kind==='places'||kind==='lore'||label==='설명'))||(kind==='places'&&label==='위치')){
    term.classList.add('sr-only');
    cell.classList.add('entity-unlabelled-description');
   }
   (compactCharacter&&!['목표','관계'].includes(label)?extraFields:fields).append(term,cell);
  }
  if(compactCharacter&&description)entity.append(description);
  if(fields.childElementCount)entity.append(fields);
  if(description&&!compactCharacter)entity.append(description);
  if(compactCharacter){
   if(extraFields.childElementCount){
    const details=node('details','');details.className='character-details';
    details.append(node('summary','상세 보기'));
    details.append(extraFields);entity.append(details);
   }
  }
  if(kind!=='characters')card.append(heading);
  card.append(entity);
  return card;
 };
 const renderCards=(container,cards)=>{
  const ordered=[...cards].filter(card=>card.title&&!/^(?:세계관|이름 미정)$/.test(card.title))
   .sort((a,b)=>b.title.length-a.title.length);
  const unmatched=[];
  const comparable=value=>value.replace(/[.!。]/g,'').replace(/\s+/g,'');
  const savedText=comparable(text);
  for(const {fact,name,role,field} of reflected){
   const normalized=comparable(fact);
   if(!normalized)continue;
   const alreadySaved=savedText.includes(normalized);
   let card=name?cards.find(item=>item.title===name):ordered.find(item=>fact.includes(item.title));
   if(!card&&name&&['world','lore'].includes(kind)){
    const matches=cards.filter(item=>item.rows.some(([label,value])=>
     label==='능력'&&comparable(value)===comparable(name)));
    if(matches.length===1)card=matches[0];
   }
   if(!card&&alreadySaved)continue;
   if(!card&&name){
    card={title:name,rows:[]};
    cards.push(card);
   }
   if(!card){unmatched.push(fact);continue;}
   if(kind==='characters'&&role&&!card.rows.some(([label])=>label==='역할'))card.rows.push(['역할',role]);
   if(alreadySaved)continue;
   const label=field||'설명';
   const row=card.rows.find(([key])=>key===label);
   if(row){
    if(!comparable(row[1]).includes(normalized))row[1]+='\n'+fact;
   }else card.rows.push([label,fact]);
  }
  for(const {title,rows} of cards)container.append(settingCard(title,rows));
  if(unmatched.length)container.append(settingCard('',[['설명',unmatched.join('\n')]]));
  return container;
 };
 if(kind==='world'){
  const topics=[];
  const hasExplicitTitles=/^\s*#{1,6}\s+\S/m.test(text);
  const fieldNames=new Set(['설명','배경','규칙','특징','역사','지리','문화','정치','사회','마법','기술','제약','장소','시대','분위기','능력']);
  for(const field of parseSettingRecords.attributeNames)fieldNames.add(field);
  let topic=null,row=null;
  const startTopic=title=>{
   topic={title,rows:[]};
   topics.push(topic);
   row=null;
  };
  for(const raw of text.split(/\r?\n/)){
   const line=raw.trim();
   if(!line)continue;
   const label=line.replace(/^#{1,6}\s+/,'').replace(/[\[\]【】*_]/g,'').trim();
   if(/^세계관\s*(?:설정)?$/.test(label))continue;
   const heading=line.match(/^#{1,6}\s+(.+)$/);
   const entry=line.replace(/^(?:[-*+•]|\d+[.)])\s+/,'').replace(/\*\*/g,'').match(/^([^:：.!?]{1,35})[:：]\s*(.*)$/);
   if(heading)startTopic(heading[1].trim());
   else if(entry){
    const name=entry[1].trim();
    if(!fieldNames.has(name)&&!(hasExplicitTitles&&topic))startTopic(name);
    else if(!topic)startTopic('세계관');
    row=[fieldNames.has(name)||(hasExplicitTitles&&topic&&topic.title!==name)?name:'설명',entry[2]];
    topic.rows.push(row);
   }else{
    if(!topic)startTopic('세계관');
    if(!row){row=['설명',''];topic.rows.push(row);}
    row[1]+=(row[1]?'\n':'')+line;
   }
  }
  const world=node('div','');
  world.className='setting-card-list';
  return renderCards(world,topics.map(({title,rows})=>({title,rows:rows.filter(([,value])=>value.trim())})));
 }

 const group=node('div','');group.className='setting-card-list';
 const cards=[];


 for(const record of parseSettingRecords(text)){
  const hasMeaningfulText=value=>String(value??'').split(/\r?\n/).some(raw=>{
   const line=raw.replace(/[*_`\[\]()【】#]/g,'').trim()
     .replace(/^(?:[-+•]\s+|\d+[.)]\s+)/,'')
     .replace(/^(?:이름|인물명|설명|역할)\s*[:：]\s*/,'');
   return Boolean(line)&&!/^(?:(?:이름|설명)\s*)?(?:미정|미상|없음|미작성|미확정)[.。]?\s*$|^(?:주요\s*)?(?:등장인물|인물)\s*(?:설정|목록)?\s*[:：]?$|^[-–—]+$/.test(line);
  });
  const characterName=record.name.replace(/[(（]\s*(?:미정|미확정|미상)\s*[)）]/g,'').trim();
  const name=kind==='characters'&&(/^(?:(?:실제\s*)?(?:이름|인물명)|주인공|조연|이름 없는 인물)$|미정|미확정|미상/.test(characterName))?'':characterName;
  if(kind==='characters'&&![name,...Object.values(record.fields),...record.notes].some(hasMeaningfulText))continue;


  const include=kind==='characters'?hasMeaningfulText:value=>Boolean(value);
  const fields={...record.fields};
  const notes=record.notes.filter(include).join('\n');
  if(notes)fields.설명=[fields.설명,notes].filter(include).join('\n');
  const order=['역할','성격','목표','관계','설명'];
  const labels=kind==='characters'?[...order,...Object.keys(fields).filter(label=>!order.includes(label))]:Object.keys(fields);
  const rows=labels.filter(label=>include(fields[label])).map(label=>[label,fields[label]]);
  if(!rows.length&&kind!=='characters')rows.push(['설명',editCard?'':'아직 정리된 내용이 없습니다.']);
  cards.push({title:kind==='characters'?name:/미정|미확정|미상/.test(record.name)?'':record.name,rows});
 }
 return renderCards(group,cards);
}

function planDocument(text,editField=null){
 const parsed=parsePlanDocument(text),root=node('div','');
 root.className='plan-document';
 const dl=node('dl','');
 dl.className='plan-fields';
 const hasTitle=project.title?.trim()&&project.title.trim()!=='제목 미정';
 if(hasTitle||parsed.title||editField){
  const title=parsed.title||project.title;
  const cell=node('dd',title);
  if(editField&&!hasTitle)cell.replaceChildren(editField('제목',title,'제목: ','',false));
  dl.append(node('dt',hasTitle&&title===project.title?'제목':'제안 제목'),cell);
 }
 for(const label of ['로그라인','장르']){
  const value=parsed.fields[label]||'';
  const cell=node('dd',value||'미정');
  if(editField)cell.replaceChildren(editField(label,value,label+': ','\n',label==='로그라인'));
  dl.append(node('dt',label),cell);
 }
 for(const [label,value] of [
  ['총 회차',parsed.fields['총 회차']||formatEpisodeTotal(project.state.settings.total_episodes)],
  ['회차 목표',parsed.fields['회차 목표']||project.state.settings.target_chars.toLocaleString()+'자']
 ])dl.append(node('dt',label),node('dd',value));
 root.append(dl);
 if(parsed.synopsis||editField)root.append(node('h3','시놉시스'),editField
  ?editField('시놉시스',parsed.synopsis,'## 시놉시스\n','\n\n',true):richText(parsed.synopsis));
 if(parsed.notes.trim())root.append(node('h3','기획 메모'),richText(parsed.notes));
 if(parsed.plot){
  const details=node('details','');
  details.append(node('summary','함께 저장된 플롯 내용 확인'),plotDocument(parsed.plot));
  root.append(node('p','기존 기획안에 플롯 내용이 함께 저장되어 있습니다. 로그라인·장르·시놉시스는 별도로 정리해야 합니다.'),details);
 }
 return root;
}
function richText(text){const root=node('div','');root.className='manuscript';const lines=text.split('\n');let paragraph=[];const flush=()=>{if(!paragraph.length)return;const p=node('p',paragraph.join('\n').replace(/\*\*(.*?)\*\*/g,'$1').replace(/^[-*]\s/gm,'• '));p.style.whiteSpace='pre-wrap';p.style.margin='0 0 14px';root.append(p);paragraph=[];};
for(let i=0;i<lines.length;i++){const line=lines[i];if(!line.trim()){flush();continue;}const heading=line.match(/^\s*#{1,6}\s+(.+)/);if(heading){flush();root.append(node('h4',documentPlain(heading[1])));continue;}
if(line.includes('|')&&documentSeparator(lines[i+1])){flush();const table=node('table','');table.className='document-table';const head=node('thead',''),row=node('tr','');for(const cell of documentCells(line))row.append(node('th',cell));head.append(row);table.append(head);i++;const body=node('tbody','');while(i+1<lines.length&&lines[i+1].trim().startsWith('|')){const tr=node('tr','');for(const cell of documentCells(lines[++i]))tr.append(node('td',cell));body.append(tr);}table.append(body);root.append(table);continue;}paragraph.push(line);}flush();return root;}

function visibleDocumentDraft(state,id){
 const draft=state.drafts[id],official=state.official[id];
 if(id==='plot:0'&&draft&&plotContainsPlanningOnly(draft.text))return null;
 const kind=id.split(':')[0];
 if([...referenceKinds,'plot'].includes(kind)&&draft&&official){
  if(draft.text.trim()===official.text.trim()||
     documentContent(draft.text,kind,'confirmed').isEqualNode(documentContent(official.text,kind,'confirmed')))return null;
 }
 return draft;
}
preview=function(){const selected=key(),s=project.state,draft=visibleDocumentDraft(s,selected),official=s.official[selected];viewingOfficial=false;$('episodeRenameAction')?.remove();$('preview').replaceChildren();$('approvalActions').replaceChildren();$('preview').classList.toggle('is-manuscript',s.selected==='episode');const reflected=referenceKinds.includes(s.selected)?reflectedSettingFacts(s,s.selected):[];const item=draft||official;if(!item&&reflected.length){$('preview').append(documentContent('',s.selected,'confirmed',reflected));}else if(!item){const empty=node('div','');empty.className='document-empty';empty.append(svgIcon(s.selected==='episode'?'book':'file'),node('h3',s.selected==='episode'?'아직 쓰지 않은 이야기':'이야기의 밑그림을 함께 그려요'),node('p',s.selected==='plan'?'대화를 나누면 이곳에 기획안이 정리돼요.':'AI와 정리하거나 직접 쓸 수 있어요.'));empty.append(node('p','승인 전까지 초안으로 보관됩니다.'));$('preview').append(empty);}else{const heading=node('div','');heading.className='document-heading';const headingText=s.selected==='episode'?s.episode+'화 · '+chapterDisplayTitle(item,s.episode):s.selected==='plan'?(parsePlanDocument(item.text).title||project.title):labels[s.selected];heading.append(node('h2',headingText));const status=node('span',({draft:'초안',review:'검토중',confirmed:'확정'})[item.status]||item.status);status.className='status-badge '+item.status;const count=node('span',Array.from(item.text).length.toLocaleString()+'자');count.className='char-count';heading.append(status,count);const rename=s.selected==='episode'?styledButton('제목 수정',renameEpisode,'text-button'):null;if(rename){rename.id='episodeRenameAction';rename.prepend(svgIcon('pen'));rename.setAttribute('aria-label','회차 제목 변경');$('episodeList').after(rename);}$('preview').append(heading);if(s.selected==='episode'){const meta=node('div','목표 '+s.settings.target_chars.toLocaleString()+'자 · '+(draft?'검토 후 공식 원고로 확정할 수 있어요.':'승인된 공식 원고입니다.'));meta.className='document-submeta';$('preview').append(meta);const length=Array.from(item.text).length;const minimum=s.settings.target_chars;if(length<minimum){const warning=node('p','최소 '+minimum.toLocaleString()+'자까지 '+(minimum-length).toLocaleString()+'자가 부족해요.');warning.className='length-warning';$('preview').append(warning);}}if(draft&&official){const switches=node('div','');switches.className='draft-switch';for(const [label,view] of ([...referenceKinds,'plot'].includes(s.selected)?[['확정본','official'],['수정안','draft']]:[['기존 원고','official'],['수정 원고','draft']])){const b=button(label,async()=>{if(view==='diff'){await compare();return;}const textNode=$('preview').querySelector('.main-document-text');const shown=view==='official'?official:draft;viewingOfficial=view==='official';if(rename)rename.hidden=viewingOfficial;if(s.selected==='plan')heading.querySelector('h2').textContent=parsePlanDocument(shown.text).title||project.title;if(s.selected==='episode')heading.querySelector('h2').textContent=s.episode+'화 · '+chapterDisplayTitle(shown,s.episode);textNode.replaceChildren(documentContent(shown.text,s.selected,shown.status,reflected));const badge=$('preview').querySelector('.status-badge');badge.textContent=viewingOfficial?'확정본 보기':({draft:'초안',review:'검토중'})[draft.status];badge.className='status-badge '+shown.status;$('preview').querySelector('.char-count').textContent=Array.from(shown.text).length.toLocaleString()+'자';$('approvalActions').hidden=viewingOfficial;$('editBtn').hidden=viewingOfficial||confirmedPlanIsSelected();for(const note of $('preview').querySelectorAll('.metadata-note,.length-warning'))note.hidden=viewingOfficial;const meta=$('preview').querySelector('.document-submeta');if(meta)meta.textContent='목표 '+s.settings.target_chars.toLocaleString()+'자 · '+(viewingOfficial?'승인된 공식 원고를 보고 있어요.':'수정안을 검토 후 승인하세요.');for(const a of switches.children)a.classList.remove('active');b.classList.add('active');});if(view==='draft')b.classList.add('active');switches.append(b);}$('preview').append(switches);}const main=node('div','');main.className='main-document-text';if(s.selected==='settings'){try{const settings=JSON.parse(item.text);const dl=node('dl','');dl.className='settings-values';for(const [label,value]of [['회차 목표 글자수',Number(settings.target_chars).toLocaleString()+'자'],['총 회차수',formatEpisodeTotal(settings.total_episodes)]])dl.append(node('dt',label),node('dd',value));main.append(dl);}catch{main.append(richText(item.text));}}else main.append(documentContent(item.text,s.selected,item.status,reflected));$('preview').append(main);if((s.selected!=='world'&&item.summary)||item.facts||item.impact){const details=node('details','');details.className='metadata-note';details.append(node('summary',s.selected==='episode'?'이번 회차 요약과 사실 기록':'관련 자료와 영향 검토'));if(s.selected!=='world'&&item.summary)details.append(node('p','요약: '+item.summary));if(item.facts)details.append(node('p','사실 기록: '+item.facts));if(item.impact)details.append(node('p','AI가 제안한 영향: '+item.impact));$('preview').append(details);}if(draft){const rewrite=!official&&(s.selected==='plan'||[...referenceKinds,'plot'].includes(s.selected));
const reject=(rewrite||(!official&&s.selected==='episode'))?styledButton('다시 작성 요청',()=>{
 safeMove();
 pending=null;
 const request=s.selected==='episode'
  ?'현재 선택한 '+s.episode+'화의 원고 초안을 처음부터 다시 다듬어줘. 이번 회차 플롯과 확정 설정, 이전 회차를 참고해서 이 회차 원고만 새 버전으로 만들어줘.'
  :labels[s.selected]+' 초안을 다시 만들어줘. 작품 방향과 확정 자료를 참고해서 이 자료만 작성하고, 회차 원고는 쓰지 마.';
 return send(request);
}):styledButton(official?'확정본 유지':'초안 닫기',()=>action('reject',draft.version));const approve=styledButton(draft.status==='review'?'이 버전 승인':'검토중으로 전환',()=>action(draft.status==='review'?'approve':'review',draft.version),'primary');approve.prepend(svgIcon('check'));$('approvalActions').append(reject,approve);}}$('recoverBtn').hidden=!local.getItem(storage('edit'));renderHistory().catch(e=>notice(e.message));};
const coreCompare=compare;
compare=async function(version){safeMove();await coreCompare(version);setDocumentView('diff');};
const coreHistory=renderHistory;
renderHistory=async function(){await coreHistory();for(const row of $('history').children){row.classList.add('version-row');const text=row.firstChild;if(text?.nodeType===3){const pieces=text.textContent.split(' · ');if(pieces.length>=3){const heading=node('div','');heading.className='version-heading';const status=pieces[1];const badge=node('span',({draft:'초안',review:'검토중',confirmed:'확정',rejected:'거절됨'})[status]||status);badge.className='status-badge '+status;heading.append(node('strong',pieces[0]),badge,node('time',pieces.slice(2).join(' · ')));text.replaceWith(heading);}}}};
const coreAction=action;
action=async function(name,version){
 safeMove();
 const projectId=pid, approvedKey=key();
 if(name==='reject'){
  const message=!approvedKey.startsWith('episode:')?'변경안을 닫고 현재 확정본을 유지할까요?':project.state.official[approvedKey]
   ? '현재 초안을 닫고 확정본을 유지할까요? 닫은 초안은 버전 기록에서 현재 초안으로 복원할 수 있어요.'
   : '현재 초안을 닫을까요? 확정본이 없어 화면이 비지만, 버전 기록에서 현재 초안으로 복원할 수 있어요.';
  if(!window.confirm(message))return;
 }
 await coreAction(name,version);
 if(pid!==projectId)return;
 editKey=null;
 $('editPanel').hidden=true;
 setDocumentView('preview');
 if(name==='approve'){
  if(approvedKey==='plan:0'){
   if(project.state.initial_references_pending){
    await createInitialReferences();
    return;
   }
   await refreshLengthPlan();
  }
  if(['plan',...referenceKinds,'plot'].includes(approvedKey.split(':')[0])&&pid===projectId&&key()===approvedKey){
   const guide=$('approvalGuide');
   const next=guide.querySelector('.approval-guide-actions')?.firstElementChild;
   if(!guide.hidden&&!next?.disabled&&next?.dataset.reviewDocument)await select(next.dataset.reviewDocument);
  }
  if(approvedKey.startsWith('episode:')){
   const episode=Number(approvedKey.split(':')[1]);
   if(key()!==approvedKey)return;
   const stage=project.state.records?.[episode]?.setting_review;
   if(stage==='continuity'||stage==='organize')await runEpisodeSettingsReview(episode,stage);
   else focusEpisodeSettingsReview();
  }
 }
 if(name==='reject')notice(approvedKey.startsWith('episode:')
  ?'초안을 닫았어요. 버전 기록에서 현재 초안으로 복원할 수 있어요.'
  :'변경안을 닫고 현재 확정본을 유지했어요.');
};

let revisionImpactTimer;
let impactView=null;
function dismissRevisionImpactForNavigation(){
 const panel=$('revisionImpactPanel');
 if(!panel||panel.hidden)return;
 const impact=project?.state.revision_impact;
 if(impact)sessionStorage.setItem('storyloom.impact.'+pid+':'+impact.id,'1');
 impactView=null;
 panel.remove();
 document.querySelector('#work .document-pane')?.classList.remove('show-revision-impact');
}
const impactDecisionLabels={accepted:'수락됨',kept:'거절됨 · 수정 필요',acknowledged:'확인 완료'};

function revisionManuscript(body,before,after,patches,navigation=null){
 const area=node('section','');area.className='revision-comparison';
 const controls=node('div','');controls.className='revision-comparison-controls';
 const columns=node('div','');columns.className='revision-comparison-columns';
 const original=node('section','');original.className='revision-comparison-original';original.hidden=true;
 const revised=node('section','');revised.className='revision-comparison-revised';
 const originalText=richText(formatManuscriptParagraphs(before));
 const revisedText=richText(formatManuscriptParagraphs(after));
 original.append(node('h3','기존 원고'),originalText);
 revised.append(node('h3','수정 원고'),revisedText);
 const compare=styledButton('기존 원고랑 비교',()=>{
  const active=!area.classList.contains('is-comparing');
  area.classList.toggle('is-comparing',active);original.hidden=!active;
  compare.textContent=active?'비교 닫기':'기존 원고랑 비교';
  compare.setAttribute('aria-pressed',String(active));
 },'secondary');
 compare.setAttribute('aria-pressed','false');
 if(navigation)navigation.prepend(compare);else controls.append(compare);
 columns.append(original,revised);area.append(controls,columns);body.append(area);
 window.manuscriptDiff.highlight(originalText,revisedText);
 const changes=[...revisedText.querySelectorAll('.manuscript-sentence-change')];
 const legend=node('span',changes.length?'초록색 배경 · 변경된 문장 '+changes.length+'개':'수정본에 추가·변경된 문장이 없어요.');
 legend.className='revision-change-legend';controls.prepend(legend);
 if(changes.length){
  let next=0;
  (navigation||controls).prepend(styledButton('다음 변경 ↓',()=>{
   changes[next].scrollIntoView({block:'center',behavior:'smooth'});next=(next+1)%changes.length;
  },'text-button'));
 }
}

function hasCleanRevisionImpact(impact){
 return ['done','resolved'].includes(impact?.status)&&
  !(impact.results||[]).some(entry=>entry.version||entry.blocked||entry.decision==='kept');
}
function revisionProgressView(impact){
 const raw=impact.phase||'변경 영향 확인 중';
 const match=raw.match(/^(.*?)\s*·\s*현재\s*([\d,]+)자\s*\/\s*목표\s*([\d,~～–-]+)자$/);
 const hasCount=Number.isFinite(impact.total)&&impact.total>0&&Number.isFinite(impact.checked);
 return {phase:match?match[1]:raw,current:match?match[2]+'자':null,target:match?match[3]+'자':null,
  count:hasCount?'회차 진행 '+Math.min(impact.total,Math.max(0,impact.checked))+' / '+impact.total+'화':'작품의 변경 사항을 확인하고 있어요.'};
}
function showRevisionImpact(state){
 const impact=state.revision_impact;
 const pane=document.querySelector('#work .document-pane');
 if(!pane)return;
 let panel=$('revisionImpactPanel');
 if(!panel){
  panel=node('section','');
  panel.id='revisionImpactPanel';
  panel.className='revision-impact-panel';
  pane.append(panel);
 }
 const projectId=pid;
 const active=impact&&impactView?.project===projectId&&impactView.id===impact.id;
 const visible=impact&&!state.archived&&!window.STORYLOOM_PREVIEW&&!editKey&&
  (active||!sessionStorage.getItem('storyloom.impact.'+projectId+':'+impact.id));
 const running=impact?.status==='running'&&Date.now()/1000-impact.started<=600;
 const pendingImpact=['pending','awaiting_settings','settings_ready'].includes(impact?.status);
 const clean=hasCleanRevisionImpact(impact);
 const initialSettingsNotice=impact?.linked_drafts?.length&&
  !Object.keys(state.official).some(key=>key.startsWith('episode:'));
 const settingsReady=initialSettingsNotice&&impact.status==='awaiting_settings';
 panel.hidden=!visible||running||pendingImpact||clean;
 pane.classList.toggle('show-revision-impact',!panel.hidden);
 clearTimeout(revisionImpactTimer);
 let dialog=$('revisionImpactProgress');
 if(dialog&&(!visible||!running)){
  dialog.close();
  dialog.remove();
 }
 if(!impact||state.archived||window.STORYLOOM_PREVIEW)return;
 if(running){
  revisionImpactTimer=setTimeout(async()=>{
   if(pid!==projectId||$('work').hidden)return;
   try{await load();}catch(error){
    if(pid!==projectId||$('work').hidden)return;
    notice(error.message);
    showRevisionImpact(project.state);
   }
  },2000);
 }
 if(!visible||(pendingImpact&&!settingsReady))return;
 if(!active)impactView={project:projectId,id:impact.id};
 if(running){
  if(!dialog){
   dialog=node('dialog','');
   dialog.id='revisionImpactProgress';
   dialog.className='length-dialog episode-review-progress revision-progress-dialog';
   dialog.setAttribute('aria-label','회차 점검 중');
   dialog.addEventListener('cancel',event=>event.preventDefault());
   const status=node('p','');
   status.setAttribute('role','status');
   const progress=node('progress','');
   progress.setAttribute('aria-label','회차 점검 진행률');
   const metrics=node('div','');metrics.className='revision-progress-metrics';
   const count=node('p','');count.className='revision-progress-count';
   dialog.append(node('h2','변경 사항 반영 중'),status,metrics,progress,count);
   document.body.append(dialog);
  }
  const status=dialog.querySelector('[role="status"]');
  const hasCount=Number.isFinite(impact.total)&&impact.total>0&&Number.isFinite(impact.checked);
  const view=revisionProgressView(impact);
  if(status.textContent!==view.phase)status.textContent=view.phase;
  const metrics=dialog.querySelector('.revision-progress-metrics');metrics.hidden=!view.current;
  metrics.replaceChildren();
  if(view.current){
   for(const [label,value] of [['현재 분량',view.current],['목표 분량',view.target]]){
    const metric=node('div','');metric.append(node('span',label),node('strong',value));metrics.append(metric);
   }
  }
  dialog.querySelector('.revision-progress-count').textContent=view.count;
  const progress=dialog.querySelector('progress');
  progress.max=hasCount?impact.total:1;
  if(!hasCount||impact.checked===0)progress.removeAttribute('value');
  else progress.value=Math.max(0,Math.min(impact.checked,impact.total));
  if(!dialog.open)dialog.showModal();
  return;
 }
 const close=()=>{
  sessionStorage.setItem('storyloom.impact.'+projectId+':'+impact.id,'1');
  impactView=null;
  showApprovalGuide();
 };
 if(clean&&initialSettingsNotice){
  close();
  return;
 }
 if(clean||settingsReady){
  if($('revisionImpactClean'))return;
  const confirmation=node('dialog','');
  confirmation.id='revisionImpactClean';
  confirmation.className='length-dialog episode-review-progress';
  confirmation.setAttribute('aria-label','변경 영향 점검 완료');
  const dismiss=()=>{
   confirmation.close();
   confirmation.remove();
   close();
  };
  confirmation.addEventListener('cancel',event=>{
   event.preventDefault();
   dismiss();
  });
  confirmation.append(node('h2','점검 완료'),node('p',impact.linked_drafts?.length?'연결된 설정 자료의 수정안이 준비됐어요.':'수정이 필요한 문제를 찾지 못했어요.'),
   styledButton('확인',dismiss,'primary'));
  document.body.append(confirmation);
  confirmation.showModal();
  return;
 }
 const heading=node('h2','변경 영향 점검 결과');
 const header=node('header','');
 header.className='revision-impact-heading';
 header.append(heading);
 const body=node('div','');
 body.className='document-body';
 const footer=node('footer','');
 footer.className='document-footer revision-impact-footer';
 footer.append(styledButton('닫기',close));
 panel.replaceChildren(header,body,footer);
 const start=async (mode,episode)=>{
  safeMove();
  const view=impactView;
  const scrollTop=body.scrollTop;
  const rejectedDraft=mode==='keep'?state.drafts['episode:'+episode]:null;
  for(const button of footer.querySelectorAll('button'))button.disabled=true;
  try{
   await api('/projects/'+projectId+'/revision-impact',{id:impact.id,mode,episode});
   if(pid===projectId){
    if(episode!==undefined&&impactView===view&&view.episode===episode){
     view.scrollTop=scrollTop;
     view.rejectedDraft=rejectedDraft;
    }
    await load();
   }
  }finally{
   for(const button of footer.querySelectorAll('button'))button.disabled=false;
  }
 };
 const rows=new Map();
 for(const entry of impact.results||[]){
  const row=rows.get(entry.episode)||{episode:entry.episode,reasons:[],blocked:false};
  row.blocked ||= entry.blocked;
  row.patchError ||= entry.patch_error;
  if(entry.decision)row.decision=entry.decision;
  if(entry.reason)row.reasons.push(...entry.reason.split(/\r?\n/).map(line=>line.trim())
   .filter(line=>line&&!/^(?:note\s*[:：]?\s*)?(?:none|null|없음|n\/a)\.?$/i.test(line))
   .map(line=>line==='수정할 문장이 없거나 여러 곳에 있습니다. 위치를 더 구체적으로 지정하세요.'
    ?'AI가 제안한 수정 구절을 원고에 적용하지 못했어요.':line)
   .map(line=>line.replace(/^note\s*[:：]\s*/i,'')));
  if(entry.version)Object.assign(row,{version:entry.version,base_version:entry.base_version,patches:entry.patches});
  rows.set(entry.episode,row);
 }
 const selected=rows.get(impactView.episode);
 if(selected){
  const id='episode:'+selected.episode;
  const activeDraft=state.drafts[id];
  const scopedDraft=!selected.version&&!selected.decision&&activeDraft&&
   activeDraft.version!==impact.superseded_drafts?.[id]?activeDraft:null;
  const revised=scopedDraft||[activeDraft,state.official[id],impactView.rejectedDraft].find(item=>item?.version===selected.version);
  const manuscript=revised||state.official[id];
  const versionLabel=revised?(revised===state.official[id]?'반영된 원고':'수정안'):'기존 원고';
  heading.textContent=selected.episode+'화 · '+versionLabel;
  const back=()=>{
   delete impactView.episode;
   delete impactView.rejectedDraft;
   delete impactView.scrollTop;
   showRevisionImpact(project.state);
  };
  footer.replaceChildren();
  const navigation=node('div','');navigation.className='revision-impact-navigation';
  navigation.append(styledButton('점검 결과로',back));header.append(navigation);
  if(!selected.version&&!scopedDraft){
   const status=node('p',selected.decision==='acknowledged'?'기존 원고를 유지했어요.':
    selected.patchError?'수정안을 만들지 못했어요. AI에 다시 맡기거나 본문에서 구절을 선택해 수정할 수 있어요.':
    '이 회차의 수정안은 생성되지 않았어요.');
   status.className='document-submeta';
   body.append(status);
  }
  if(selected.reasons.length){
   const notes=node(revised?'details':'aside','');
   notes.className='revision-impact-notes';
   notes.append(node(revised?'summary':'h3',selected.patchError?'작업 결과':'점검 의견'),...[...new Set(selected.reasons)].map(reason=>node('p',reason)));
   body.append(notes);
  }
  if(manuscript){
   const before=impactView.before;
   if(revised&&before!==undefined&&!scopedDraft)revisionManuscript(body,before,revised.text,selected.patches||[],navigation);
   else{
    const prose=richText(formatManuscriptParagraphs(manuscript.text));
    if((!selected.version||scopedDraft)&&manuscript===(activeDraft||state.official[id])){
     prose.dataset.selectionDocument=id;
    }
    body.append(prose);
   }
  }
  if(selected.decision){
   const status=node('span',impactDecisionLabels[selected.decision]);
   status.setAttribute('role','status');
   footer.append(status);
  }else if(['ready','blocked','done'].includes(impact.status)){
   if(state.drafts[id]?.version===selected.version&&selected.version){
    footer.append(styledButton('거절',()=>start('keep',selected.episode)),
     styledButton('수락',()=>start('accept',selected.episode),'primary'));
   }else if(scopedDraft){
    footer.append(styledButton('수정안 검토하기',async()=>{
     safeMove();
     close();
     $('episodeInput').value=selected.episode;
     await select('episode');
    },'primary'));
   }else if(!selected.version&&!selected.patchError){
    footer.append(styledButton('확인',()=>start('acknowledge',selected.episode)));
   }
  }
  if(selected.decision==='kept'||(!selected.decision&&!selected.version&&selected.blocked)){
   if(impact.retry_error)body.prepend(node('p',impact.retry_error));
   footer.append(styledButton('직접 편집',async()=>{
    safeMove();
    close();
    $('episodeInput').value=selected.episode;
    await select('episode');
    if(pid===projectId&&key()===id)beginEdit();
   },'secondary revision-direct-edit'));
   if(!state.drafts[id]||state.drafts[id].version===impact.superseded_drafts?.[id])footer.append(styledButton(selected.decision==='kept'?'AI 수정안 다시 만들기':'AI 수정안 만들기',
    ()=>start('retry',selected.episode),'primary'));
  }
  if(impactView.scrollTop!==undefined)body.scrollTop=impactView.scrollTop;
  return;
 }
 if(['failed','running'].includes(impact.status)){
  heading.textContent='변경 확인';
  body.append(node('p',impact.error||'점검을 마치지 못했어요. 다시 시도할 수 있어요.'));
  footer.append(styledButton('다시 시도',()=>start('auto'),'primary'));
 }else{
  if(impact.retry_error)body.append(node('p',impact.retry_error));
  body.append(node('p',({
   ready:'회차 수정안이 준비됐어요.',
   blocked:'확인이 필요한 회차가 있어요.',
   confirmed:'수정한 회차를 확정했어요.',
   done:rows.size?'점검 의견을 확인할 수 있어요.':'수정이 필요한 회차가 없어요.',
   resolved:hasRejectedRevision(impact)?'거절한 회차의 AI 수정안을 다시 만들어 주세요.':'변경 사항을 모두 확정했어요.'
  })[impact.status]||''));
  for(const row of [...rows.values()].sort((a,b)=>a.episode-b.episode)){
   const item=node('div','');
   item.className='revision-impact-row';
   const label=impactDecisionLabels[row.decision]||
    (impact.status==='confirmed'?'확정':'확인 필요');
   item.append(node('strong',row.episode+'화'),node('span',label),styledButton(row.version&&row.decision!=='kept'?'수정 내용 보기 →':'원고 보기 →',async()=>{
    const view=impactView;
    const id='episode:'+row.episode;
    const base=row.base_version||state.drafts[id]?.base_official_version;
    let before;
    if(base){
     if(state.official[id]?.version===base)before=state.official[id].text;
     else{
      const versions=await api('/projects/'+projectId+'/versions?kind=episode');
      const original=versions.find(item=>item.id===base);
      if(original)before=JSON.parse(original.content).text;
     }
    }
    if(pid!==projectId||impactView!==view||project.state.revision_impact?.id!==impact.id)return;
    Object.assign(view,{episode:row.episode,before});
    showRevisionImpact(project.state);
   },'text-button'));
   body.append(item);
  }
 }
}
function pendingWritingReviews(state){
 return ['plan',...referenceKinds,'plot'].filter(kind=>state.drafts[kind+':0']?.text?.trim());
}
function guideDocumentReview(kind,label=labels[kind]){
 const review=styledButton(label+' 검토하기',()=>select(kind));
 review.dataset.reviewDocument=kind;
 return review;
}
function linkedSettingsReviewKeys(state){
 const impact=state.revision_impact;
 if(impact?.status!=='awaiting_settings')return [];
 const waiting=impact.waiting_settings||[];
 return impact.setup_review
  ?[...new Set([...waiting,...pendingWritingReviews(state).map(kind=>kind+':0')])]
  :waiting;
}
const startingInitialReferences=new Set();
async function createInitialReferences(){
 safeMove();
 if(busy||startingInitialReferences.has(pid))return;
 const requested=pid;
 const state=project.state, plan=state.official['plan:0'];
 if(!plan||state.drafts['plan:0']||!state.initial_references_pending)return;
 if(pending?.setup_plan_version!==plan.version){
  pending={request_id:crypto.randomUUID(),text:'확정 기획안으로 설정 초안 만들기',setup_plan_version:plan.version};
 }
 startingInitialReferences.add(requested);
 showApprovalGuide();
 try{
  await coreSend();
 }finally{
  startingInitialReferences.delete(requested);
  if(pid===requested)showApprovalGuide();
 }
}
function hasRejectedRevision(impact){
 return (impact?.results||[]).some(entry=>entry.decision==='kept');
}
function needsLinkedSettings(impact){
 return impact?.status==='pending'&&!impact.settings_checked&&Object.keys(impact.changes||{})
  .some(key=>[...referenceKinds,'plot'].includes(key.split(':')[0]));
}
function pendingImpactReviews(state){
 const pending=pendingWritingReviews(state);
 if(!needsLinkedSettings(state.revision_impact)||Object.keys(state.official).some(key=>key.startsWith('episode:')))return pending;
 if(state.revision_impact.setup_review)return pending.filter(kind=>state.drafts[kind+':0'].setup_edit_base);
 return pending.filter(kind=>{
  const key=kind+':0', draft=state.drafts[key];
  return state.official[key]||draft.status==='review'||draft.manual_lines?.length;
 });
}
function revisionImpactBlocksWriting(state){
 return ['pending','awaiting_settings','settings_ready','running','ready','blocked','failed'].includes(state.revision_impact?.status)||
  hasRejectedRevision(state.revision_impact);
}
function episodeResultConfirmed(reviewId){
 return local.getItem('storyloom.episode-result-confirmed.'+reviewId)==='1';
}
async function confirmRevisionImpact(){
 safeMove();
 const projectId=pid;
 const impact=project.state.revision_impact;
 if(!['pending','settings_ready'].includes(impact?.status)||$('revisionImpactConfirm')||pendingImpactReviews(project.state).length)return;
 const dialog=node('dialog','');
 dialog.id='revisionImpactConfirm';
 dialog.className='length-dialog draft-save-dialog revision-impact-confirm';
 dialog.setAttribute('aria-labelledby','revisionImpactConfirmTitle');
 const checkingSettings=needsLinkedSettings(impact);
 const heading=node('h2',checkingSettings?'연결된 설정에 변경 사항을 반영할까요?':'확정한 변경 사항을 기존 원고에 반영할까요?');
 heading.id='revisionImpactConfirmTitle';
 const form=node('form','');
 form.method='dialog';
 const footer=node('footer','');
 for(const [value,label,style] of [['no','아니요','secondary'],['yes','예','primary']]){
  const choice=node('button',label);
  choice.type='submit';
  choice.value=value;
  choice.className=style;
  footer.append(choice);
 }
 form.append(heading,footer);
 dialog.append(form);
 document.body.append(dialog);
 const decision=await new Promise(resolve=>{
  dialog.addEventListener('close',()=>resolve(dialog.returnValue),{once:true});
  dialog.showModal();
 });
 dialog.remove();
 if(decision!=='yes'||pid!==projectId||project.state.revision_impact?.id!==impact.id||pendingImpactReviews(project.state).length)return;
 await api('/projects/'+projectId+'/revision-impact',{id:impact.id,mode:'auto'});
 if(pid===projectId)await load();
}
function showApprovalGuide(){
 const state=project.state;
 const guide=$('approvalGuide');
 showRevisionImpact(state);
 guide.hidden=true;
 guide.replaceChildren();
 const panel=$('revisionImpactPanel');
 $('revisionImpactShortcut')?.remove();
 if((panel&&!panel.hidden)||$('revisionImpactProgress')?.open||$('revisionImpactClean')?.open)return;
 if(state.branch_origin?.revision_required){
  const start=state.branch_origin.episode;
  guide.hidden=false;
  guide.append(node('strong',start+'화를 먼저 수정하고 확정해 주세요.'),styledButton(start+'화 수정하기',async()=>{
   $('episodeInput').value=start;await select('episode');$('chatInput').focus();
  },'primary'));
  return;
 }

 const impact=state.revision_impact;
 const pendingImpact=['pending','settings_ready'].includes(impact?.status)&&!state.archived&&!window.STORYLOOM_PREVIEW;
 const finished=impact?.status==='confirmed'||(impact?.status==='resolved'&&
  !hasRejectedRevision(impact));
 if(impact&&!pendingImpact&&impact.status!=='awaiting_settings'&&!finished&&!hasCleanRevisionImpact(impact)&&!state.archived&&!window.STORYLOOM_PREVIEW&&panel){
  const reopen=styledButton('변경 영향 보기',()=>{
   impactView={project:pid,id:state.revision_impact.id};
   showApprovalGuide();
  },'text-button');
  reopen.id='revisionImpactShortcut';
  $('documentStatus').before(reopen);
 }
 const episodeKeys=Object.keys({...state.official,...state.drafts}).filter(id=>id.startsWith('episode:'));
 const last=Math.max(0,...episodeKeys.map(id=>Number(id.split(':')[1])));
 const lastKey='episode:'+last;
 const proposal=currentLengthRecommendation(state)?.proposal_version;
 const missing=[['plan','기획안'],...referenceKinds.map(id=>[id,labels[id]]),['plot','플롯']]
  .filter(([id])=>!state.official[id+':0']?.text?.trim()||
   (id==='plot'&&proposal&&state.drafts['plot:0']?.version===proposal));
 if(!last&&!['plan',...referenceKinds,'plot'].some(id=>state.official[id+':0']))return;
 const actions=node('div','');
 actions.className='approval-guide-actions';
 let description;

 const stage=state.records?.[last]?.setting_review;
 const pendingReview=Object.entries(state.records||{}).find(([episode,record])=>
  record.setting_review&&record.setting_review!=='done'&&state.official['episode:'+episode]&&!state.drafts['episode:'+episode]);
 const batch=state.episode_batch;
 const batchReview=Object.keys(batch?.draft_versions||{}).map(Number).sort((a,b)=>a-b)
  .find(number=>state.drafts['episode:'+number]);
 const chapterReview=batchReview||
  (last&&state.drafts[lastKey]&&state.drafts[lastKey].version!==impact?.superseded_drafts?.[lastKey]?last:0);
 if(['running','stopping'].includes(batch?.status)){
  description=batch.status==='stopping'?'이어 쓰기를 중단하고 있어요.':
   `${batch.next}화 집필 중 · ${batch.next-batch.start}/${batch.end-batch.start+1}화 작성 완료`;
  if(batch.status==='running')actions.append(styledButton('이어 쓰기 중단',()=>updateEpisodeBatch('stop')));
 }else if(impact?.status==='awaiting_settings'){
  description='변경된 설정 자료를 검토하고 확정해 주세요.';
  actions.classList.add('preparation-actions');
  for(const key of linkedSettingsReviewKeys(state)){
   const kind=key.split(':')[0];
   actions.append(guideDocumentReview(kind));
  }
 }else if(!pendingImpact&&state.initial_references_pending&&state.official['plan:0']&&!state.drafts['plan:0']){
  const preparing=startingInitialReferences.has(pid)||project.jobs?.some(job=>job.status==='running');
  description=preparing?'확정한 기획안으로 설정 초안을 만들고 있어요.':'설정 초안이 아직 완성되지 않았어요.';
  if(!preparing)actions.append(styledButton('설정 초안 다시 만들기',createInitialReferences,'primary'));
 }else if(pendingReview){
  const [episode,record]=pendingReview;
  description=episode+'화 설정 검토가 남아 있어요.';
  actions.append(styledButton('설정 검토 이어가기 →',async()=>{
   safeMove();
   const requested=pid;
   deferredEpisodeSettings.delete(pid+':'+episode+':'+record.version);
   $('episodeInput').value=episode;
   await select('episode');
   if(pid===requested)focusEpisodeSettingsReview();
  },'primary'));
 }else if(chapterReview){
  description=chapterReview+'화 초안이 준비됐어요.';
  actions.append(styledButton('원고 검토하기 →',async()=>{
   safeMove();
   $('episodeInput').value=chapterReview;
   await select('episode');
  },'primary'));
 }else if((pendingImpact?pendingImpactReviews(state):pendingWritingReviews(state)).length){
  description='다음 회차를 쓰기 전에 검토할 자료가 있어요.';
  actions.classList.add('preparation-actions');
  for(const kind of pendingImpact?pendingImpactReviews(state):pendingWritingReviews(state)){
   actions.append(guideDocumentReview(kind));
  }
 }else if(pendingImpact){
  const checkingSettings=needsLinkedSettings(impact);
  description=checkingSettings?'연결된 설정을 점검할 차례예요.':'회차 원고에 반영할 변경 사항이 있어요.';
  actions.append(styledButton(checkingSettings?'설정에 변경 사항 반영하기':'회차에 변경 사항 반영하기',confirmRevisionImpact,'primary'));
 }else if(revisionImpactBlocksWriting(state)){
  description=hasRejectedRevision(impact)?'거절한 회차의 수정안을 확정해 주세요.':'확정할 변경 사항이 남아 있어요.';
  actions.append(styledButton('변경 사항 확정하기',()=>{
   impactView={project:pid,id:impact.id};
   showApprovalGuide();
  },'primary'));
 }else if(state.settings.total_episodes!==null&&last>=state.settings.total_episodes){
  return;
 }else if(!last&&missing.length){
  actions.classList.add('preparation-actions');
  const empty=missing.filter(([id])=>!state.drafts[id+':0']?.text?.trim());
  description=empty.length
   ?'아직 초안이 없는 자료: '+empty.map(([,label])=>label).join(', ')+'. 채팅에서 다시 요청할 수 있어요.'
   :'첫 회차를 쓰기 전에 기획과 설정을 검토해 주세요.';
  for(const [id,label] of missing){
   if(state.drafts[id+':0']?.text?.trim())actions.append(guideDocumentReview(id,label));
  }
 }else if(!last&&state.length_setup_pending&&state.official['plot:0']){
  description='첫 회차를 쓰기 전에 분량을 정해 주세요.';
  actions.append(styledButton('분량 정하기',()=>openLengthDialog(),'primary'));
 }else{
  const next=last+1;
  description=finished?'변경 사항을 모두 확정했어요.':last&&stage==='done'?last+'화 설정 검토를 마쳤어요.':next+'화 초안을 작성해 볼까요?';
  if(!revisionImpactBlocksWriting(state)){
   actions.append(styledButton(next+'화 집필',writeNextEpisode,'primary'));
   if(!missing.length&&next<(state.settings.total_episodes??10000)&&batch?.status!=='paused')
    actions.append(styledButton('여러 화 이어 쓰기',()=>openEpisodeBatch(next)));
  }
 }
 if(batch?.status==='paused'&&batch.next<=batch.end){
  const canResume=!batch.needs_approval||state.records?.[batch.needs_approval]?.setting_review==='done';
  if(canResume)actions.append(styledButton('이어 쓰기 재개',()=>updateEpisodeBatch('resume')));
 }
 guide.dataset.project=pid;
 guide.replaceChildren(node('strong',description),actions);
 if(batch?.status==='paused'&&batch.reason&&!/^\d+화 설정 검토를 마친 뒤 이어 쓸 수 있어요\.?$/.test(batch.reason))guide.append(node('small',batch.reason));
 if(batch?.status!=='running')for(const button of actions.querySelectorAll('button'))button.disabled=busy;
 guide.hidden=false;
}
async function updateEpisodeBatch(action,count){
 safeMove();
 const requested=pid;
 await api('/projects/'+requested+'/episode-batch',{action,count});
 if(pid===requested)await load();
}
function openEpisodeBatch(first){
 const dialog=node('dialog','');
 dialog.className='length-dialog episode-batch-dialog';
 const heading=node('h2','여러 화 이어 쓰기');
 heading.id='episodeBatchTitle';
 dialog.setAttribute('aria-labelledby',heading.id);
 const form=node('form','');
 const fields=node('div','');
 form.noValidate=true;
 fields.className='length-fields';
 const start=node('input','');
 start.value=first+'화';
 start.readOnly=true;
 const startLabel=node('label','시작 회차');
 startLabel.append(start);
 const end=node('input','');
 end.type='number';
 end.min=String(first+1);
 end.max=String(project.state.settings.total_episodes??10000);
 end.value=end.min;
 end.required=true;
 end.autofocus=true;
 const endLabel=node('label','어디까지 쓸까요?');
 endLabel.append(end);
 fields.append(startLabel,endLabel);
 const range=node('p','');
 range.setAttribute('aria-live','polite');
 const error=node('p','');
 error.id='episodeBatchError';
 error.className='episode-batch-error';
 error.setAttribute('aria-live','polite');
 end.setAttribute('aria-describedby',error.id);
 const footer=node('footer','');
 const cancel=styledButton('닫기',()=>dialog.close());
 cancel.type='button';
 const submit=node('button','이어 쓰기 시작');
 submit.className='primary';
 const update=()=>{
  const validity=end.validity;
  const message=validity.rangeOverflow?`최대 ${end.max}화까지 이어 쓸 수 있어요.`:
   validity.rangeUnderflow?`마지막 회차는 ${end.min}화부터 선택할 수 있어요.`:
   !validity.valid?'마지막 회차를 숫자로 입력해 주세요.':'';
  error.textContent=message;
  error.hidden=!message;
  end.setAttribute('aria-invalid',String(!!message));
  range.hidden=!!message;
  range.textContent=message?'':`${first}화부터 ${end.value}화까지 초안 ${Number(end.value)-first+1}개를 작성해요.`;
  submit.disabled=!!message;
 };
 end.oninput=update;
 update();
 footer.append(cancel,submit);
 form.append(fields,range,error,footer);
 form.onsubmit=async event=>{
  event.preventDefault();
  if(!end.validity.valid){update();return;}
  submit.disabled=true;
  try{await updateEpisodeBatch('start',Number(end.value)-first+1);dialog.close();}
  catch(err){error.textContent=err.message;error.hidden=false;}
  finally{submit.disabled=false;}
 };
 dialog.append(heading,form);
 dialog.addEventListener('close',()=>dialog.remove(),{once:true});
 document.body.append(dialog);
 dialog.showModal();
}
const coreEdit=beginEdit;
beginEdit=function(recovery){coreEdit(recovery);$('preview').hidden=true;$('editPanel').scrollIntoView({block:'nearest'});};
const coreCloseEdit=$('closeEditBtn').onclick;
$('closeEditBtn').onclick=async()=>{await coreCloseEdit();if(!editKey){setDocumentView('preview');updateSaveIndicator();}};
const corePark=$('parkEditBtn').onclick;
$('parkEditBtn').onclick=async()=>{await corePark();if(!editKey){setDocumentView('preview');updateSaveIndicator();}};
$('chatInput').addEventListener('keydown',e=>{if(e.key==='Enter'&&(e.ctrlKey||e.metaKey)){e.preventDefault();if(!busy)$('chatForm').requestSubmit();}});
authMode(false);
run(init)();

// Keep the save indicator honest while edits are pending or failing.
let savedDraftEditKey=null;
function updateDraftSaveButton(button){
 const saved=Boolean(editKey&&savedDraftEditKey===editKey&&!dirty);
 button.textContent=saved?'저장됨':'초안 저장';
 button.classList.toggle('draft-save-complete',saved);
}
function updateSaveIndicator(){
 const label=$('saveIndicator').querySelector('span');
 label.textContent=busy?'AI 작업 중':saving?'저장 중':dirty?'미저장 편집 있음':'저장됨';
 if(editKey)updateDraftSaveButton(isManualDocumentEdit()?$('editBtn'):$('saveBtn'));
}
const coreRemember=rememberEdit;
rememberEdit=function(){coreRemember();updateSaveIndicator();};
$('editor').oninput=rememberEdit;
const coreSave=saveEdit;
saveEdit=async function(){const result=coreSave();updateSaveIndicator();try{return await result;}finally{updateSaveIndicator();}};
$('saveBtn').onclick=run(()=>saveEdit());
const coreSend=send;
send=async function(text,scope){safeMove();if((await refreshUsage()).remaining===0)throw Error('오늘의 앱 AI 호출 한도에 도달했습니다. 한국시간 자정 이후 이용하세요.');if(editKey){editKey=null;$('editPanel').hidden=true;setDocumentView('preview');}return coreSend(text,scope);};

const corePoll=poll;
poll=async function(){
 const requested=pid;
  await corePoll();
  if(pid===requested&&!activeJob&&!$('work').hidden&&project.state.length_setup_pending&&pending
      &&$('jobState').textContent==='첫 회차 집필 전에 분량을 설정해 주세요.'){
   openLengthDialog(()=>sendWithLength());
  }
};

const renderAtScale=render;
render=function(){renderAtScale();const last=project.state.messages.at(-1);if(last?.role==='user')return;const bubble=$('messages').lastElementChild?.querySelector('.message-content');if(!bubble)return;const links=node('div','');links.className='message-document-links';if(project.state.drafts['plan:0']||project.state.official['plan:0']){const b=styledButton('기획안 보기',()=>select('plan'));b.prepend(svgIcon('file'));links.append(b);}const episodes=Object.keys({...project.state.official,...project.state.drafts}).filter(k=>k.startsWith('episode:')).map(k=>Number(k.split(':')[1]));if(episodes.length){const ep=Math.max(...episodes);const b=styledButton(ep+'화 원고 보기',async()=>{$('episodeInput').value=ep;await select('episode');});b.prepend(svgIcon('book'));links.append(b);}if(links.children.length){bubble.append(links);$('messages').scrollTop=$('messages').scrollHeight;}};

const referenceRender=render;
render=function(){referenceRender();const isReference=[...referenceKinds,'plot'].includes(project.state.selected);$('referenceTabs').hidden=!isReference||documentView!=='preview';if(isReference)$('documentTabLabel').textContent='설정 자료집';for(const b of document.querySelectorAll('[data-reference]')){b.classList.toggle('active',b.dataset.reference===project.state.selected);b.setAttribute('aria-current',b.dataset.reference===project.state.selected?'page':'false');}};
const referenceView=setDocumentView;
setDocumentView=function(view){
 referenceView(view);
 const selected=project?.state.selected;
 const isSetting=referenceKinds.includes(selected);
 $('referenceTabs').hidden=view!=='preview'||!(isSetting||selected==='plot');
 $('officialSettings').hidden=selected!=='plot';
};
async function refreshProjectSwitcher(){}
const switcherRender=render;
render=function(){switcherRender();refreshProjectSwitcher().catch(e=>notice(e.message));};

const headingRender=render;
render=function(){headingRender();const item=visibleDocumentDraft(project.state,key())||project.state.official[key()];const badge=$('documentStatus');badge.hidden=!item;badge.textContent=item?({draft:'초안',review:'검토중',confirmed:'확정'})[item.status]||item.status:'';badge.className='status-badge '+(item?.status||'');const refs=referenceKinds.includes(project.state.selected);$('officialSettings').parentElement.hidden=false;setDocumentView(documentView);};

let selectedHistory=null;
let historySelection=null,historyRequest=0;
const historyKey=()=>historySelection?.pid===pid?historySelection.key:key();
function chooseHistoryKey(keys,current,preferred){
 const episodes=keys.filter(id=>id.startsWith('episode:')).sort((a,b)=>Number(b.split(':')[1])-Number(a.split(':')[1]));
 return [preferred,current.startsWith('episode:')?current:null,...episodes,current,...keys]
  .find(id=>keys.includes(id));
}
const versionLabel=v=>'#'+v.id+' · '+({draft:'초안',review:'검토중',confirmed:project.state.official[v.kind+':'+v.episode]?.version===v.id?'현재 확정본':'이전 확정본',rejected:'거절됨'})[v.status];
renderHistory=async function(){
 if(documentView!=='history')return;
 const requested=pid,request=++historyRequest;const all=await api('/projects/'+requested+'/versions?kind=episode');if(requested!==pid||request!==historyRequest||documentView!=='history')return;
 const selector=$('historySource');
 const keys=[...new Set(all.filter(v=>v.kind==='episode').map(v=>'episode:'+v.episode))]
  .sort((a,b)=>Number(b.split(':')[1])-Number(a.split(':')[1]));
 const selected=chooseHistoryKey(keys,key(),historySelection?.pid===pid?historySelection.key:null);
 selector.replaceChildren(...keys.map(id=>{
  const episode=id.split(':')[1];
  const option=node('option',episode+'화 원고');
  option.value=id;return option;
 }));
 selector.hidden=!keys.length;
 if(selected){selector.value=selected;historySelection={pid,key:selected};}
 selector.onchange=run(async()=>{historySelection={pid,key:selector.value};selectedHistory=null;$('historyDetail').hidden=true;await renderHistory();});
 const versions=all.filter(v=>v.kind+':'+v.episode===selected);$('history').replaceChildren();$('historyDetail').replaceChildren();
 $('historyDetail').hidden=true;
 if(!versions.length){$('history').append(node('p','아직 저장된 원고 버전이 없어요.'));return;}
 const chosen=selectedHistory?.pid===pid&&selectedHistory?.key===selected?versions.find(v=>v.id===selectedHistory.id):null;
 async function choose(v){selectedHistory={pid:requested,key:selected,id:v.id};for(const b of $('history').querySelectorAll('button')){const active=Number(b.dataset.version)===v.id;b.classList.toggle('active',active);b.setAttribute('aria-pressed',String(active));}
  const panel=$('historyDetail');panel.replaceChildren();panel.append(node('h4',versionLabel(v)),node('p',new Date(v.created*1000).toLocaleString()),documentContent(JSON.parse(v.content).text,v.kind,v.status));
  const controls=node('div','');controls.className='history-compare-controls';const label=node('label','비교할 기준 '),select=document.createElement('select');select.setAttribute('aria-label','버전 비교 기준');
  for(const [value,text]of [['official','현재 확정본'],['draft','현재 초안']]){const record=project.state[value==='draft'?'drafts':'official'][selected];if(record&&record.version!==v.id){const o=node('option',text);o.value=value;select.append(o);}}
  for(const other of versions.filter(x=>x.id!==v.id)){const o=node('option',versionLabel(other));o.value='v:'+other.id;select.append(o);}label.append(select);
  const result=node('div','');result.className='diff-panel history-comparison';
  const compareButton=styledButton('선택 버전과 비교',async()=>{safeMove();if(!select.value)throw Error('비교할 다른 버전이 없습니다.');const baseline=select.value;const query=baseline.startsWith('v:')?'&version='+baseline.slice(2):baseline==='draft'?'&base=draft':'';const data=await api('/projects/'+requested+'/compare?key='+encodeURIComponent(selected)+'&after_version='+v.id+query);if(pid!==requested||historyKey()!==selected||selectedHistory?.id!==v.id)return;result.replaceChildren(node('h4',select.options[select.selectedIndex].text+' → '+versionLabel(v)),node('p','삭제된 내용 / 추가된 내용'));for(const change of data.changes){if(change.type==='equal')result.append(node('pre',change.after));else{if(change.before)result.append(node('del',change.before));if(change.after)result.append(node('ins',change.after));}}if(data.changes.every(c=>c.type==='equal'))result.prepend(node('p','두 버전의 내용이 같습니다.'));});if(select.options.length)controls.append(label,compareButton);
  const restore=styledButton('이 버전을 현재 초안으로 복원',async()=>{
   safeMove();
   restore.disabled=true;
   try{
    const current=project.state.drafts[selected]||project.state.official[selected];
    const response=await api('/projects/'+requested+'/draft',{
     action:'restore',key:selected,version:v.id,base_version:current?.version??null
    });
    if(pid!==requested||historyKey()!==selected)return;
    if(!response.unchanged)await load();
    notice(response.unchanged?'이미 현재 초안인 버전이에요.':'선택 버전을 현재 초안으로 복원했어요.');
   }finally{
    restore.disabled=false;
   }
  });
  if(![project.state.official[selected]?.version,project.state.drafts[selected]?.version].includes(v.id))controls.append(restore);
  const state=project.state;
  const protectedVersions=new Set([
   ...Object.values(state.official).map(record=>record.version),
   ...Object.values(state.drafts).flatMap(record=>[record.version,record.base_official_version])
  ]);
  if(!protectedVersions.has(v.id)){
   const remove=styledButton('버전 삭제',async()=>{
    safeMove();
    if(!window.confirm('#'+v.id+' 버전을 삭제할까요? 삭제한 버전은 복원할 수 없어요.'))return;
    remove.disabled=true;
    try{
     await api('/projects/'+requested+'/draft',{action:'delete',key:selected,version:v.id});
     if(pid!==requested||historyKey()!==selected)return;
     selectedHistory=null;
     await renderHistory();
     notice('선택한 버전을 삭제했어요.');
    }finally{
     remove.disabled=false;
    }
   },'secondary delete-work');
   controls.append(remove);
  }
  panel.append(controls,result);
  panel.hidden=false;
 }
 for(const v of versions){
  const b=button(versionLabel(v)+' · '+new Date(v.created*1000).toLocaleString(),()=>{
   if(selectedHistory?.pid===requested&&selectedHistory.key===selected&&selectedHistory.id===v.id){
    selectedHistory=null;
    const panel=$('historyDetail');
    panel.hidden=true;
    panel.replaceChildren();
    b.classList.remove('active');
    b.setAttribute('aria-pressed','false');
    return;
   }
   return choose(v);
  });
  b.dataset.version=v.id;
  b.setAttribute('aria-pressed','false');
  $('history').append(b);
 }
 if(chosen)await choose(chosen);
};
compare=async function(version){safeMove();historySelection={pid,key:key()};if(version)selectedHistory={pid,key:key(),id:version};setDocumentView('history');await renderHistory();};

const historyDocumentView=setDocumentView;
setDocumentView=function(view){historyDocumentView(view);document.body.dataset.documentView=view;$('documentTabLabel').textContent=view==='history'?'버전 기록':referenceKinds.includes(project.state.selected)?'설정 자료집':project.state.selected==='plot'?'플롯·회차 구성':project.state.selected==='episode'?'원고 미리보기':labels[project.state.selected]+' 미리보기';$('documentStatus').hidden=view==='history'||!(project.state.drafts[key()]||project.state.official[key()]);};

function plotDocument(text){const parts=parsePlotDocument(plotContainsPlanningOnly(text)?'':text),root=node('div','');root.className='plot-document';for(const [heading,body] of [['전체 아웃라인',parts.overall],['회차 구성',parts.episodes]]){const section=node('section','');section.className='plot-section';section.append(node('h3',heading));if(!body)section.append(node('p',heading+'이 아직 작성되지 않았습니다.'));else if(heading==='회차 구성'&&!body.includes('|')){const rows=parseEpisodeNotes(body);if(rows.length){const table=node('table','');table.className='document-table';const head=node('thead',''),tr=node('tr','');for(const label of ['회차','주요 사건'])tr.append(node('th',label));head.append(tr);table.append(head);const tb=node('tbody','');for(const record of rows){const row=node('tr','');row.append(node('td',record.episode+'화'),node('td',record.description||'기록된 사건 없음'));tb.append(row);}table.append(tb);section.append(table);}else section.append(richText(body));}else if(heading==='전체 아웃라인'&&!body.includes('|')){const rows=body.split('\n').map(line=>documentPlain(line).replace(/^[-*+]\s+/,'')) .map(line=>line.match(plotStageRow)).filter(Boolean);if(rows.length){const table=node('table','');table.className='document-table';const tb=node('tbody','');for(const record of rows){const row=node('tr','');row.append(node('td',record[1]),node('td',record[2]));tb.append(row);}table.append(tb);section.append(table);const remainder=body.split('\n').filter(line=>!rows.some(row=>documentPlain(line).replace(/^[-*+]\s+/,'')===row[0])).join('\n').trim();if(remainder)section.append(richText(remainder));}else section.append(richText(body));}else section.append(richText(body));root.append(section);}return root;}

$('renameOpen').onclick=run(()=>{safeMove();$('inlineRename').hidden=false;$('renameTitle').value=project.title;$('renameTitle').focus();$('renameTitle').select();});
$('renameCancel').onclick=()=>{$('inlineRename').hidden=true;};
$('renameBtn').onclick=null;
$('inlineRename').onsubmit=e=>{e.preventDefault();run(async()=>{safeMove();const title=$('renameTitle').value.trim();if(!title)throw Error('작품 제목을 입력하세요.');$('renameBtn').disabled=true;try{await api('/projects/'+pid+'/manage',{title});await load();$('inlineRename').hidden=true;notice('작품 제목을 변경했습니다.');}finally{$('renameBtn').disabled=false;}})();};
$('renameTitle').addEventListener('keydown',e=>{if(e.key==='Escape'){$('inlineRename').hidden=true;e.preventDefault();}});
$('officialSettings').onclick=run(()=>{if(project.state.selected==='plot')openLengthDialog();});

function formatEpisodeTotal(total){return total==null?'총 회차 자유':'총 '+total.toLocaleString()+'화';}
let resumeFirstEpisode=null;
function lengthValues(){
 return {total_episodes:$('totalEpisodes').valueAsNumber||null,target_chars:$('targetChars').valueAsNumber};
}
function updateLengthDifference(){
 const state=project.state, current=state.settings, next=lengthValues(), changes=[];
 let action=state.length_setup_pending?'이 분량으로 시작하기':'변경안 저장';
 const recommendation=state.length_setup_pending?currentLengthRecommendation(state):null;
 const minimum=recommendation&&$('targetChars').validity.valid
  ?Math.ceil(lengthRecommendationBudget(recommendation)/next.target_chars):0;
 const compress=minimum&&Number.isInteger(next.total_episodes)&&$('totalEpisodes').validity.valid&&
    next.total_episodes<minimum;
 const recommendationPanel=$('lengthRecommendation');
 recommendationPanel.querySelector('[data-length-apply]')?.remove();
 const suggestedChars=recommendation?.recommended_target_chars;
 const suggestedEpisodes=suggestedChars?Math.ceil(lengthRecommendationBudget(recommendation)/suggestedChars):0;
 if(suggestedEpisodes&&(next.total_episodes!==suggestedEpisodes||next.target_chars!==suggestedChars)){
  const apply=styledButton('추천 분량 적용',()=>{
   $('totalEpisodes').value=suggestedEpisodes;
   $('targetChars').value=suggestedChars;
   $('lengthError').hidden=true;
   for(const id of ['totalEpisodes','targetChars'])$(id).removeAttribute('aria-invalid');
   updateLengthDifference();
   $('totalEpisodes').focus();
  });
  apply.dataset.lengthApply='true';
  recommendationPanel.append(apply);
 }
 if(compress){
  action=next.total_episodes.toLocaleString()+'화에 맞게 플롯 줄이기';
  changes.push('현재 글자수 기준 최소 '+minimum.toLocaleString()+'화 권장');
 }
 if(next.total_episodes!==current.total_episodes)changes.push(formatEpisodeTotal(current.total_episodes)+' → '+formatEpisodeTotal(next.total_episodes));
 if(Number.isFinite(next.target_chars)&&next.target_chars!==current.target_chars)changes.push('회차 목표 '+current.target_chars.toLocaleString()+'자 → '+next.target_chars.toLocaleString()+'자');
 if(!state.length_setup_pending&&next.total_episodes!==current.total_episodes&&
    Number.isInteger(next.total_episodes)&&$('totalEpisodes').validity.valid&&
    (state.official['plan:0']||state.drafts['plan:0'])){
  const total=next.total_episodes.toLocaleString()+'화';
  action=current.total_episodes!==null&&next.total_episodes<current.total_episodes
   ?total+'에 맞춰 플롯 줄이기':total+'에 맞게 플롯 구성하기';
  changes.push('새 분량에 맞춰 플롯 초안을 만들어요.');
 }
 $('settingsBtn').textContent=action;
 $('lengthDifference').textContent=changes.join('. ');
 $('lengthDifference').hidden=!changes.length;
}
const pendingLengthPlans=new Map();
function currentLengthRecommendation(state){
 const item=state.length_recommendation, settings=state.settings;
 return item?.minimum_episodes&&item.basis[0]===(state.official['plan:0']||state.drafts['plan:0'])?.version
  &&item.basis[1].total_episodes===settings.total_episodes
  &&item.basis[1].target_chars===settings.target_chars?item:null;
}
function lengthRecommendationBudget(item){
 return item.recommended_total_chars||item.minimum_episodes*item.basis[1].target_chars;
}
function lengthRecommendationText(item){
 const chars=item.recommended_target_chars||item.basis[1].target_chars;
 const total=lengthRecommendationBudget(item);
 return '최소 '+Math.ceil(total/chars).toLocaleString()+'화 권장 · 회차당 '+chars.toLocaleString()+'자 · 약 '+total.toLocaleString()+'자 · '+item.reason;
}
async function refreshLengthPlan(openProposal=false){
 const requested=pid, state=project.state;
 if(!state.official['plan:0'])return;
 if(!pendingLengthPlans.has(requested)){
  const operation=api('/projects/'+requested+'/length-plan',{}).finally(()=>pendingLengthPlans.delete(requested));
  pendingLengthPlans.set(requested,operation);
 }
 try{
  await pendingLengthPlans.get(requested);
  if(pid!==requested)return;
  await load();
  const recommendation=currentLengthRecommendation(project.state);
  if(openProposal&&pid===requested&&recommendation?.proposal_version===project.state.drafts['plot:0']?.version&&recommendation?.proposal_version){
   await select('plot');
  }
  return recommendation;
 }catch(error){
  if(pid===requested)notice(error.message+' 분량 설정에서 다시 시도할 수 있어요.');
 }
}
function openLengthDialog(resume=null){
 const dialog=$('lengthDialog');
 if(dialog.open)return;
 safeMove();
 if(busy)throw Error('현재 작업이 끝난 뒤 분량을 변경해 주세요.');
 const state=project.state,current=state.settings,draft=state.drafts['settings:0'];
 resumeFirstEpisode=resume;
 const values=draft&&!state.length_setup_pending?JSON.parse(draft.text):current;
 $('lengthCurrent').textContent='현재 적용 중 · '+formatEpisodeTotal(current.total_episodes)+' · 회차당 '+current.target_chars.toLocaleString()+'자';
 const existing=state.length_setup_pending?currentLengthRecommendation(state):null;
 const recommendation=existing?.recommended_target_chars?existing:null;
 const recommendationPanel=$('lengthRecommendation');
 recommendationPanel.replaceChildren();
 if(recommendation)recommendationPanel.append(node('p',lengthRecommendationText(recommendation)));
 else if(state.length_setup_pending&&state.official['plan:0']){
  const check=styledButton('권장 분량 확인',async()=>{
   check.disabled=true;
   $('settingsBtn').disabled=true;
   recommendationPanel.firstChild.textContent='권장 분량을 계산하고 있어요…';
   await refreshLengthPlan();
   if(!dialog.open)return;
   $('settingsBtn').disabled=false;
   const item=currentLengthRecommendation(project.state);
   if(item){
    recommendationPanel.replaceChildren(node('p',lengthRecommendationText(item)));
    if($('targetChars').valueAsNumber===current.target_chars&&item.recommended_target_chars)
     $('targetChars').value=item.recommended_target_chars;
   }
   else{
    check.textContent='권장 분량 다시 확인';
    check.disabled=false;
   }
   updateLengthDifference();
  });
  check.type='button';
  recommendationPanel.append(check);
 }
 $('totalEpisodes').value=values.total_episodes??'';
 $('targetChars').value=recommendation?.recommended_target_chars??values.target_chars;
 $('targetChars').removeAttribute('aria-invalid');
 $('totalEpisodes').removeAttribute('aria-invalid');
 $('settingsBtn').disabled=false;
 $('lengthReject').hidden=!draft||!!state.length_setup_pending;
 $('lengthError').hidden=true;
 updateLengthDifference();
 dialog.showModal();
 if(!recommendation)recommendationPanel.querySelector('button')?.click();
}
async function performLengthAction(operation){
 const form=$('lengthForm');
 if(form.dataset.saving)return;
 form.dataset.saving='true';
 const controls=[...form.querySelectorAll('button,input')].filter(control=>!control.disabled);
 for(const control of controls)control.disabled=true;
 const label=$('settingsBtn').textContent;
 $('settingsBtn').textContent='분량과 플롯 확인 중…';
 $('lengthError').hidden=true;
 try{await operation();}
 catch(error){$('lengthError').textContent=error.message;$('lengthError').hidden=false;}
 finally{
  delete form.dataset.saving;
  $('settingsBtn').textContent=label;
  for(const control of controls)control.disabled=false;
 }
}
for(const id of ['lengthClose','lengthX'])$(id).onclick=()=>$('lengthDialog').close();
$('lengthDialog').addEventListener('cancel',event=>{if($('lengthForm').dataset.saving)event.preventDefault();});
$('lengthDialog').addEventListener('close',()=>{if(!$('lengthDialog').open)resumeFirstEpisode=null;});
$('lengthForm').oninput=()=>{
 $('lengthError').hidden=true;
 $('targetChars').removeAttribute('aria-invalid');
 $('totalEpisodes').removeAttribute('aria-invalid');
 updateLengthDifference();
};
$('lengthForm').onsubmit=event=>{
 event.preventDefault();
 for(const [id,message] of [
  ['targetChars','회차 목표 글자수는 1,000~5,000자로 입력해 주세요.'],
  ['totalEpisodes','총 회차수는 1~10,000 사이의 정수로 입력하거나 비워두세요.']
 ]){
  const input=$(id);
  if(input.validity.valid)continue;
  input.setAttribute('aria-invalid','true');
  $('lengthError').textContent=message;
  $('lengthError').hidden=false;
  input.focus();
  return;
 }
 const selection=lengthValues();
 performLengthAction(async()=>{
  const state=project.state, path='/projects/'+pid;
  const resume=state.length_setup_pending?resumeFirstEpisode:null;
  if(state.official['plan:0']||state.drafts['plan:0']){
   await pendingLengthPlans.get(pid);
   await api(path+'/length-plan',{selection});
  }else await api(path+(state.length_setup_pending?'/initial-length':'/length'),selection);
  await load();
  $('lengthDialog').close();
  const proposal=currentLengthRecommendation(project.state)?.proposal_version;
  if((proposal&&project.state.drafts['plot:0']?.version===proposal)||
     (state.length_setup_pending&&project.state.drafts['plot:0']&&!project.state.official['plot:0']))await select('plot');
  else if(resume)await run(resume)();
  else notice('분량을 저장했어요. 다음 집필 요청부터 적용돼요.');
 });
};
$('lengthReject').onclick=()=>performLengthAction(async()=>{
  const draft=project.state.drafts['settings:0'], path='/projects/'+pid+'/draft';
  const body={key:'settings:0',version:draft.version};
  await api(path,{...body,action:'reject'});
  await load();
  $('lengthDialog').close();
});
const sendWithLength=send;
send=async function(text,scope){
 if(busy)return;
 const request=pending?.text||text||$('chatInput').value;
 const writingRequest=/(?:첫\s*(?:회차|화)|\d+\s*(?:화|회차)|다음\s*화|원고|소설\s*본문).{0,24}(?:집필|써\s*줘|작성|이어\s*써)|^집필(?:\s*시작)?(?:해\s*줘|하자)?[.!?]?$/;
 const needsLengthRetry=pending&&$('jobState').textContent==='첫 회차 집필 전에 분량을 설정해 주세요.';
 const review=pendingWritingReviews(project.state)[0];
 if(!scope&&review&&writingRequest.test(request.trim())){
  await select(review);
  return;
 }
 if(project.state.length_setup_pending&&!scope&&(needsLengthRetry||writingRequest.test(request.trim()))){
  openLengthDialog(()=>send(request,scope));
  return;
 }
 await sendWithLength(text,scope);
};

const trashRender=render;
render=function(){trashRender();$('archiveBtn').textContent=project.state.archived?'작품 복원':'휴지통으로 이동';};

// One selector contains saved episodes only; the internal episode value is not an input UI.
const savedEpisodeRender=render;
render=function(){savedEpisodeRender();const list=$('episodeList');for(const option of Array.from(list.options))if(!option.value)option.remove();const current=String(project.state.episode);list.value=Array.from(list.options).some(o=>o.value===current)?current:'';list.setAttribute('aria-label','회차 선택');};
function openLibraryRename(work){safeMove();const dialog=node('dialog','');dialog.className='library-rename-dialog';const form=node('form','');form.method='dialog';const heading=node('h2','작품 이름 변경'),label=node('label','새 작품 이름'),input=node('input','');input.value=work.title;input.maxLength=120;input.required=true;input.setAttribute('aria-label','새 작품 이름');label.append(input);const actions=node('div','');actions.className='dialog-actions';const cancel=node('button','취소');cancel.type='button';cancel.onclick=()=>dialog.close();const save=node('button','저장');save.type='submit';save.className='primary';const error=node('p','');error.setAttribute('role','status');form.onsubmit=async e=>{e.preventDefault();const title=input.value.trim();if(!title){error.textContent='작품 이름을 입력하세요.';return;}save.disabled=true;try{await api('/projects/'+work.id+'/manage',{title});dialog.close();await library();notice('작품 이름을 변경했습니다.');}catch(e){error.textContent=e.message;}finally{save.disabled=false;}};actions.append(cancel,save);form.append(heading,label,error,actions);dialog.append(form);dialog.addEventListener('close',()=>dialog.remove());document.body.append(dialog);dialog.showModal();input.focus();input.select();}
document.addEventListener('click',e=>{for(const menu of document.querySelectorAll('.book-menu[open]'))if(!menu.contains(e.target))menu.open=false;});
document.addEventListener('keydown',e=>{if(e.key==='Escape')for(const menu of document.querySelectorAll('.book-menu[open]'))menu.open=false;});

const referenceApprovalPreview=preview;
preview=function(){
 referenceApprovalPreview();
 const state=project.state;
 if(!referenceKinds.includes(state.selected))return;
 const approve=$('approvalActions').querySelector('.primary');
 if(!approve)return;
 const id=key();
 const label=state.drafts[id]?.status==='review'?'검토 후 승인':
  state.official[id]?'내용 변경하기':'내용 검토하기';
 approve.replaceChildren(svgIcon('check'),node('span',label));
};

const referencePlotDocument=plotDocument;
plotDocument=function(text){
 const root=referencePlotDocument(text);
 const section=Array.from(root.querySelectorAll('.plot-section')).find(element=>element.querySelector('h3')?.textContent==='회차 구성');
 if(!section)return root;
 const state=project.state;
 if(state.length_setup_pending&&!state.official['plot:0']&&state.selected==='plot'){
  section.remove();
  return root;
 }
 const confirmed=Object.entries(state.official).filter(([id])=>id.startsWith('episode:'))
  .map(([id,record])=>[Number(id.split(':')[1]),record]).sort((a,b)=>a[0]-b[0]);
 let table=section.querySelector('table');
 if(!table&&confirmed.length){
  table=node('table','');table.className='document-table';
  const head=node('thead',''),row=node('tr','');
  row.append(node('th','회차'),node('th','주요 사건'));head.append(row);
  table.append(head,node('tbody',''));
  if(section.children.length===2&&section.lastElementChild.tagName==='P')section.lastElementChild.remove();
  section.append(table);
 }
 const header=table?.querySelector('thead tr'),body=table?.querySelector('tbody');
 if(!header||!body)return root;
 const headings=Array.from(header.children);
 let status=headings.findIndex(cell=>cell.textContent==='상태');
 if(status<0){status=headings.length;header.append(node('th','상태'));}
 const eventColumn=headings.findIndex(cell=>/주요 사건|사건|줄거리/.test(cell.textContent));
 const titleColumn=headings.findIndex(cell=>/제목/.test(cell.textContent));
 const rows=new Map();
 for(const row of body.rows){
  const match=row.cells[0]?.textContent.match(/^\s*(\d+)\s*화\s*$/);
  if(match)rows.set(Number(match[1]),row);
 }
 for(const [number,record] of confirmed){
  let row=rows.get(number);
  if(!row){
   row=node('tr','');
   for(let i=0;i<status+1;i++)row.append(node('td',''));
   row.cells[0].textContent=number+'화';
   if(titleColumn>0)row.cells[titleColumn].textContent=chapterDisplayTitle(record,number);
   const next=Array.from(body.rows).find(item=>Number(item.cells[0]?.textContent.match(/^\s*(\d+)\s*화/)?.[1])>number);
   body.insertBefore(row,next||null);rows.set(number,row);
  }
  const facts=(state.records?.[number]?.findings||[]).filter(entry=>entry.kind==='plot'&&!entry.reason&&!entry.removed).map(entry=>entry.fact);
  const summary=!record.metadata_stale?record.summary?.trim():'';
  const event=row.cells[eventColumn>0?eventColumn:Math.max(1,status-1)];
  if(event){
   if(facts.length||summary)event.textContent=project.plot_events?.[number]||(facts.length?facts.join(' · '):summary);
   else if(!event.textContent.trim())event.append(styledButton(chapterDisplayTitle(record,number)+' · 확정 원고 읽기',()=>openChapterReader(number),'text-button'));
  }
 }
 for(const [number,row] of rows){
  const id='episode:'+number,saved=state.official[id]||state.drafts[id];
  const cell=row.cells[status]||row.appendChild(node('td',''));
  const badge=node('span',saved?({draft:'초안',review:'검토중',confirmed:'확정'})[saved.status]:'미작성');
  badge.className='status-badge '+(saved?.status||'unwritten');
  cell.replaceChildren(badge);
 }
 return root;
};




// Functional controls for offline testing; the shared conversation is unchanged.
function episodeWritingRequest(number){
 const ending='이번 화의 목표와 끝맺음을 먼저 계획하고 원고를 작성해줘.';
 return number===1?'확정한 기획안과 설정, 1화 회차 계획을 바탕으로 이야기의 첫 장면부터 1화를 작성해줘. '+ending:
  number+'화를 이어 써줘. 직전 확정 회차의 마지막 장면과 미해결 사건, 인물들이 알고 있는 정보를 이어받고 확정 설정과 회차 계획을 지켜줘. '+ending;
}
async function writeNextEpisode(){safeMove();if(project.state.branch_origin?.revision_required){const start=project.state.branch_origin.episode;$('episodeInput').value=start;await select('episode');notice('가져온 '+start+'화를 먼저 수정하고 확정해 주세요.');return;}if(revisionImpactBlocksWriting(project.state)){showApprovalGuide();return;}const review=pendingWritingReviews(project.state)[0];if(review){await select(review);return;}if(project.state.length_setup_pending){openLengthDialog(writeNextEpisode);return;}if(busy)throw Error('현재 작업이 끝난 뒤 요청하세요.');const available=(await refreshUsage()).remaining;if(available!==null&&available<4)throw Error('다음 화 생성은 보통 API 호출 4회 이상이 필요합니다. 오늘 남은 호출 수를 확인하세요.');const s=project.state;const numbers=Object.keys({...s.official,...s.drafts}).filter(k=>k.startsWith('episode:')).map(k=>Number(k.split(':')[1]));const last=numbers.length?Math.max(...numbers):0;if(last&&(!s.official['episode:'+last]||s.drafts['episode:'+last]))throw Error('마지막 회차를 검토·확정한 뒤 다음 화를 이어 쓰세요.');if(last&&s.records?.[last]?.setting_review&&s.records[last].setting_review!=='done')throw Error('이전 회차의 설정 검토를 마친 뒤 집필해 주세요.');const next=last+1;if(s.settings.total_episodes!==null&&next>s.settings.total_episodes)throw Error('총 회차수에 도달했습니다. 분량 설정을 먼저 변경하세요.');$('episodeInput').value=next;await select('episode');pending=null;await send(episodeWritingRequest(next));}
const functionalSidebar=sidebar;
sidebar=function(){functionalSidebar();};
const functionalPreview=preview;
const episodeMetadata=new Map();
const reviewingEpisodeSettings=new Map();
const episodeSettingsErrors=new Map();
const deferredEpisodeSettings=new Set();
const openedEpisodeResults=new Set();
function showEpisodeReviewPanel(panel){
 const container=$('preview');
 container.prepend(panel);
 container.classList.add('show-episode-settings-review');
 $('documentTabLabel').textContent=project.state.episode+'화에서 확인한 설정';
 $('editBtn').hidden=true;
}
function focusEpisodeSettingsReview(){
 const panel=document.getElementById('episodeSettingsReview');
 if(panel&&!$('preview').hidden){
  panel.focus({preventScroll:true});
  panel.scrollIntoView({block:'start'});
 }
}
async function runEpisodeSettingsReview(episode,action,note=''){
 safeMove();
 const requested=pid,token=requested+':'+episode;
 if(busy||reviewingEpisodeSettings.has(token))return;
 const version=project.state.official['episode:'+episode].version;
 const isViewing=()=>pid===requested&&key()==='episode:'+episode&&documentView==='preview';
 const renderReview=()=>{
  if(isViewing()){
   preview();
   focusEpisodeSettingsReview();
  }
 };
 episodeSettingsErrors.delete(token);
 reviewingEpisodeSettings.set(token,action);
 const progress=node('dialog','');
 progress.className='length-dialog episode-review-progress';
 progress.setAttribute('aria-label',episode+'화 설정 검토');
 progress.addEventListener('cancel',event=>event.preventDefault());
 const heading=node('h2',episode+'화 설정 검토 중');
 const status=node('p','');
 status.setAttribute('role','status');
 const indicator=node('progress','');
 indicator.setAttribute('aria-label','설정 검토 진행 중');
 progress.append(heading,status,indicator);
 const updateProgress=()=>{
  status.textContent=({
   continuity:'기존 설정과 일관성을 확인하고 있어요.',
   continue:'자료집 검토로 넘어가고 있어요.',
   organize:'원고에서 새 설정과 변경 사항을 찾고 있어요.',
   approve:'선택한 설정을 반영하고 있어요.'
  })[action];
 };
 try{
  if(isViewing()){
   preview();
   setDocumentView('preview');
  }
  updateProgress();
  document.body.append(progress);
  progress.showModal();
  await api('/projects/'+requested+'/episode-settings-review',{
   episode,action,version,note
  });
  if(pid===requested)await load();
  if(['continuity','continue'].includes(action)&&pid===requested&&project.state.records?.[episode]?.setting_review==='organize'){
   action='organize';
   reviewingEpisodeSettings.set(token,action);
   updateProgress();
   await api('/projects/'+requested+'/episode-settings-review',{episode,action,version});
   if(pid===requested)await load();
  }
 }catch(error){
  episodeSettingsErrors.set(token,{version,message:error.message});
 }finally{
  if(progress.open)progress.close();
  progress.remove();
  reviewingEpisodeSettings.delete(token);
  if(isViewing()&&project.state.records?.[episode]?.setting_review==='done'&&!deferredEpisodeSettings.has(token+':'+version)){
   openedEpisodeResults.add(token+':'+version);
  }
  renderReview();
  if(isViewing()&&(deferredEpisodeSettings.has(token+':'+version)||project.state.records?.[episode]?.setting_review==='done')){
   setDocumentView('preview');
   $('preview').closest('.document-body').scrollTop=0;
  }
 }
}
function appendEpisodeSettingsReview(state,episode){
 const record=state.records?.[episode],stage=record?.setting_review;
 if(!stage)return;
 const panel=node('section','');panel.id='episodeSettingsReview';panel.className='episode-findings';
 panel.tabIndex=-1;
 panel.setAttribute('aria-label',episode+'화 설정 검토');
 const token=pid+':'+episode;
 const running=reviewingEpisodeSettings.get(token);
 if(running)return;
 const error=episodeSettingsErrors.get(token);
 const reviewId=token+':'+record.version;
 if(stage==='done'){
  if(episodeResultConfirmed(reviewId))return;
  if(!openedEpisodeResults.has(reviewId)){
   $('preview').append(styledButton('설정 검토 결과 보기',()=>{
    openedEpisodeResults.add(reviewId);
    preview();
    focusEpisodeSettingsReview();
   }));
   return;
  }
  const entries=(record.findings||[]).filter(item=>!item.removed);
  panel.classList.add('episode-review-result');
  if(!entries.length)panel.append(node('p','이 회차에서 새로 반영할 설정을 찾지 못했어요.'));
  for(const [label,candidates] of [['자료집에 반영한 설정',false],['확인할 설정 후보',true]]){
   const items=entries.filter(item=>Boolean(item.reason)===candidates);
   if(!items.length)continue;
   const group=node('section','');
   group.append(node('h3',label+' · '+items.length+'건'));
   const cards=new Map();
   for(const item of items){
    const name=item.name?.trim();
    const cardKey=item.kind==='characters'&&name?name:item;
    if(!cards.has(cardKey))cards.set(cardKey,[]);
    cards.get(cardKey).push(item);
   }
   for(const facts of cards.values()){
    const [item]=facts;
    const row=node('article','');
    row.className='episode-finding';
    const header=node('header','');
    header.className='episode-finding-heading';
    if(item.name)header.append(node('h4',item.name));
    const category=node('span',item.kind==='plot'?'플롯·회차 구성':labels[item.kind]||'설정');
    category.className='character-role';
    header.append(category);
    row.append(header);
    for(const fact of facts){
     const entry=node('div','');
     entry.className='episode-finding-entry';
     entry.append(node('p',fact.fact));
     if(fact.reason)entry.append(node('p',fact.reason));
     if(fact.quote){
      const evidence=node('details','');
      evidence.append(node('summary','근거 보기'),node('blockquote',fact.quote));
      entry.append(evidence);
     }
     row.append(entry);
    }
    group.append(row);
   }
   panel.append(group);
  }
  $('episodeReviewFooter').append(styledButton('확인',()=>{
   local.setItem('storyloom.episode-result-confirmed.'+reviewId,'1');
   openedEpisodeResults.delete(reviewId);
   preview();
   setDocumentView('preview');
   showApprovalGuide();
   $('preview').closest('.document-body').scrollTop=0;
  },'primary episode-result-confirm'));
  showEpisodeReviewPanel(panel);
  return;
 }
 if(deferredEpisodeSettings.has(reviewId)){
  $('preview').append(styledButton('회차 설정 검토 보기',()=>{
   deferredEpisodeSettings.delete(reviewId);
   preview();
   setDocumentView('preview');
   focusEpisodeSettingsReview();
  }));
  return;
 }
 const footer=$('episodeReviewFooter');
 if(error?.version===record.version){
  const message=node('p',error.message);
  message.setAttribute('role','alert');
  panel.append(message,node('p','승인한 원고는 저장되어 있어요.'));
 }
 if(stage==='continuity'){
  if(record.continuity_issues?.length){
   panel.classList.add('episode-review-result','episode-conflict-result');
   const group=node('section','');
   group.append(node('h3','일관성 점검 · '+record.continuity_issues.length+'건'));
   for(const issue of record.continuity_issues){
    const row=node('article','');
    row.className='episode-finding';
    row.append(node('p',issue));
    group.append(row);
   }
   panel.append(group,node('p','수정안을 승인하면 바뀐 원고의 일관성을 다시 확인해요.'));
   const revise=styledButton('AI에게 충돌 수정 맡기기',async()=>{
    safeMove();
    if(busy||revise.disabled)return;
    revise.disabled=true;
    try{
     pending={request_id:crypto.randomUUID(),text:episode+'화 원고의 설정 충돌을 반영해서 수정해줘.',
      operation:{type:'resolve_continuity',key:'episode:'+episode,base_version:record.version}};
     await send();
    }finally{revise.disabled=false;}
   },'primary');
   revise.disabled=busy;
   panel.append(revise);
   const intent=node('details','');
   intent.className='functional-tools episode-intent';
   const note=node('textarea','');
   note.setAttribute('aria-label','전개 의도 (선택)');
   note.maxLength=500;
   note.rows=2;
   note.placeholder='예: 습격의 배후는 4화에서 공개';
   intent.append(node('summary','의도한 전개로 유지'),note,
    styledButton('이 전개로 계속',()=>runEpisodeSettingsReview(episode,'continue',note.value)));
   panel.append(intent);
  }else if(error)panel.append(styledButton('일관성 검토 다시 시도',()=>runEpisodeSettingsReview(episode,'continuity'),'primary'));
 }else if(stage==='organize'){
  if(error)panel.append(styledButton('자료집 정리 다시 시도',()=>runEpisodeSettingsReview(episode,'organize'),'primary'));
 }else if(stage==='review'){
  const entries=(record.findings||[]).filter(item=>!item.removed&&item.reason);
  for(const kind of [...referenceKinds,'plot']){
   const items=entries.filter(item=>item.kind===kind);
   if(!items.length)continue;
   const group=node('section','');
   group.append(node('h3',(kind==='plot'?'플롯':labels[kind])+' · '+items.length+'건'));
   for(const item of items){
    const row=node(item.quote||item.reason!=='회차 설정 검토 대기'?'details':'div','');
    row.className='episode-review-row';
    row.append(node(row.tagName==='DETAILS'?'summary':'strong',item.fact));
    if(item.quote)row.append(node('blockquote',item.quote));
    if(item.reason!=='회차 설정 검토 대기'){
     row.append(node('p',item.reason));
     const updateFinding=async action=>{
      const requested=pid;
      await api('/projects/'+requested+'/episode-finding',{
       episode,version:record.version,index:record.findings.indexOf(item),action
      });
      if(pid===requested){
       await load();
       if(key()==='episode:'+episode&&project.state.records?.[episode]?.setting_review==='done'){
        setDocumentView('preview');
        $('preview').closest('.document-body').scrollTop=0;
       }
      }
     };
     if(item.reason!=='설정 이름을 확인하지 못했어요.')
      row.append(styledButton('이 설정 반영',()=>updateFinding('accept')));
     row.append(styledButton('제외',()=>updateFinding('remove'),'text-button'));
    }
    group.append(row);
   }
   panel.append(group);
  }
 }
 const returnToManuscript=()=>{
  deferredEpisodeSettings.add(reviewId);
  preview();
  setDocumentView('preview');
  $('preview').closest('.document-body').scrollTop=0;
 };
 const back=styledButton('원고 보기',returnToManuscript,'text-button episode-review-back');
 panel.prepend(back);
 if(stage==='review')footer.append(styledButton('나중에 검토',returnToManuscript));
 if(stage==='review'&&record.findings.some(item=>!item.removed&&item.reason==='회차 설정 검토 대기')){
  footer.append(styledButton('설정 반영',()=>runEpisodeSettingsReview(episode,'approve'),'primary'));
 }
 showEpisodeReviewPanel(panel);
 if(!error&&!busy&&(stage==='review'||stage==='organize'||(stage==='continuity'&&!record.continuity_issues?.length))&&!window.STORYLOOM_PREVIEW){
  const requested=pid;
  queueMicrotask(()=>{
   if(pid===requested&&project.state===state&&key()==='episode:'+episode&&documentView==='preview')
    runEpisodeSettingsReview(episode,stage==='review'?'approve':stage).catch(error=>notice(error.message));
  });
 }
}
const episodeReviewDocumentView=setDocumentView;
setDocumentView=function(view){
 episodeReviewDocumentView(view);
 if(view==='preview'&&$('preview').classList.contains('show-episode-settings-review')){
  $('documentTabLabel').textContent=project.state.episode+'화에서 확인한 설정';
  $('editBtn').hidden=true;
 }
};
const recoveringFindings=new Set();
const attemptedFindings=new Set();
async function recoverConfirmedFindings(state,projectId){
 const pending=Object.entries(state.official).filter(([id,record])=>id.startsWith('episode:')&&
  !state.records?.[id.split(':')[1]]?.setting_review&&state.records?.[id.split(':')[1]]?.findings_checked!==record.version);
 if(!pending.length||busy||recoveringFindings.has(projectId))return;
 const requestKey=JSON.stringify([projectId,...pending.map(([id,record])=>[id,record.version])]);
 if(attemptedFindings.has(requestKey))return;
 attemptedFindings.add(requestKey);
 recoveringFindings.add(projectId);
 const status=node('p','확정 원고에서 추가 설정을 확인하고 있어요.');
 $('preview').append(status);
 try{
  await api('/projects/'+projectId+'/recover-episode-findings',{});
  if(pid===projectId&&[...referenceKinds,'plot'].includes(project.state.selected))await load();
 }catch{
  status.textContent='확정 원고의 추가 설정을 확인하지 못했어요. 새로고침하면 다시 확인할 수 있어요.';
 }finally{recoveringFindings.delete(projectId);}
 if(pid===projectId&&project.state!==state&&[...referenceKinds,'plot'].includes(project.state.selected))await recoverConfirmedFindings(project.state,projectId);
}
function appendEpisodeFindings(container,findings,heading){
 const items=findings.filter(entry=>!entry.removed);
 if(!items.length)return;
 const panel=node('details','');panel.className='episode-findings';
 const review=items.filter(entry=>entry.reason).length;
 panel.append(node('summary',heading+' · '+(items.length-review)+'건'+(review?' · 검토 필요 '+review+'건':'')));
 for(const entry of items){
  const row=node('div','');row.className='episode-finding';
  row.append(node('strong',entry.fact));
  if(entry.quote)row.append(node('blockquote',entry.quote));
  if(entry.reason)row.append(node('p','검토 필요 · '+entry.reason));
  panel.append(row);
 }
 container.append(panel);
}
preview=function(){
 $('episodeReviewFooter').replaceChildren();
 $('preview').classList.remove('show-episode-settings-review');
 functionalPreview();const s=project.state,k=key(),draft=visibleDocumentDraft(s,k),official=s.official[k];
 const recommendation=currentLengthRecommendation(s);
 if(k==='plan:0'&&draft?.setup_edit_base&&!official){
  const restore=styledButton('내용 복원하기',()=>action('restore_setup',draft.version));
  const reconcile=styledButton('AI에 변경 반영 요청',async()=>{
   safeMove();
   const requested=pid;
   restore.disabled=true;
   reconcile.disabled=true;
   reconcile.textContent='기획안 변경 반영 중…';
   try{
    await api('/projects/'+requested+'/reconcile-plan',{version:draft.version});
    if(pid===requested)await load();
   }finally{
    restore.disabled=false;
    reconcile.disabled=false;
    reconcile.textContent='AI에 변경 반영 요청';
   }
  },'primary');
  $('approvalActions').replaceChildren(restore,reconcile);
 }else if(k==='plan:0'&&!official&&draft?.plan_reconciled&&draft.status==='review'){
  const approve=$('approvalActions').querySelector('.primary');
  approve?.replaceChildren(svgIcon('check'),node('span','기획안 확정하기'));
 }
 if(k==='plot:0'&&draft&&!official&&s.length_setup_pending){
  $('approvalActions').querySelector('.primary')?.replaceWith(
   styledButton('분량 정하기',()=>openLengthDialog(),'primary')
  );
 }
 if(draft?.setup_edit_base&&s.official['plan:0']&&
    !Object.keys({...s.official,...s.drafts}).some(id=>id.startsWith('episode:'))){
  const change=styledButton('내용 변경하기',()=>action('change_setup',draft.version),'primary');
  const actions=$('approvalActions');
  if(official)actions.querySelector('.primary')?.replaceWith(change);
  else{
   const restore=styledButton('내용 복원하기',()=>action('restore_setup',draft.version));
   actions.replaceChildren(restore,change);
  }
 }
 if(s.selected==='plan'&&recommendation){
  const note=node('p',lengthRecommendationText(recommendation));
  note.className='document-submeta';
  $('preview').prepend(note);
 }
 if(s.selected==='plot'&&draft&&draft.version===recommendation?.proposal_version){
  const note=node('p','선택한 분량에 맞춘 플롯 · '+draft.impact);
  note.className='document-submeta metadata-note';
  $('preview').prepend(note);
 }
 if(s.selected==='episode'&&official&&!draft)appendEpisodeSettingsReview(s,s.episode);
 if(s.selected==='episode'&&draft){
  const basis=Object.fromEntries(Object.entries(s.official).filter(([id])=>[...referenceKinds,'plot'].includes(id.split(':')[0])).map(([id,record])=>[id,record.version]));
  const findings=(draft.findings||[]).map(entry=>Object.keys({...basis,...draft.findings_basis}).some(id=>basis[id]!==draft.findings_basis?.[id])?
   {...entry,reason:entry.reason||'추출 후 확정 설정이 바뀌었어요.'}:entry);
  appendEpisodeFindings($('preview'),findings,s.episode+'화 원고에서 확인한 설정 후보');
  if(!findings.length){
   const panel=node('section','');panel.className='episode-findings';
   panel.append(node('p',Array.isArray(draft.findings)?'이 회차에서 새로 기록할 설정을 찾지 못했어요.':'이 초안의 설정 반영 내용을 아직 확인하지 못했어요.'));
   $('preview').append(panel);
  }
 }
 if([...referenceKinds,'plot'].includes(s.selected)){
  if(s.selected==='plot'&&!draft&&!official&&Object.keys(s.official).some(id=>id.startsWith('episode:'))){
   $('preview').replaceChildren(plotDocument(''));
  }
  if(!window.STORYLOOM_PREVIEW)queueMicrotask(()=>{if(project?.state===s&&documentView==='preview')recoverConfirmedFindings(s,pid);});

 }
 if(s.selected==='settings'){
  const summary=node('section','');summary.className='functional-settings';summary.append(node('h3','현재 적용 중'),node('p',s.settings.total_episodes+'화 · 회차당 '+s.settings.target_chars.toLocaleString()+'자'));
  if(draft){try{const proposed=JSON.parse(draft.text);summary.append(node('h3','저장된 변경안'),node('p','총 '+s.settings.total_episodes+'화 → '+proposed.total_episodes+'화 / 회차당 '+s.settings.target_chars.toLocaleString()+'자 → '+Number(proposed.target_chars).toLocaleString()+'자'));}catch{summary.append(node('p','변경안 형식을 확인하세요.'));}
   $('approvalActions').replaceChildren(styledButton('변경안 취소',()=>action('reject',draft.version)),styledButton('이 분량으로 승인',async()=>{safeMove();const requested=pid;if(draft.status!=='review')await api('/projects/'+requested+'/draft',{key:k,action:'review',version:draft.version});await api('/projects/'+requested+'/draft',{key:k,action:'approve',version:draft.version});await load();},'primary'));
  }else $('approvalActions').replaceChildren();$('preview').replaceChildren(summary);return;
 }
 if(s.selected==='episode'&&!draft&&official&&(official.metadata_stale||!official.summary||!official.facts)){
  const projectId=pid, token=projectId+':'+official.version;
  const refresh=async()=>{
   if(busy||episodeMetadata.get(token)==='running'||pid!==projectId)return;
   episodeMetadata.set(token,'running');
   if(key()===k)preview();
   try{
    await api('/projects/'+projectId+'/episode-metadata',{key:k,version:official.version});
    if(pid===projectId)await load();
    episodeMetadata.delete(token);
   }catch{
    episodeMetadata.set(token,'failed');
    if(pid===projectId&&key()===k)preview();
   }
  };
  const status=episodeMetadata.get(token);
  if(status){
   const line=node('p',status==='failed'?'원고는 저장됐어요. 요약·사건 기록을 갱신하지 못했어요.':'요약·사건 기록을 갱신하고 있어요.');
   line.setAttribute('role','status');
   if(status==='failed'){
    const retry=styledButton('요약 갱신 재시도',refresh);
    retry.disabled=busy;
    line.append(' ',retry);
   }
   const review=document.getElementById('episodeSettingsReview');
   (review?.isConnected?review:$('preview')).append(line);
  }else if(!window.STORYLOOM_PREVIEW){
   queueMicrotask(()=>{if(project.state===s&&documentView==='preview'&&!episodeMetadata.has(token))refresh();});
  }
 }

 if(draft&&official&&draft.text!==official.text){const details=node('details','');details.className='functional-tools';details.append(node('summary','변경 중 일부만 반영'));details.addEventListener('toggle',async()=>{if(!details.open||details.dataset.loaded)return;details.dataset.loaded='yes';try{const requested=pid,version=draft.version;const data=await api('/projects/'+requested+'/compare?key='+encodeURIComponent(k));if(pid!==requested||key()!==k||project.state.drafts[k]?.version!==version)return;const changed=data.changes.filter(change=>change.before.trim()!==change.after.trim());
if(s.selected==='episode'&&(changed.length>8||changed.reduce((sum,change)=>sum+Math.max(change.before.trim().length,change.after.trim().length),0)>=Math.max(data.before_chars,data.after_chars)*0.5)){
 details.append(node('p','수정 범위가 넓어요. 위의 기존 원고와 수정 원고 탭에서 문단 단위로 비교할 수 있어요.'));
 return;
}
const selected=[];data.changes.forEach((change,index)=>{if(change.type==='equal'||change.before.trim()===change.after.trim())return;const label=node('label',''),check=node('input','');check.type='checkbox';check.checked=true;selected.push({check,index});const comparison=node('div','');
for(const [title,value] of [['기존',change.before.trim()||'(없음)'],['제안',change.after.trim()||'(삭제)']]){
 comparison.append(node('strong',title),richText(s.selected==='episode'?normalizeManuscriptBreaks(value):value));
}
label.append(check,comparison);details.append(label);});if(!selected.length){details.append(node('p','선택할 본문 변경이 없어요.'));return;}details.append(styledButton('선택한 변경만 새 초안으로 저장',async()=>{safeMove();await api('/projects/'+requested+'/select-changes',{key:k,draft_version:version,official_version:official.version,changes:selected.filter(x=>x.check.checked).map(x=>x.index)});await load();notice('확정본과 전체 수정안을 보존하고 선택한 변경을 새 초안으로 저장했습니다.');}));}catch(e){details.dataset.loaded='';notice(e.message);}});$('preview').append(details);}
};
const chatExamples={
 plan:'기획안에서 주인공의 목표를 더 뚜렷하게 써줘.',
 characters:'주인공과 조연의 관계를 더 구체적으로 정리해줘.',
 world:'세계관을 좀 더 현실적으로 바꿔줘.',
 places:'주요 장소의 분위기와 특징을 더 구체적으로 써줘.',
 lore:'주요 설정에서 능력을 쓸 수 있는 조건을 정리해줘.',
 plot:'중반부의 주요 사건이 자연스럽게 이어지도록 플롯을 다듬어줘.',
 episode:'이 회차에서 주인공이 결심하는 장면을 더 구체적으로 써줘.'
};
const chatExample=node('p','채팅으로도 바꿀 수 있어요 ');
chatExample.className='composer-example';
chatExample.hidden=true;
const chatExampleButton=styledButton('',()=>{
 const input=$('chatInput');
 const example=chatExamples[project.state.selected];
 if(!example)return;
 if(!input.value.trim())input.value=example;
 else if(!input.value.includes(example))input.value=input.value.trimEnd()+'\n'+example;
 input.focus();
 input.setSelectionRange(input.value.length,input.value.length);
},'text-button');
chatExample.append(chatExampleButton);
$('chatForm').after(chatExample);
const functionalRender=render;
render=function(){functionalRender();showApprovalGuide();const example=chatExamples[project.state.selected];chatExample.hidden=!example||!!window.STORYLOOM_PREVIEW;chatExampleButton.textContent=example?'“'+example+'”':'';const state=project.state;if(state.selected==='plot'&&state.length_setup_pending&&!state.official['plot:0'])$('officialSettings').textContent='분량 정하기 · 회차 목표 '+state.settings.target_chars.toLocaleString()+'자';if(state.selected==='settings')$('editBtn').hidden=true;let receipt=$('workReceipt');if(!receipt){receipt=node('details','');receipt.id='workReceipt';receipt.className='functional-tools';$('chatForm').before(receipt);}receipt.replaceChildren();const result=state.last_work_result;
const latestJob=project.jobs?.[0];
if(result&&(!latestJob||(latestJob.status==='done'&&latestJob.id===result.request_id))){receipt.hidden=false;receipt.append(node('summary',({applied:'자료 반영 완료',partial:'일부 완료 · 확인 필요',conversation:'대화/점검 완료 · 자료 변경 없음',not_applied:'미반영 · 실제 자료 변경 없음'})[result.status]||'최근 작업 결과'),node('p','반영한 초안: '+(result.applied.length?result.applied.map(k=>labels[k.split(':')[0]]+(k.startsWith('episode:')?' '+k.split(':')[1]+'화':'')).join(', '):'없음')));receipt.append(node('p','이번 실행 API 호출: '+(result.calls_this_run??'기록 없음')+'회'));if(result.references_incomplete)receipt.append(node('p','일부 자료 정리 또는 충돌 반영을 완료하지 못했습니다. 기존 자료는 유지됩니다.'));}else receipt.hidden=true;};
for(const b of document.querySelectorAll('[data-ask]'))if(b.textContent.trim()==='다음 화 집필')b.onclick=run(writeNextEpisode);

function syncSelectedQuote(){const editor=$('editor'),quote=editor.value.slice(editor.selectionStart,editor.selectionEnd);const valid=!$('editPanel').hidden&&!!editKey&&!!quote.trim();$('selectedQuotePanel').hidden=!valid;$('selectedQuote').textContent=valid?quote:'';$('selectedQuoteLabel').textContent=valid?'선택한 본문 · '+Array.from(quote).length+'자':'선택한 본문';}
for(const name of ['select','keyup','pointerup','input'])$('editor').addEventListener(name,syncSelectedQuote);
document.addEventListener('selectionchange',()=>{if(document.activeElement===$('editor'))syncSelectedQuote();});
$('clearQuoteBtn').onclick=()=>{const editor=$('editor');editor.setSelectionRange(editor.selectionEnd,editor.selectionEnd);syncSelectedQuote();};
const quoteView=setDocumentView;
setDocumentView=function(view){quoteView(view);syncSelectedQuote();};
const quoteRender=render;
render=function(){quoteRender();syncSelectedQuote();};

const quoteBeginEdit=beginEdit;
beginEdit=function(recovery){quoteBeginEdit(recovery);syncSelectedQuote();};
function showSettingCardEditor(kind){
 const editor=$('editor');
 const source=project.state.drafts[editKey]||project.state.official[editKey];
 const originalText=editor.value;
 const plan=kind==='plan'?parsePlanDocument(editor.value):null;
 const fixedPlanLines=plan?[
  plan.notes.trim(),
  project.title?.trim()&&project.title.trim()!=='제목 미정'&&plan.title?'제목: '+plan.title:'',
  ...['총 회차','회차 목표'].filter(label=>plan.fields[label]).map(label=>label+': '+plan.fields[label])
 ].filter(Boolean):[];
 const fields=[];
 let serializePlot=null;
 const syncSelection=()=>{
  const input=document.activeElement;
  const field=fields.find(item=>item.input===input);
  if(!field)return;
  if(editor.value===serialize()&&input.value.trim()){
   editor.setSelectionRange(field.offset+input.selectionStart,field.offset+input.selectionEnd);
  }else{
   const quote=input.value.slice(input.selectionStart,input.selectionEnd);
   const start=editor.value.indexOf(quote);
   const unique=quote&&start>=0&&start===editor.value.lastIndexOf(quote);
   editor.setSelectionRange(unique?start:0,unique?start+quote.length:0);
  }
  syncSelectedQuote();
 };
 const serialize=()=>{
  if(serializePlot)return serializePlot(fields);
  let text=fixedPlanLines.join('\n');
  for(const field of fields){
   if(!field.input.value.trim()){
    if(field.prefix==='## ')text+=field.separator;
    continue;
   }
   text+=(text?field.separator||'\n':'')+field.prefix;
   field.offset=text.length;
   text+=plan&&field.prefix==='로그라인: '?field.input.value.replace(/\n/g,' '):field.input.value;
  }
  return plan?.plot?[text,plan.plot].filter(Boolean).join('\n\n'):text;
 };
 const field=(label,value,prefix,separator,multiline)=>{
  const input=node(multiline?'textarea':'input','');
  input.className='setting-inline-input';
  input.setAttribute('aria-label',label);
  input.value=value;
  if(multiline)input.rows=1;
  fields.push({input,prefix,separator,offset:0});
  input.addEventListener('input',()=>{
   const text=serialize();
   editor.value=text===originalFields&&manualEditBaseline===originalText?originalText:text;
   rememberEdit();
   syncSelection();
  });
  for(const event of ['select','keyup','pointerup','focus'])input.addEventListener(event,syncSelection);
  return input;
 };
 const reflected=reflectedSettingFacts(project.state,kind);
 const plot=kind==='plot'?buildPlotEditor(editor.value,field):null;
 if(plot)serializePlot=plot.serialize;
 const cards=plot?plot.root:plan?planDocument(editor.value,field):documentContent(editor.value,kind,source?.status||'draft',reflected,title=>({
  name:field('이름',title,'## ',fields.length?'\n\n':'',false),
  field:(label,value)=>field(label,value,label+': ','\n',true)
 }));
 if(!fields.length)return;
 const originalFields=serialize();
 cards.id='settingCardEditor';
 const container=node('div','');
 container.className='setting-inline-editor';
 container.append(cards);
 container.id='settingInlineEditor';
 $('editPanel').prepend(container);
 $('editPanel').scrollIntoView({block:'nearest'});
 editor.hidden=true;
 editor.setSelectionRange(0,0);
 syncSelectedQuote();
}
const cardBeginEdit=beginEdit;
let manualEditBaseline='';
function isManualDocumentEdit(){
 const kind=editKey?.split(':')[0];
 return kind==='plan'||kind==='plot'||kind==='episode'||referenceKinds.includes(kind);
}
const rememberWithAutosave=rememberEdit;
rememberEdit=function(){
 if(!isManualDocumentEdit())return rememberWithAutosave();
 dirty=$('editor').value!==manualEditBaseline;
 $('editStatus').textContent=dirty?'저장하지 않은 변경 사항이 있어요.':'변경 사항이 없어요.';
 updateSaveIndicator();
};
$('editor').oninput=rememberEdit;
const saveWithFeedback=saveEdit;
function showEditSaved(){
 const footer=$('preview').querySelector('.guideline-footer')||$('editBtn').closest('.document-footer');
 footer.closest('.document-pane').querySelector('.edit-save-message')?.remove();
 const message=node('span','');
 message.className='edit-save-message';
 message.setAttribute('role','status');
 footer.append(message);
 requestAnimationFrame(()=>{message.textContent='저장되었습니다';});
 setTimeout(()=>message.remove(),2800);
}
saveEdit=async function(){
 const manual=isManualDocumentEdit(), version=baseVersion, activeKey=editKey, requested=pid;
 const text=$('editor').value;
 const started=Boolean(activeKey&&dirty&&!saving);
 try{
  const result=await saveWithFeedback();
  if(started&&pid===requested&&editKey===activeKey&&(!dirty||version!==baseVersion)){
   savedDraftEditKey=activeKey;
   updateSaveIndicator();
  }
  return result;
 }
 catch(error){
  if(manual&&pid===requested&&editKey===activeKey)$('editStatus').textContent='저장하지 못했어요. 수정 내용은 편집창에 남아 있어요.';
  throw error;
 }
 finally{
  if(manual&&pid===requested&&editKey===activeKey&&version!==baseVersion)manualEditBaseline=text;
 }
};
function confirmedPlanIsSelected(){
 return key()==='plan:0'&&Boolean(project.state.official['plan:0']);
}
beginEdit=function(recovery){
 if(confirmedPlanIsSelected())throw Error('확정한 기획안은 직접 편집할 수 없어요.');
 savedDraftEditKey=null;
 cardBeginEdit(recovery);
 manualEditBaseline=recovery?
  (project.state.drafts[editKey]||project.state.official[editKey])?.text||'':$('editor').value;
 $('settingInlineEditor')?.remove();
 $('editor').hidden=false;
 const kind=editKey?.split(':')[0];
 if(isManualDocumentEdit()&&kind!=='episode')showSettingCardEditor(kind);
 setDocumentView('preview');
};
function buildPlotEditor(text,field){
 const parts=parsePlotDocument(text);
 const root=referencePlotDocument(text);
 const edits=[];
 const sections=[
  {heading:'전체 아웃라인',text:parts.overall},
  {heading:'회차 구성',text:parts.episodes},
 ];
 for(const [index,section] of Array.from(root.children).entries()){
  if(index===1&&project.state.length_setup_pending&&!project.state.official['plot:0']){
   section.remove();
   continue;
  }
  const part=sections[index];
  let offset=0;
  const table=section.querySelector('table');
  const rows=Array.from(table?.tBodies[0]?.rows||[]);
  const headers=Array.from(table?.tHead?.rows[0]?.cells||[]);
  const eventColumn=headers.findIndex(cell=>/주요 사건|사건|줄거리/.test(cell.textContent));
  for(const row of rows){
   const cell=row.cells[eventColumn>=0?eventColumn:1];
   if(!cell)continue;
   const value=cell.textContent.trim();
   const label=row.cells[0].textContent.trim();
   const labelStart=part.text.indexOf(label,offset);
   const start=value?part.text.indexOf(value,labelStart<0?offset:labelStart+label.length):-1;
   if(start<0)continue;
   const input=field(label+' 내용',value,'','',true);
   edits.push({part,start,end:start+value.length,input,singleLine:true,markdown:part.text.includes('|')});
   offset=start+value.length;
   cell.replaceChildren(input);
  }
  if(!rows.length&&part.text){
   const content=section.querySelector('.manuscript');
   if(content){
    const input=field(part.heading,part.text,'','',true);
    edits.push({part,start:0,end:part.text.length,input,markdown:false});
    content.replaceWith(input);
   }
  }
 }
 if(!edits.length)return null;
 return {root,serialize(fields){
  let result=parts.notes;
  for(const part of sections){
   if(!part.text)continue;
   result+=(result?'\n\n':'')+'## '+part.heading+'\n';
   let offset=0;
   for(const edit of edits.filter(edit=>edit.part===part)){
    result+=part.text.slice(offset,edit.start);
    fields.find(field=>field.input===edit.input).offset=result.length;
    const value=edit.singleLine?edit.input.value.replace(/\n/g,' '):edit.input.value;
    result+=edit.markdown?value.replace(/\|/g,'｜'):value;
    offset=edit.end;
   }
   result+=part.text.slice(offset);
  }
  return result;
 }};
}
const inlineEditorView=setDocumentView;
const inlineEditButton=$('editBtn');
const inlineCloseButton=$('closeEditBtn');
const closeWithSave=inlineCloseButton.onclick;
inlineCloseButton.onclick=run(async()=>{
 if(isManualDocumentEdit()&&dirty&&!saving){
  const dialog=node('dialog','');
  dialog.className='length-dialog draft-save-dialog';
  dialog.setAttribute('aria-labelledby','draftSaveTitle');
  dialog.setAttribute('aria-describedby','draftSaveDescription');
  const form=node('form','');
  form.method='dialog';
  const footer=node('footer','');
  for(const [value,label] of [['discard','저장 안 함'],['save','초안 저장']]){
   const button=node('button',label);
   button.type='submit';
   button.value=value;
   button.className=value==='save'?'primary':'secondary';
   footer.append(button);
  }
  const heading=node('h2','변경한 내용을 저장할까요?');
  heading.id='draftSaveTitle';
  const description=node('p','저장 안 함을 누르면 이번 수정 내용이 사라져요.');
  description.id='draftSaveDescription';
  form.append(heading,description,footer);
  dialog.append(form);
  document.body.append(dialog);
  const decision=await new Promise(resolve=>{
   dialog.addEventListener('close',()=>resolve(dialog.returnValue),{once:true});
   dialog.showModal();
  });
  dialog.remove();
  if(!decision)return;
  const save=decision==='save';
  if(!save){
   dirty=false;
   clearTimeout(saveTimer);
   local.removeItem(storage('edit'));
  }
 }
 if(!saving)await closeWithSave();
});
const requestPartialEdit=$('partialBtn').onclick;
$('partialBtn').onclick=run(async()=>{
 if(isManualDocumentEdit()&&dirty)throw Error('초안을 저장한 뒤 선택 문장 수정을 요청해 주세요.');
 await requestPartialEdit();
});
const editActions=inlineCloseButton.parentElement;
const openEditor=inlineEditButton.onclick;
const saveInlineEditor=run(()=>saveEdit());
setDocumentView=function(view){
 inlineEditorView(view);
 const inline=view==='preview'&&isManualDocumentEdit();
 $('editPanel').classList.toggle('manual-document-edit',isManualDocumentEdit());
 const manuscriptEditing=inline&&editKey.startsWith('episode:');
 $('editPanel').classList.toggle('manuscript-editor',manuscriptEditing);
 if(manuscriptEditing){
  $('documentTabLabel').textContent=editKey.split(':')[1]+'화 · 원고 편집';
  $('editPanel').closest('.document-body').scrollTop=0;
 }
 if(inline){
  inlineEditButton.className='primary draft-save-action';
  updateDraftSaveButton(inlineEditButton);
  inlineEditButton.onclick=saveInlineEditor;
  inlineEditButton.hidden=false;
  if(inlineCloseButton.parentElement===editActions)inlineEditButton.before(inlineCloseButton);
  $('approvalActions').hidden=true;
 }else if(inlineCloseButton.parentElement!==editActions){
  $('parkEditBtn').before(inlineCloseButton);
  inlineEditButton.className='secondary';
  inlineEditButton.replaceChildren(svgIcon('pen'),' 직접 편집');
  inlineEditButton.onclick=openEditor;
 }
 if(confirmedPlanIsSelected())inlineEditButton.hidden=true;
 editActions.hidden=inline;
};
// Project home is read-only; opening it never changes the saved work location.
async function openProjectHome(id){safeMove();clearTimeout(pollTimer);activeJob=null;pid=id;editKey=null;documentView='preview';$('editPanel').hidden=true;const requested=id;const next=await api('/projects/'+id);if(pid!==requested)return;project=next;local.setItem('storyloom.project',id);renderProjectHome();show('projectHome');window.scrollTo(0,0);}
async function enterProjectWork(kind,episode){safeMove();editKey=null;documentView='preview';$('editPanel').hidden=true;if(kind)await api('/projects/'+pid+'/view',{selected:kind,episode:episode||project.state.episode});await load();show('work');}
function renderProjectHome(){document.getElementById('projectHomeRenameOpen')?.remove();document.getElementById('projectHomeRenameForm')?.remove();const s=project.state;$('projectHome').classList.toggle('sparse-project',!((project.state.official['plan:0']||project.state.drafts['plan:0'])?.text?.length>500));$('projectHomeTitle').textContent=project.title;const cover=$('projectHomeCover');cover.style.setProperty('--cover',project.state.branch_origin?.coverColor||projectCoverColor(project.id));cover.querySelector('span').textContent=project.title;const plan=s.official['plan:0']||s.drafts['plan:0'];const parsed=parsePlanDocument(plan?.text||'');const genreBox=$('projectHomeGenre');
 genreBox.className='project-home-genres';
 const genres=genreWords(parsed.fields.장르);
 genreBox.replaceChildren(...genres.map(value=>{
   const badge=node('span','#'+value);
   badge.className='book-tag';
   return badge;
 }));
 genreBox.hidden=!genres.length;$('projectHomeIntro').textContent=parsed.fields.로그라인||'써 내려간 이야기를 바탕으로 차근차근 채워가요.';
 const selectedKey=s.selected+':'+(s.selected==='episode'?s.episode:0),current=s.drafts[selectedKey]||s.official[selectedKey];const status=current?({draft:'초안',review:'검토중',confirmed:'확정'})[current.status]:'작성 전';$('projectHomeLast').textContent='마지막 작업 · '+(s.selected==='episode'?s.episode+'화 원고':labels[s.selected]||'기획안')+' · '+status;const job=project.jobs?.find(j=>j.status==='running');$('projectHomeJob').textContent=job?'진행 중인 작업이 있습니다. 이어서 집필하기에서 진행 상태를 확인하세요.':local.getItem(storage('edit'))?'이 기기에 보관된 편집 내용이 있습니다. 작업실에서 복구할 수 있어요.':'대화와 마지막으로 열었던 자료·회차를 그대로 이어갑니다.';
 const episodes=[...new Set(Object.keys({...s.official,...s.drafts}).filter(k=>k.startsWith('episode:')).map(k=>Number(k.split(':')[1])))].sort((a,b)=>a-b);const officialCount=episodes.filter(n=>s.official['episode:'+n]).length,draftCount=episodes.filter(n=>s.drafts['episode:'+n]).length;const stats=$('projectHomeStats');stats.replaceChildren();for(const [label,value] of [['확정 회차',officialCount+'화'],['미확정 원고',draftCount+'화'],['계획 분량',formatEpisodeTotal(s.settings.total_episodes)],['회차 목표',s.settings.target_chars.toLocaleString()+'자']]){const item=node('div','');item.append(node('strong',value),node('span',label));stats.append(item);}
 const settingsBox=$('projectHomeWorld');
 settingsBox.replaceChildren();
 const settingOrder=['world','characters','lore','places'];
 const sources=Object.fromEntries(['world','lore'].filter(kind=>s.official[kind+':0']).map(kind=>[kind,s.official[kind+':0']]));
 const saved=s.home_settings;
 const valid=saved&&Object.keys(sources).length===Object.keys(saved.versions||{}).length&&
  Object.entries(sources).every(([kind,record])=>saved.versions[kind]===record.version);
 const items=new Map();
 const addSetting=({kind,title,description})=>{
  if(!settingOrder.includes(kind)||items.has(kind)||!title?.trim()||!description?.trim())return;
  items.set(kind,{kind,title,description});
 };
 if(valid&&Array.isArray(saved.items))saved.items.forEach(addSetting);
 for(const kind of settingOrder){
  if(!items.has(kind)){
   const record=s.official[kind+':0'];
   if(record?.text?.trim()){
    const entries=parseSettingRecords(record.text);
    if(kind==='characters'){
     const lead=entries.findIndex(entry=>entry.fields.역할?.includes('주인공'));
     if(lead>0)entries.unshift(...entries.splice(lead,1));
    }
    for(const entry of entries){
     const fields=entry.fields;
     const description=fields.설명||entry.notes[0]||fields.배경||fields.규칙||
      [fields.역할,fields.성격,fields.목표].filter(Boolean).join(' · ')||Object.values(fields).find(Boolean);
     addSetting({kind,title:entry.name==='이름 미정'?labels[kind]:entry.name,description});
     if(items.has(kind))break;
    }
    if(!items.has(kind))addSetting({kind,title:labels[kind],description:record.summary});
   }
  }
  if(!items.has(kind)){
   for(const {fact,name} of reflectedSettingFacts(s,kind)){
    addSetting({kind,title:name||labels[kind],description:fact});
    if(items.has(kind))break;
   }
  }
 }
 for(const kind of settingOrder){
  const item=items.get(kind);
  if(!item)continue;
  const row=node('section',''),heading=node('h3',item.title),badge=node('span',labels[item.kind]);
  row.className='project-home-setting';
  badge.className='book-tag';
  heading.append(badge);
  row.append(heading,node('p',item.description));
  settingsBox.append(row);
 }
 if(!items.size){
  const pending=Object.entries(s.records||{}).find(([episode,record])=>
   record.setting_review&&record.setting_review!=='done'&&s.official['episode:'+episode]);
  settingsBox.append(node('p',pending
   ?pending[0]+'화 원고가 확정됐어요. 작업실에서 회차 설정 검토를 이어갈 수 있어요.'
   :'아직 보여줄 확정 설정이 없어요.'));
 }
 // Hide the old section if the browser still has an earlier template open.
 const legacyPeople=document.getElementById('projectHomePeopleSection');
 if(legacyPeople)legacyPeople.remove();
 const legacyPeopleBox=document.getElementById('projectHomeCharacters');
 if(legacyPeopleBox){
   const heading=legacyPeopleBox.previousElementSibling;
   if(heading?.matches('h3')&&heading.textContent.trim()==='등장인물')heading.remove();
   legacyPeopleBox.remove();
 }
 const list=$('projectHomeEpisodes');list.replaceChildren();if(!episodes.length)list.append(node('p','아직 작성된 회차가 없습니다.'));
 const scrollable=episodes.length>5;
 list.classList.toggle('scrollable-episodes',scrollable);
 list.tabIndex=scrollable?0:-1;
 for(const n of episodes){const draft=s.drafts['episode:'+n],item=draft||s.official['episode:'+n];const row=styledButton('',()=>openChapterReader(n),'project-chapter-row');row.append(node('strong',n+'화'),node('span',chapterDisplayTitle(item,n)),node('span',chapterStatus(n)),node('span',Array.from(item.text||'').length.toLocaleString()+'자'),node('span','읽기 →'));list.append(row);}}
async function renameEpisode(){
 safeMove();
 if(busy||viewingOfficial)return;
 const selected=key(),projectId=pid;
 const current=project.state.drafts[selected]||project.state.official[selected];
 if(!current)return;
 if(document.querySelector('.episode-title-dialog'))return;
 const dialog=node('dialog','');
 dialog.className='length-dialog episode-title-dialog';
 dialog.setAttribute('aria-labelledby','episodeTitleDialogHeading');
 const heading=node('h2','회차 제목 변경');
 heading.id='episodeTitleDialogHeading';
 const form=node('form','');
 form.noValidate=true;
 const label=node('label','회차 제목');
 const input=node('input','');
 input.value=chapterDisplayTitle(current,project.state.episode);
 input.maxLength=120;
 input.required=true;
 input.autofocus=true;
 label.append(input);
 const error=node('p','');
 error.id='episodeTitleDialogError';
 error.setAttribute('role','alert');
 error.hidden=true;
 input.setAttribute('aria-describedby',error.id);
 const footer=node('footer','');
 const cancel=styledButton('취소',()=>dialog.close());
 cancel.type='button';
 const save=node('button','변경');
 save.type='submit';
 save.className='primary';
 footer.append(cancel,save);
 form.append(label,error,footer);
 dialog.append(heading,form);
 const opener=document.activeElement;
 dialog.addEventListener('cancel',event=>{if(save.disabled)event.preventDefault();});
 dialog.addEventListener('close',()=>{
  dialog.remove();
  if(opener?.isConnected)opener.focus();
 },{once:true});
 form.onsubmit=async event=>{
  event.preventDefault();
  if(save.disabled)return;
  const title=input.value.trim();
  if(!title||title.length>120||/[\x00-\x1f\x7f]/.test(title)){
   error.textContent='회차 제목은 한 줄로 1~120자 입력하세요.';
   error.hidden=false;
   input.focus();
   return;
  }
  if(title===current.title){dialog.close();return;}
  error.hidden=true;
  save.disabled=cancel.disabled=input.disabled=true;
  try{
   await api('/projects/'+projectId+'/edit',{key:selected,text:current.text,title,base_version:current.version});
   dialog.close();
   if(pid===projectId){
    await load();
    if(pid===projectId&&key()===selected)showEditSaved();
   }
  }catch(err){
   if(dialog.open){error.textContent=err.message;error.hidden=false;}
   else notice(err.message);
  }finally{save.disabled=cancel.disabled=input.disabled=false;}
 };
 document.body.append(dialog);
 dialog.showModal();
 input.select();
}
function chapterDisplayTitle(item,n){if(item?.title?.trim())return item.title.trim();const first=(item?.text||'').split('\n')[0].replace(/^#+\s*/, '').trim();return /^(?:제?\s*\d+\s*[화회]|chapter\s*\d+)/i.test(first)&&first.length<100?first.replace(/^제?\s*\d+\s*[화회]\s*[·.：:\-]?\s*/, '')||n+'화 원고':n+'화 원고';}
function chapterStatus(n){const s=project.state,d=s.drafts['episode:'+n];return d?(d.status==='review'?'검토중':'초안'):'확정';}
let readingEpisode=null;
function openChapterReader(n){const s=project.state,item=s.drafts['episode:'+n]||s.official['episode:'+n];if(!item)return;readingEpisode=n;$('readerBookTitle').textContent=project.title;$('readerTitle').textContent=n+'화 · '+chapterDisplayTitle(item,n);$('readerStatus').textContent=chapterStatus(n);$('readerCount').textContent=Array.from(item.text||'').length.toLocaleString()+'자';$('readerText').textContent=item.text||'';const numbers=[...new Set(Object.keys({...s.official,...s.drafts}).filter(k=>k.startsWith('episode:')).map(k=>Number(k.split(':')[1])))].sort((a,b)=>a-b),i=numbers.indexOf(n);$('readerPrevious').disabled=i<=0;$('readerNext').disabled=i===numbers.length-1;$('readerPrevious').onclick=()=>openChapterReader(numbers[i-1]);$('readerNext').onclick=()=>openChapterReader(numbers[i+1]);show('chapterReader');window.scrollTo(0,0);}
$('readerBack').onclick=()=>{renderProjectHome();show('projectHome');window.scrollTo(0,0);};
$('resumeProjectBtn').onclick=run(()=>enterProjectWork());$('projectHomeBack').onclick=run(library);document.getElementById('projectHomeBtn')?.remove();

const guidelineEdits=new Map();
const previousGuidelinePreview=preview;
preview=function(){
 previousGuidelinePreview();
 if(project.state.selected!=='guidelines')return;
 const projectId=pid, id='guidelines:0';
 const official=project.state.official[id], draft=project.state.drafts[id];
 const list=node('div','');
 list.className='guideline-list';
 const footer=node('div','');
 footer.className='guideline-footer';
 const status=node('span','다음 집필·수정 요청부터 적용돼요.');
 status.setAttribute('role','status');
 const original=(draft||official)?.text.split(/\r?\n/).filter(line=>line.trim())||[];
 const edit=guidelineEdits.get(projectId)||{
  items:original,base_version:official?.version??null,draft_version:draft?.version??null
 };
 const apply=styledButton('지침 적용',async()=>{
  apply.disabled=true;
  list.inert=true;
  try{
   await api('/projects/'+projectId+'/guidelines',{
    items:edit.items.map(item=>item.trim()),base_version:edit.base_version,draft_version:edit.draft_version
   });
   guidelineEdits.delete(projectId);
   if(pid===projectId){
    await load();
    if(pid===projectId)showEditSaved();
   }
  }finally{apply.disabled=false;list.inert=false;}
 },'primary');
 function changed(){guidelineEdits.set(projectId,edit);apply.disabled=edit.items.some(item=>!item.trim());}
 function draw(focus=-1){
  list.replaceChildren();
  if(!edit.items.length)list.append(node('p','등록된 작가 지침이 없어요.'));
  edit.items.forEach((item,index)=>{
   const row=node('div','');
   row.className='guideline-row';
   const startEditing=()=>{
    const input=node('input','');
    input.value=edit.items[index];
    input.setAttribute('aria-label','작가 지침 '+(index+1));
    input.oninput=()=>{edit.items[index]=input.value;changed();};
    input.onkeydown=event=>{if(event.key==='Enter'&&!event.isComposing){event.preventDefault();draw();}};
    row.firstChild.replaceWith(input);
    input.focus();
   };
   row.append(node('span',item),styledButton('수정',startEditing,'text-button'),
    styledButton('삭제',()=>{edit.items.splice(index,1);changed();draw();},'text-button'));
   list.append(row);
   if(index===focus||!item.trim())startEditing();
  });
  list.append(styledButton('+ 지침 추가',()=>{edit.items.push('');changed();draw(edit.items.length-1);}));
 }
 footer.append(status,apply);
 $('preview').replaceChildren(list,footer);
 apply.disabled=edit.items.some(item=>!item.trim());
 draw();
};
const previousGuidelineView=setDocumentView;
setDocumentView=function(view){
 previousGuidelineView(view);
 if(view==='preview'&&project.state.selected==='guidelines'){
  $('documentTabLabel').textContent='작가 지침';
  $('documentStatus').hidden=true;
  $('editBtn').hidden=true;
 }
};

const chatPane=$('chatHeading').closest('.chat-pane');
const originalPane=node('section','');
originalPane.className='original-manuscript-pane';
originalPane.hidden=true;
const originalHeading=node('div','');
originalHeading.className='pane-heading';
const originalTitle=node('h2','기존 원고');
originalHeading.append(originalTitle);
const originalBody=node('div','');
originalBody.className='document-body';
originalPane.append(originalHeading,originalBody);
chatPane.append(originalPane);
let manuscriptPair=null;
let originalVersion=null;
const sharedManuscriptScroll=node('div','');
sharedManuscriptScroll.className='shared-manuscript-scroll';
const sharedOriginalColumn=node('section',''),sharedRevisedColumn=node('section','');
sharedManuscriptScroll.append(sharedOriginalColumn,sharedRevisedColumn);
let manuscriptPreviewSlot=null;
function syncSharedManuscriptScroll(comparing){
 const preview=$('preview');
 if(comparing&&!manuscriptPreviewSlot){
  manuscriptPreviewSlot=node('span','');manuscriptPreviewSlot.hidden=true;
  preview.before(manuscriptPreviewSlot);
  sharedOriginalColumn.append(originalBody);sharedRevisedColumn.append(preview);
  chatPane.closest('.work-columns').append(sharedManuscriptScroll);
  sharedManuscriptScroll.scrollTop=0;
 }else if(!comparing&&manuscriptPreviewSlot){
  manuscriptPreviewSlot.replaceWith(preview);manuscriptPreviewSlot=null;
  originalPane.append(originalBody);sharedManuscriptScroll.remove();
 }
}
const pairNextButton=styledButton('다음 변경 ↓',()=>{
 const changes=[...$('preview').querySelectorAll('.manuscript-sentence-change')];
 if(!changes.length)return;
 const container=sharedManuscriptScroll.getBoundingClientRect();
 const at=Number(pairNextButton.dataset.nextChange||0)%changes.length;
 const next=changes[at];pairNextButton.dataset.nextChange=String((at+1)%changes.length);
 sharedManuscriptScroll.scrollTo({top:sharedManuscriptScroll.scrollTop+next.getBoundingClientRect().top-container.top-container.height*.25,behavior:'smooth'});
},'text-button manuscript-next-change');
const pairButton=styledButton('기존 원고랑 비교',()=>{
 const switches=$('preview').querySelector('.draft-switch');
 if(manuscriptPair){
  manuscriptPair=null;
 }else{
  pairNextButton.dataset.nextChange='0';
  manuscriptPair={project:pid,key:key(),wasViewingOfficial:viewingOfficial};
 }
 syncManuscriptPair();
});
function syncManuscriptPair(){
 const id=key();
 const state=project.state;
 const original=state.official[id], draft=state.drafts[id];
 const switches=$('preview').querySelector('.draft-switch');
 const available=documentView==='preview'&&!editKey&&state.selected==='episode'&&original&&draft&&
  switches&&!window.STORYLOOM_PREVIEW;
 if(!available||manuscriptPair?.project!==pid||manuscriptPair?.key!==id)manuscriptPair=null;
 const comparing=!!manuscriptPair;
 syncSharedManuscriptScroll(comparing);
 if(!comparing)pairNextButton.remove();
 originalPane.hidden=!comparing;
 chatPane.classList.toggle('comparing-manuscripts',comparing);
 const pane=$('documentTab').closest('.document-pane');
 pane.classList.toggle('comparing-manuscripts',comparing);
 if(comparing)$('documentTabLabel').textContent=state.episode+'화 · 수정 원고';
 else if(state.selected==='episode'&&$('documentTabLabel').textContent===state.episode+'화 · 수정 원고')$('documentTabLabel').textContent='원고 미리보기';
 pairButton.textContent=comparing?'비교 닫기':'기존 원고랑 비교';
 pairButton.setAttribute('aria-pressed',String(comparing));
 if(!available){
  pairButton.remove();
  return;
 }
 if(comparing){$('documentStatus').before(pairNextButton,pairButton);}
 else switches.before(pairButton);
 pairButton.classList.add('manuscript-pair-button');
 switches.classList.toggle('manuscript-pair-tabs-hidden',true);
 if(viewingOfficial)switches.lastElementChild.click();
 if(comparing){
  const source=pid+':'+id+':'+original.version;
  if(originalVersion!==source){
   originalTitle.textContent=state.episode+'화 · 기존 원고';
   originalBody.replaceChildren(documentContent(original.text,'episode',original.status));
   originalBody.scrollTop=0;
   originalVersion=source;
  }
  const revisedBody=$('preview').querySelector('.main-document-text');
  const highlightSource=JSON.stringify([pid,id,original.version,draft.version]);
  if(revisedBody&&revisedBody.dataset.sentenceChangeSource!==highlightSource){
   window.manuscriptDiff.highlight(originalBody,revisedBody);
   revisedBody.dataset.sentenceChanges='true';
   revisedBody.dataset.sentenceChangeSource=highlightSource;
   pairNextButton.dataset.nextChange='0';
  }
  pairNextButton.disabled=!$('preview').querySelector('.manuscript-sentence-change');
 }else{
  originalVersion=null;
  const revisedBody=$('preview').querySelector('.main-document-text');
  if(revisedBody?.dataset.sentenceChanges){
   const shown=viewingOfficial?original:draft;
   if(shown)revisedBody.replaceChildren(documentContent(shown.text,'episode',shown.status));
   delete revisedBody.dataset.sentenceChanges;
   delete revisedBody.dataset.sentenceChangeSource;
  }
 }
}
const manuscriptPairView=setDocumentView;
setDocumentView=function(view){
 manuscriptPairView(view);
 syncManuscriptPair();
};

const showDirectEditing=false;
document.body.classList.toggle('ai-only-editing',!showDirectEditing);
const openProjectExport=run(()=>{
 $('projectExportBtn').closest('details').open=false;
 const state=project.state;
 const url='/api/projects/'+encodeURIComponent(pid)+'/export';
 const dialog=node('dialog','');
 dialog.className='length-dialog project-export-dialog';
 const title=node('h2','내보내기');
 title.id='projectExportTitle';
 dialog.setAttribute('aria-labelledby',title.id);
 const form=node('form','');
 const episodes=Object.keys(state.official).filter(id=>id.startsWith('episode:'))
  .map(id=>Number(id.split(':')[1])).sort((a,b)=>a-b);
 const fieldset=node('fieldset','');
 fieldset.append(node('legend','회차 원고 내려받기'));
 const all=node('input','');
 all.type='checkbox';
 const allLabel=node('label','');
 allLabel.append(all,node('span','전체 선택'));
 const list=node('div','');
 list.className='export-episode-list';
 for(const number of episodes){
  const row=node('label','');
  const choice=node('input','');
  choice.type='checkbox';
  choice.value=String(number);
  const chapterTitle=state.official['episode:'+number].title;
  row.append(choice,node('span',number+'화'+(chapterTitle?' · '+chapterTitle:'')));
  list.append(row);
 }
 const choices=[...list.querySelectorAll('input')];
 const download=node('button','내려받기');
 download.type='submit';
 download.className='primary';
 const sync=()=>{
  const count=choices.filter(choice=>choice.checked).length;
  all.checked=choices.length>0&&count===choices.length;
  all.indeterminate=count>0&&count<choices.length;
  download.disabled=!count;
  download.textContent=count?count+'개 회차 내려받기':'내려받기';
 };
 all.onchange=()=>{for(const choice of choices)choice.checked=all.checked;sync();};
 list.onchange=sync;
 if(choices.length)fieldset.append(allLabel,list,download);
 else fieldset.append(node('p','확정된 회차가 아직 없어요.'));
 form.append(fieldset);
 form.onsubmit=event=>{
  event.preventDefault();
  const selected=choices.filter(choice=>choice.checked);
  if(!selected.length)return;
  const request=node('form','');
  request.method='post';
  request.action=url;
  request.hidden=true;
  for(const [name,value] of [['format','episodes'],...selected.map(choice=>['episode',choice.value])]){
   const input=node('input','');
   input.type='hidden';
   input.name=name;
   input.value=value;
   request.append(input);
  }
  document.body.append(request);
  request.submit();
  request.remove();
 };
 const other=node('div','');
 other.className='export-other-actions';
 const hasSettings=['plan',...referenceKinds,'plot'].some(kind=>state.official[kind+':0']);
 for(const [format,label,available] of [['settings-txt','기획안·설정 내려받기',hasSettings],['zip','작품 전체 백업',true]]){
  const link=node('a',label);
  link.className='secondary';
  if(available){link.href=url+'?format='+format;link.download='';}
  else link.setAttribute('aria-disabled','true');
  other.append(link);
 }
 const closeExport=styledButton('닫기',()=>dialog.close());
 const footer=node('footer','');
 footer.append(closeExport);
 dialog.append(title,form,other,footer);
 dialog.addEventListener('close',()=>dialog.remove(),{once:true});
 document.body.append(dialog);
 sync();
 dialog.showModal();
});
$('projectExportBtn').onclick=openProjectExport;
$('projectHomeExportBtn').onclick=openProjectExport;
const previewQuote=node('section','');
previewQuote.className='chat-selection-quote';
previewQuote.hidden=true;
const previewQuoteText=node('span','');
previewQuoteText.setAttribute('aria-live','polite');
const clearPreviewQuote=styledButton('×',()=>{
 previewEditSelection=null;
 syncPreviewQuote();
},'text-button');
clearPreviewQuote.type='button';
clearPreviewQuote.setAttribute('aria-label','선택한 구절 해제');
previewQuote.append(node('strong','선택한 구절'),previewQuoteText,clearPreviewQuote);
$('chatForm').before(previewQuote);
let previewEditSelection=null;

function previewEditableSource(){
 if(editKey||$('work').hidden)return null;
 const state=project?.state;
 if(!state)return null;
 const panel=$('revisionImpactPanel');
 if(panel&&!panel.hidden){
  const body=panel.querySelector('[data-selection-document]');
  if(!body)return null;
  const id=body.dataset.selectionDocument;
  return {id,body,source:state.drafts[id]||state.official[id]};
 }
 if(documentView!=='preview'||viewingOfficial)return null;
 const id=key();
 if(!['plan',...referenceKinds,'plot','episode'].includes(state?.selected)||
    (id==='plan:0'&&state.official[id]))return null;
 const editable=project.setting_edit_source;
 return {id,body:$('preview').querySelector('.main-document-text'),source:editable?.key===id?editable:visibleDocumentDraft(state,id)||state.official[id]};
}

function previewSelectionScope(raw, rendered, preceding, selected){
 const compact=value=>value.replace(/\s/g,'');
 const quote=compact(selected);
 if(!quote)return null;
 const find=(text,part)=>{
  const hits=[];
  for(let index=text.indexOf(part);index>=0;index=text.indexOf(part,index+part.length))hits.push(index);
  return hits;
 };
 const rawHits=find(compact(raw),quote);
 const renderedHits=find(compact(rendered),quote);
 const relative=renderedHits.indexOf(compact(preceding).length);
 if(relative<0||!rawHits.length||(rawHits.length>1&&rawHits.length!==renderedHits.length))return null;
 const offset=rawHits.length===1?rawHits[0]:rawHits[relative];
 const positions=[];
 for(let index=0;index<raw.length;index++)if(!/\s/.test(raw[index]))positions.push(index);
 const start=positions[offset], end=positions[offset+quote.length-1]+1;
 return {start:Array.from(raw.slice(0,start)).length,quote:raw.slice(start,end)};
}

function syncPreviewHighlight(selection,body){
 if(!window.CSS?.highlights||!window.Highlight)return;
 CSS.highlights.delete('storyloom-selected-passage');
 if(!selection||!body||body.textContent!==selection.rendered)return;
 const walker=document.createTreeWalker(body,NodeFilter.SHOW_TEXT);
 const range=document.createRange();
 let offset=0, started=false;
 while(walker.nextNode()){
  const part=walker.currentNode;
  const next=offset+part.length;
  if(!started&&selection.renderStart<next){
   range.setStart(part,selection.renderStart-offset);
   started=true;
  }
  if(started&&selection.renderEnd<=next){
   range.setEnd(part,selection.renderEnd-offset);
   CSS.highlights.set('storyloom-selected-passage',new Highlight(range));
   return;
  }
  offset=next;
 }
}

function syncPreviewQuote(){
 const {id,body,source}=previewEditableSource()||{};
 if(source&&previewEditSelection?.project===pid&&previewEditSelection.key===id&&
    previewEditSelection.version!==source.version){
  previewEditSelection=null;
 }
 previewQuote.hidden=!source||previewEditSelection?.project!==pid||
  previewEditSelection.key!==id||previewEditSelection.version!==source.version;
 if(!previewQuote.hidden){
  previewQuoteText.textContent=previewEditSelection.quote;
  previewQuoteText.title=previewEditSelection.quote;
 }
 syncPreviewHighlight(previewQuote.hidden?null:previewEditSelection,body);
}
document.addEventListener('selectionchange',()=>{
 const selection=window.getSelection();
 const {id,body,source}=previewEditableSource()||{};
 if(!source){syncPreviewQuote();return;}
 if(!body||!selection||selection.isCollapsed||!selection.rangeCount)return;
 const range=selection.getRangeAt(0);
 if(!body.contains(range.startContainer)||!body.contains(range.endContainer))return;
 const prefix=range.cloneRange();
 prefix.selectNodeContents(body);
 prefix.setEnd(range.startContainer,range.startOffset);
 const rendered=body.textContent, preceding=prefix.toString(), selected=range.toString();
 const scope=previewSelectionScope(source.text,rendered,preceding,selected);
 previewEditSelection=scope?{...scope,project:pid,key:id,version:source.version,
  rendered,renderStart:preceding.length,renderEnd:preceding.length+selected.length}:null;
 syncPreviewQuote();
});
const regularChatSubmit=$('chatForm').onsubmit;
$('chatForm').onsubmit=run(async event=>{
 syncPreviewQuote();
 if(previewQuote.hidden){regularChatSubmit(event);return;}
 event.preventDefault();
 if(busy)return;
 const instruction=$('chatInput').value.trim();
 if(!instruction)throw Error('수정 지시를 입력해 주세요.');
 const {key,quote,start,version}=previewEditSelection;
 pending=null;
 await send(instruction,{key,quote,start,version});
});
const previewSelectionRender=render;
let episodeBatchPoll;
render=function(){
 previewSelectionRender();
 syncPreviewQuote();
 clearTimeout(episodeBatchPoll);
 if(['running','stopping'].includes(project.state.episode_batch?.status)){
  const requested=pid;
  episodeBatchPoll=setTimeout(()=>{
   if(pid===requested&&!$('work').hidden)load().catch(error=>notice(error.message));
  },1800);
 }
 const failed=project.jobs?.find(job=>job.id===pending?.request_id&&job.status==='failed');
 if(failed&&!previewQuote.hidden&&pending?.edit_scope?.version===previewEditSelection.version&&
    !$('chatInput').value.trim()){
  $('chatInput').value=pending.text;
  $('chatInput').oninput();
 }
};
