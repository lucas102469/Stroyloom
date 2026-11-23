'use strict';
// Historical reads use only stored snapshots, never today's canonical settings.
(()=>{
 let owner=null,choice='current',indexKey='',index=null,loading=false,error='',settingsStamp=null;
 const preferences=new Map();
 function remember(){
  const value={choice,stamp:settingsStamp};preferences.set(pid,value);
  try{localStorage.setItem('storyloom-setting-view:'+pid,JSON.stringify(value));}catch{}
 }
 function settingsFingerprint(state){
  const kinds=[...referenceKinds,'plot'];
  const documents=kinds.map(kind=>[kind,state.official[kind+':0']?.version,state.drafts[kind+':0']?.version]);
  const facts=new Set();
  for(const record of Object.values(state.records||{})){
   if(record.setting_review!=='done')continue;
   for(const item of record.findings||[]){
    if(!item.reason&&!item.removed)facts.add(JSON.stringify([item.kind,item.name,item.field,item.fact]));
   }
  }
  return JSON.stringify([documents,[...facts].sort()]);
 }
 const snapshots=new Map();
 const isReference=()=>project&&[...referenceKinds,'plot'].includes(project.state.selected);
 const selector=node('label',''),selectBox=node('select','');
 selector.id='settingHistorySelector';selector.className='setting-history-selector';
 selectBox.setAttribute('aria-label','설정 기준');selector.append(selectBox);
 if(typeof ResizeObserver!=='undefined'){
  new ResizeObserver(()=>{
   if(!selector.hidden)$('preview').style.setProperty('--setting-description-inset',
    (selector.getBoundingClientRect().width+1)+'px');
  }).observe(selector);
 }
 function reset(){
  if(owner===pid)return;
  let saved=preferences.get(pid);
  try{saved=saved||JSON.parse(localStorage.getItem('storyloom-setting-view:'+pid));}catch{}
  owner=pid;choice=/^(current|\d{1,5})$/.test(saved?.choice)?saved.choice:'current';
  settingsStamp=typeof saved?.stamp==='string'?saved.stamp:null;
  indexKey='';index=null;loading=false;error='';snapshots.clear();
 }
 function populate(){
  selectBox.replaceChildren();
  for(const item of [{episode:'current',label:'현재 설정'},...(index?.options||[])]){
   const option=node('option',item.label);option.value=String(item.episode);selectBox.append(option);
  }
  selectBox.value=choice;
 }
 function draw(){
  if(!isReference()||documentView!=='preview'||choice==='current')return;
  viewingOfficial=true;
  $('editBtn').hidden=true;$('recoverBtn').hidden=true;$('approvalActions').replaceChildren();
  $('approvalActions').hidden=true;$('documentStatus').hidden=true;
  const root=$('preview');root.replaceChildren();
  const saved=snapshots.get(choice);
  if(error){root.append(node('p',error));return;}
  if(!saved){root.append(node('p','설정 기록을 불러오고 있어요.'));return;}
  if(!saved.available){root.append(node('p','당시 설정 기록이 없어요. 현재 설정으로 대신 표시하지 않습니다.'));return;}
  const kind=project.state.selected,item=saved.official[kind+':0'];
  const historical={official:saved.official,drafts:{},records:saved.records,linked_names:saved.linked_names||{}};
  const currentProject=project;
  try{
   // Existing card/plot renderers consult project.state synchronously.
   project={...currentProject,setting_edit_source:null,state:{...currentProject.state,...historical,length_setup_pending:false},plot_events:{}};
   root.append(documentContent(item?.text||'',kind,'confirmed',reflectedSettingFacts(historical,kind)));
  }finally{project=currentProject;}
 }
 async function fetchSnapshot(){
  if(choice==='current'||snapshots.has(choice)){draw();return;}
  const requested=pid,selected=choice,signature=indexKey;
  try{
   const result=await api('/projects/'+requested+'/setting-history?episode='+selected);
   if(pid!==requested||signature!==indexKey)return;
   snapshots.set(selected,result);
  }catch(exc){if(pid===requested&&choice===selected)error=exc.message;}
  if(pid===requested&&choice===selected)draw();
 }
 function update(){
  reset();
  if(!project?.state){selector.hidden=true;return;}
  const stamp=settingsFingerprint(project.state);
  if(settingsStamp!==null&&settingsStamp!==stamp)choice='current';
  settingsStamp=stamp;remember();
  selector.hidden=!isReference()||documentView!=='preview';
  if(selector.hidden)return;
  if(!selector.isConnected)$('referenceTabs').append(selector);
  const s=project.state;
  const signature=pid+JSON.stringify([Object.entries(s.official).map(([key,item])=>[key,item.version]),
   Object.entries(s.records||{}).map(([key,item])=>[key,item.version,item.setting_review])]);
  if(indexKey!==signature){indexKey=signature;index=null;snapshots.clear();error='';loading=false;}
  if(!index&&!loading){
   loading=true;const requested=pid,signature=indexKey;
   api('/projects/'+requested+'/setting-history').then(result=>{
    if(pid!==requested||indexKey!==signature)return;
    index=result;loading=false;populate();fetchSnapshot();
   }).catch(exc=>{if(pid===requested&&indexKey===signature){loading=false;error=exc.message;draw();}});
  }
  populate();draw();
 }
 selectBox.onchange=async()=>{
  try{
   safeMove();choice=selectBox.value;error='';remember();
   if(typeof clearPreviewQuote!=='undefined')clearPreviewQuote.click();
   if(typeof editKey!=='undefined'&&editKey){editKey=null;$('editPanel').hidden=true;$('preview').hidden=false;}
   render();await fetchSnapshot();
  }catch(exc){selectBox.value=choice;notice(exc.message);}
 };
 const previousPreview=preview;
 preview=function(){previousPreview();update();};
 const previousRender=render;
 render=function(){previousRender();update();};
 const previousView=setDocumentView;
 setDocumentView=function(view){previousView(view);update();};
})();
