'use strict';
const $=id=>document.getElementById(id);
const labels={plan:'기획안',characters:'등장인물',world:'세계관',places:'장소',lore:'주요 설정',plot:'플롯',episode:'회차 원고',settings:'분량 설정',memory:'장기 기억',guidelines:'작가 지침'};
const local={
 getItem(name){try{return (window.STORYLOOM_PREVIEW_STORAGE||window.localStorage).getItem(name);}catch{notice('브라우저 로컬 저장소에 접근하지 못했습니다.');return null;}},
 setItem(name,value){try{(window.STORYLOOM_PREVIEW_STORAGE||window.localStorage).setItem(name,value);return true;}catch{notice('브라우저 복구본 저장에 실패했습니다. 편집을 서버에 저장하거나 텍스트를 복사해 보관하세요.');return false;}},
 removeItem(name){try{(window.STORYLOOM_PREVIEW_STORAGE||window.localStorage).removeItem(name);}catch{notice('브라우저 복구본 정리에 실패했습니다.');}}
};
function readLocalJSON(name){const value=local.getItem(name);if(!value)return null;try{return JSON.parse(value);}catch{notice('손상된 로컬 복구 정보가 있습니다. 서버 자료는 그대로 불러옵니다.');return null;}}
let pid=local.getItem('storyloom.project'),project,account,busy=false,activeJob=null,pollTimer=null,pending=null;
let editKey=null,baseVersion=null,dirty=false,saving=false,saveTimer=null,saveAgain=false;
const node=(tag,text)=>{const n=document.createElement(tag);n.textContent=text;return n;};
const button=(text,fn)=>{const b=node('button',text);b.type='button';b.onclick=run(fn);return b;};
function notice(text){$('notice').textContent=text;}
function run(fn){return async(...args)=>{try{await fn(...args);}catch(error){notice(error.message);}};}
async function api(path,data){const response=await fetch('/api'+path,{method:data===undefined?'GET':'POST',headers:{'Content-Type':'application/json'},body:data===undefined?undefined:JSON.stringify(data)});let result;try{result=await response.json();}catch{throw Error('서버 응답을 확인하지 못했습니다. 입력은 유지됩니다.');}if(!response.ok){if(response.status===401){account={logged_in:false};show('auth');}throw Error(result.error||'요청 실패');}return result;}
function show(page){for(const id of ['home','auth','discover','libraryPage','projectHome','chapterReader','work'])$(id).hidden=id!==page;}
function key(){return project.state.selected+':'+(project.state.selected==='episode'?project.state.episode:0);}
function storage(name){return 'storyloom.'+name+'.'+pid;}
function lock(value){busy=value;for(const id of ['sendBtn','retryBtn','settingsBtn'])$(id).disabled=value;$('cancelBtn').hidden=!value;for(const b of document.querySelectorAll('[data-ask]'))b.disabled=value;}
async function init(){account=await api('/auth/session');$('logoutBtn').hidden=!account.required||!account.logged_in;$('account').textContent=account.nickname||account.username||'';if(account.logged_in){if(pid){try{await load();show('work');return;}catch{pid=null;}}await library();}else{show('home');notice('로그인 후 작품을 선택하세요.');}}
async function authenticate(register=false){const username=$('username').value.trim(),password=$('password').value;if(!username||password.length<8)throw Error('아이디와 8자 이상 비밀번호를 입력하세요.');const payload={username,password};if(register){payload.nickname=$('nickname').value.trim();payload.password_confirm=$('passwordConfirm').value;}await api('/auth/'+(register?'register':'login'),payload);$('password').value='';account=await api('/auth/session');$('logoutBtn').hidden=false;$('account').textContent=account.nickname||account.username||'';await library();}
async function library(){if(!account?.logged_in){show('auth');return;}if(dirty||saving)throw Error('편집 저장이 완료된 뒤 이동하거나 로컬 보관 후 닫아주세요.');clearTimeout(pollTimer);const projects=await api('/projects');show('libraryPage');$('projectList').replaceChildren();for(const p of projects){if(p.archived&&!$('showArchived').checked)continue;const row=node('p',p.title+(p.archived?' (보관됨)':''));row.append(button('열기',async()=>{pid=p.id;editKey=null;await load();show('work');}));$('projectList').append(row);}if(!$('projectList').children.length)$('projectList').append(node('p','아직 작품이 없습니다. 새 작품을 만드세요.'));notice('작품은 선택할 때 이전 작업을 조용히 복원합니다.');}
async function load(){if(!pid)return;const requested=pid;const next=await api('/projects/'+pid);if(requested!==pid)return;project=next;local.setItem('storyloom.project',pid);pending=readLocalJSON(storage('pending'));render();const running=project.jobs.find(j=>j.status==='running');activeJob=running?.id||null;lock(!!running);if(running){$('jobState').textContent=running.progress||'작업 중';notice('AI 응답 대기 중입니다. 아직 완료되지 않았습니다.');schedulePoll();}else{const latestJob=project.jobs[0];const failed=latestJob?.status==='failed'&&latestJob.id!==project.state.episode_batch?.request_id?latestJob:null;if(failed&&!pending){const r=await api('/projects/'+pid+'/jobs/'+failed.id);pending=r.retry_payload||null;$('retryBtn').textContent=r.resume?.scenes_saved?'저장된 장면부터 재시도':r.resume?.plan_saved?'완료한 계획을 유지하고 재시도':'실패 요청 재시도';}if(!failed&&project.jobs[0]?.status==='done'){local.removeItem(storage('pending'));pending=null;}$('retryBtn').hidden=!pending;$('jobState').textContent=failed?'이전에 완료되지 않은 요청이 있습니다. 필요하면 다시 시도할 수 있어요.':'';notice('');}}
function render(){const s=project.state;$('title').textContent=project.title;$('archiveBtn').textContent=s.archived?'보관 해제':'보관';$('messages').replaceChildren(...s.messages.map(m=>{const n=node('div',(m.role==='user'?'나':'AI')+'\n'+m.text);n.className='message';return n;}));$('messages').scrollTop=$('messages').scrollHeight;$('tabs').replaceChildren(...Object.entries(labels).map(([name,label])=>button((name===s.selected?'• ':'')+label,()=>select(name))));$('episodeInput').value=s.episode;const numbers=[...new Set([...Object.keys(s.official),...Object.keys(s.drafts)].filter(k=>k.startsWith('episode:')).map(k=>Number(k.split(':')[1])))].sort((a,b)=>a-b);$('episodeList').replaceChildren(node('option','작성된 회차'));$('episodeList').firstChild.value='';for(const number of numbers){const option=node('option',number+'화');option.value=number;$('episodeList').append(option);}$('officialSettings').textContent='총 '+s.settings.total_episodes+'화 / 회차당 '+s.settings.target_chars+'자';$('targetChars').value=s.settings.target_chars;$('totalEpisodes').value=s.settings.total_episodes;$('records').textContent=Object.entries(s.official).filter(([k])=>k.startsWith('episode:')).sort((a,b)=>Number(a[0].split(':')[1])-Number(b[0].split(':')[1])).map(([k,v])=>k+'\n요약: '+(v.summary||'미정리')+'\n사실: '+(v.facts||'미정리')).join('\n\n');$('chatInput').value=local.getItem(storage('input'))||'';preview();}
async function select(name){if(dirty||saving)throw Error('편집 저장이 완료된 뒤 이동해주세요.');editKey=null;$('editPanel').hidden=true;$('diff').hidden=true;await api('/projects/'+pid+'/view',{selected:name,episode:Number($('episodeInput').value)});await load();}
function preview(){const k=key(),s=project.state;$('preview').replaceChildren();for(const [title,item,draft]of [['제안',s.drafts[k],true],['공식 확정본',s.official[k],false]]){if(!item)continue;const section=node('article','');section.append(node('h3',title+' · '+({draft:'초안',review:'검토중',confirmed:'확정'}[item.status]||item.status)+' · '+Array.from(item.text).length+'자'),node('pre',item.text));if(s.selected==='episode'){const target=s.settings.target_chars;if(Array.from(item.text).length<target*.8||Array.from(item.text).length>target*1.2)section.append(node('p','목표 '+target+'자와 분량 차이가 있습니다. 승인 전에 확인하세요.'));}if(s.selected!=='world'&&item.summary)section.append(node('p','요약: '+item.summary));if(item.facts)section.append(node('p','회차 사실 기록: '+item.facts));if(item.impact)section.append(node('p','AI가 제안한 영향 검토: '+item.impact));if(draft){section.append(button(item.status==='draft'?'검토중으로 전환':'이 버전 승인',()=>action(item.status==='draft'?'review':'approve',item.version)),button('제안 거절·확정본 유지',()=>action('reject',item.version)));}$('preview').append(section);}if(!$('preview').children.length)$('preview').append(node('p','자료가 없습니다. 대화로 생성하거나 직접 작성할 수 있습니다.'));$('recoverBtn').hidden=!local.getItem(storage('edit'));renderHistory().catch(e=>notice(e.message));}
async function action(action,version){if(dirty)throw Error('편집 내용을 먼저 저장하세요.');await api('/projects/'+pid+'/draft',{action,key:key(),version});await load();}
async function renderHistory(){const selected=key(),requested=pid;const versions=await api('/projects/'+pid+'/versions');if(requested!==pid||selected!==key())return;$('history').replaceChildren();for(const v of versions.filter(v=>v.kind+':'+v.episode===selected)){const row=node('div','#'+v.id+' · '+v.status+' · '+new Date(v.created*1000).toLocaleString());const details=node('details','');details.append(node('summary','내용 보기'),node('pre',JSON.parse(v.content).text));row.append(details,button('현재 초안으로 복원',async()=>{if(dirty)throw Error('편집을 먼저 저장하세요.');await api('/projects/'+pid+'/draft',{action:'restore',key:selected,version:v.id,base_version:(project.state.drafts[selected]||project.state.official[selected])?.version??null});await load();}),button('현재 초안과 비교',()=>compare(v.id)));$('history').append(row);}const conflicts=project.state.conflicts||[];if(conflicts.some(c=>c.key===selected))$('history').prepend(node('p','동시 수정으로 자동 적용하지 않은 제안이 있습니다. 위 버전 내용을 확인하고 필요하면 현재 초안으로 복원하세요.'));}
async function compare(version){const result=await api('/projects/'+pid+'/compare?key='+encodeURIComponent(key())+(version?'&version='+version:''));$('diff').hidden=false;$('diff').replaceChildren(node('p','기준 '+result.before_chars+'자 → 제안 '+result.after_chars+'자'));for(const change of result.changes){if(change.type==='equal')$('diff').append(node('pre',change.after));else{if(change.before)$('diff').append(node('del',change.before));if(change.after)$('diff').append(node('ins',change.after));}}}
function beginEdit(recovery){if(dirty)throw Error('저장 전 편집을 덮어쓸 수 없습니다. 먼저 저장하거나 로컬 복구본을 유지한 채 작업을 닫으세요.');if(busy)throw Error('생성 완료 후 직접 편집하세요.');const record=project.state.drafts[key()]||project.state.official[key()]||{};const nextKey=recovery?.key||key();if(nextKey!==key())throw Error('복구할 편집의 자료 탭·회차를 먼저 선택하세요.');editKey=nextKey;baseVersion=recovery?recovery.base_version:(record.version??null);$('editor').value=recovery?.text??record.text??'';dirty=!!recovery;$('editPanel').hidden=false;$('editStatus').textContent=dirty?'로컬 편집을 복구했습니다. 저장 전 최신 버전을 확인하세요.':'직접 수정해도 확정본은 바뀌지 않습니다.';}
function rememberEdit(){if(!editKey)return;dirty=true;const remembered=local.setItem(storage('edit'),JSON.stringify({key:editKey,text:$('editor').value,base_version:baseVersion}));$('editStatus').textContent=remembered?'저장 대기 · 브라우저에 복구본 보관':'로컬 복구본 저장 실패 · 서버 저장 또는 텍스트 복사 필요';clearTimeout(saveTimer);if($('autoSave').checked)saveTimer=setTimeout(()=>saveEdit().catch(e=>notice(e.message)),1200);}
async function saveEdit(){if(!editKey||!dirty)return;if(saving){saveAgain=true;return;}saving=true;const content=$('editor').value,selected=editKey,requested=pid;try{const result=await api('/projects/'+pid+'/edit',{key:selected,text:content,base_version:baseVersion});if(requested!==pid)return;baseVersion=result.version;dirty=$('editor').value!==content;$('editStatus').textContent='초안 저장됨 · 승인 전 미확정';if(!dirty)local.removeItem(storage('edit'));else local.setItem(storage('edit'),JSON.stringify({key:editKey,text:$('editor').value,base_version:baseVersion}));await load();}catch(e){$('editStatus').textContent='저장 실패 · 입력을 브라우저에 보존했습니다. 자동 덮어쓰지 않습니다.';clearTimeout(saveTimer);throw e;}finally{saving=false;if(saveAgain){saveAgain=false;if(dirty)await saveEdit();}}}
function schedulePoll(){clearTimeout(pollTimer);pollTimer=setTimeout(()=>poll().catch(e=>{notice(e.message);if(activeJob)schedulePoll();}),2000);}
async function poll(){if(!activeJob)return;const requested=pid,id=activeJob;const job=await api('/projects/'+pid+'/jobs/'+id);if(requested!==pid||id!==activeJob)return;$('jobState').textContent=(job.progress||job.status)+' · '+job.elapsed+'초';$('livePanel').hidden=!job.partial||job.status!=='running';$('livePreview').textContent=job.partial||'';if(job.status==='running'){notice('AI 처리 중 · '+job.elapsed+'초 · '+(job.progress||'응답 대기'));schedulePoll();return;}activeJob=null;lock(false);if(job.status==='done'){local.removeItem(storage('pending'));pending=null;}await load();if(job.status==='failed')$('jobState').textContent=job.error||'요청에 실패했습니다. 다시 시도할 수 있어요.';notice(job.status==='done'?'':job.error||'작업을 중단했습니다.');}
async function send(text,editScope){if(busy)return;if(dirty||saving)throw Error('직접 편집 저장이 완료된 뒤 요청하세요.');if(!pending){pending={request_id:crypto.randomUUID(),text:text||$('chatInput').value,...(editScope?{edit_scope:editScope}:{})};if(!pending.text.trim())throw Error('요청을 입력하세요.');}const submitted={...pending},requested=pid;local.setItem(storage('pending'),JSON.stringify(submitted));lock(true);notice('요청을 보내고 있습니다. 아직 완료되지 않았습니다.');try{await api('/projects/'+requested+'/chat',{...submitted,background:true});if(requested!==pid)return;activeJob=submitted.request_id;$('chatInput').value='';local.removeItem(storage('input'));await load();if(activeJob)schedulePoll();}catch(e){if(requested!==pid)return;lock(false);$('retryBtn').hidden=false;try{await load();}catch{}throw e;}}
$('startBtn').onclick=run(()=>account.logged_in?library():show('auth'));$('homeBtn').onclick=()=>show('home');$('libraryBtn').onclick=run(library);$('authForm').onsubmit=e=>{e.preventDefault();run(()=>authenticate(false))();};$('registerBtn').onclick=run(()=>authenticate(true));$('logoutBtn').onclick=run(async()=>{if(dirty||saving)throw Error('편집 저장이 끝난 뒤 로그아웃하세요.');await api('/auth/logout',{});clearTimeout(pollTimer);pid=null;project=null;activeJob=null;$('chatInput').value='';await init();});
$('newBtn').onclick=run(async()=>{const title=$('newTitle').value;pid=(await api('/projects',{title:title.trim()||'제목 미정',defer_length_setup:true})).id;editKey=null;await load();show('work');});$('showArchived').onchange=run(library);$('renameBtn').onclick=run(async()=>{const title=$('renameTitle').value.trim();if(!title)throw Error('변경할 제목을 입력하세요.');await api('/projects/'+pid+'/manage',{title});await load();});$('archiveBtn').onclick=run(async()=>{await api('/projects/'+pid+'/manage',{archived:!project.state.archived});await load();});$('refreshBtn').onclick=run(load);
$('episodeInput').onchange=run(()=>select(project.state.selected));$('episodeList').onchange=run(async()=>{if(!$('episodeList').value)return;$('episodeInput').value=$('episodeList').value;await select('episode');});
$('editBtn').onclick=run(()=>beginEdit());$('editor').oninput=rememberEdit;$('saveBtn').onclick=run(saveEdit);$('autoSave').onchange=()=>{if(dirty&&$('autoSave').checked)rememberEdit();};$('closeEditBtn').onclick=run(async()=>{if(dirty)await saveEdit();if(dirty)return;clearTimeout(saveTimer);editKey=null;$('editPanel').hidden=true;});$('recoverBtn').onclick=run(()=>beginEdit(readLocalJSON(storage('edit'))));
$('partialBtn').onclick=run(async()=>{if(busy)throw Error('현재 생성이 끝난 뒤 수정 요청을 보내세요.');const selected=$('editor').value.slice($('editor').selectionStart,$('editor').selectionEnd);const selectedKey=editKey;if(!selected)throw Error('먼저 수정할 문장을 선택하세요.');if(dirty)await saveEdit();if(dirty)return;const instruction=$('partialInstruction').value.trim();if(!instruction)throw Error('수정 지시를 입력하세요.');const [kind,ep]=selectedKey.split(':');pending=null;await send((kind==='episode'?ep+'화':labels[kind])+'에서 다음 구절만 수정하고 나머지 원문은 유지해줘.\n선택 구절:\n'+selected+'\n수정 요청: '+instruction,{key:selectedKey,quote:selected});});
$('chatInput').oninput=()=>{if(pid)local.setItem(storage('input'),$('chatInput').value);};$('chatForm').onsubmit=e=>{e.preventDefault();if(busy)return;pending=null;run(()=>send())();};$('retryBtn').onclick=run(()=>send());$('cancelBtn').onclick=run(async()=>{if(activeJob)await api('/projects/'+pid+'/cancel/'+activeJob,{});activeJob=null;clearTimeout(pollTimer);local.removeItem(storage('pending'));pending=null;await load();notice('결과 반영을 취소했습니다. 이미 전송한 API 요청은 즉시 중단되지 않을 수 있습니다.');});
for(const b of document.querySelectorAll('[data-ask]'))b.onclick=run(()=>{if(busy)return;pending=null;return send(b.dataset.ask);});
window.addEventListener('beforeunload',event=>{if(dirty){event.preventDefault();event.returnValue='';}});
const backupDialog=$('importDialog');
$('importOpen').onclick=()=>$('importFile').click();
$('importFile').onchange=()=>{
 const file=$('importFile').files[0];
 if(!file)return;
 $('importFilename').textContent=file.name;
 $('importError').hidden=true;
 backupDialog.showModal();
};
$('importCancel').onclick=()=>backupDialog.close();
backupDialog.addEventListener('cancel',event=>{if($('importBtn').disabled)event.preventDefault();});
backupDialog.addEventListener('close',()=>{$('importFile').value='';});
$('importBtn').onclick=run(async()=>{
 const file=$('importFile').files[0];
 if(!file)throw Error('Storyloom 백업 ZIP 또는 JSON 파일을 선택하세요.');
 $('importError').hidden=true;
 $('importBtn').disabled=true;
 $('importCancel').disabled=true;
 try{
  if(file.size>31*1024*1024)throw Error('백업 가져오기 한도는 31MB입니다.');
  let result;
  if(file.name.toLowerCase().endsWith('.zip')){
   const form=new FormData();
   form.append('backup',file);
   const response=await fetch('/api/projects/import',{method:'POST',body:form});
   result=await response.json();
   if(!response.ok)throw Error(result.error||'백업을 가져오지 못했어요.');
  }else{
   let backup;
   try{backup=JSON.parse(await file.text());}
   catch{throw Error('Storyloom 백업 JSON 파일을 확인해 주세요.');}
   result=await api('/projects/import',backup);
  }
  backupDialog.close();
  pid=result.id;
  editKey=null;
  await load();
  show('work');
  notice('백업을 새 작품으로 가져왔어요.');
 }catch(error){
  if(!backupDialog.open)throw error;
  $('importError').textContent=error.message;
  $('importError').hidden=false;
 }finally{
  $('importBtn').disabled=false;
  $('importCancel').disabled=false;
 }
});
$('parkEditBtn').onclick=run(()=>{if(saving)throw Error('저장이 끝난 뒤 닫아주세요.');if(editKey&&!local.setItem(storage('edit'),JSON.stringify({key:editKey,text:$('editor').value,base_version:baseVersion})))throw Error('로컬 보관이 불가능합니다. 먼저 텍스트를 복사해 안전한 곳에 저장하세요.');clearTimeout(saveTimer);dirty=false;editKey=null;$('editPanel').hidden=true;$('recoverBtn').hidden=false;notice('입력을 로컬 복구본으로 보관했습니다. 서버 원고는 바꾸지 않았습니다.');});
if(!document.querySelector?.('script[data-studio]'))run(init)();
