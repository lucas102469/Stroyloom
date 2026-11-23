'use strict';
const documentPlain=value=>String(value||'').replace(/\*\*|__/g,'').trim();
const documentCells=line=>line.trim().replace(/^\|/,'').replace(/\|$/,'').split('|').map(documentPlain);
const documentSeparator=line=>/^\s*\|?\s*:?-{2,}/.test(line||'');
const plotStageSource='시작|중간|결말|도입부?|전개|위기|절정|마무리|\\d+막';
const plotStageRow=new RegExp('^('+plotStageSource+')\\s*[:：]\\s*(.+)$');
const episodeNoteHeading=/^(?:제\s*)?(\d+(?:\s*[~～-]\s*\d+)?)\s*[화회]\s*(?:[·.:：-]\s*|\s+(?=주요\s*사건|사건|줄거리|구성|계획|요약)|$)(.*)$/;
function splitPlotStages(line){
 const boundary=new RegExp('(?:^|\\s+)(?:[-*+•]\\s+|\\d+[.)]\\s+)?(?=(?:'+plotStageSource+')\\s*[:：])','g');
 return documentPlain(line).replace(boundary,'\n').split('\n')
  .map(row=>row.trim().replace(/[,，]\s*$/,'')).join('\n').trim();
}
function plotContainsPlanningOnly(text){
 return /(?:제목|로그라인|장르|시놉시스)\s*[:：]/.test(text)&&
  !/(?:전체\s*(?:플롯|아웃라인|줄거리)|회차\s*구성|회차별\s*(?:계획|구성))|(?:시작|중간|결말|도입부?|전개|\d+\s*[화회])\s*[:：]/.test(text);
}
function parsePlotDocument(text) {
 const groups={overall:[],episodes:[],notes:[]};let section='notes';
 const lines=text.split('\n').flatMap(raw=>{
  if(raw.includes('|'))return [raw];
  return raw.replace(/[ \t]+(?=#{1,6}[ \t]+(?:전체\s*(?:플롯|줄거리|아웃라인)|회차\s*구성|회차별\s*(?:계획|구성)))/g,'\n')
   .replace(/[,，]\s*(?=(?:전체\s*(?:플롯|줄거리|아웃라인)|회차\s*구성|회차별\s*(?:계획|구성))\s*[:：])/g,'\n')
   .replace(/^(\s*(?:#{1,6}\s+)?(?:전체\s*(?:플롯|줄거리|아웃라인)|회차\s*구성|회차별\s*(?:계획|구성)))(?:\s*[:：]\s*|[ \t]+(?=(?:시작|도입부?|중간|전개|결말|\d+\s*화)\s*[:：]))/gm,'$1\n')
   .split('\n');
 });
 for(const raw of lines){
  const line=documentPlain(raw.replace(/^\s*#{1,6}\s+/,''));
  if(/^(전체\s*(플롯|줄거리|아웃라인)|전체적인\s*흐름)(?:\s*[(:（].*)?$/.test(line)){section='overall';continue;}
  if(/^(회차\s*구성|회차별\s*(계획|구성)|회차\s*계획)(?:\s*[(:（].*)?$/.test(line)){section='episodes';continue;}
  if(episodeNoteHeading.test(line.replace(/^[-*+•]\s+/,'')))section='episodes';
  if(section==='notes'&&!line.includes('|')){
   const stages=splitPlotStages(line);
   if(stages.split('\n').every(row=>plotStageRow.test(row))){
    groups.overall.push(stages);continue;
   }
  }
  groups[section].push(raw);
 }
 const outline=groups.overall.map(line=>line.includes('|')?line:splitPlotStages(line)).join('\n');
 const episodes=groups.episodes.join('\n').replace(
  /(?:^|\s+)\d+[.)]\s+(?=(?:제\s*)?\d+(?:\s*[~～-]\s*\d+)?\s*[화회]\s*[:：·])/g,'\n')
  .split('\n').flatMap(line=>line.includes('|')?[line]:line.split(/[,，]\s*(?=(?:제\s*)?\d+\s*[화회]\s*[:：·])/)).join('\n');
 return {overall:outline.trim(),episodes:episodes.trim(),notes:groups.notes.join('\n').trim()};
}
const genericSettingAttributes = new Set('환경 위험도 기후 지형 규모 인구 자원 용도 기능 재질 등급 희귀도 소유자 무기 장비 약점 강점 비용 조건 지속시간 범위'.split(' '));
function normalizeSettingAttributeSections(text){
 let owner=false;
 return text.split(/(?=^#{2,6}\s+)/m).map(section=>{
  const match=section.match(/^#{2,6}\s+([^\n]+)\n([\s\S]*)$/);
  if(!match)return section;
  const [,name,body]=match;
  if(owner&&genericSettingAttributes.has(name.trim())&&!/세계 전체|세계 전역|모든 지역|모든 세계/.test(body)){
   return name.trim()+': '+body.replace(/^\s*(?:설명|내용)[:：]\s*/,'').trim()+'\n';
  }
  owner=!genericSettingAttributes.has(name.trim())&&/^\s*(?:설명|배경|특징|위치|규칙)[:：]\s*\S/m.test(body);
  return section;
 }).join('');
}
function parseSettingRecords(text) {
 text=normalizeSettingAttributeSections(text);
 const normalizeField=label=>label==='내용'?'설명':label;
 text=text.split('\n').map(line=>{
  const match=line.match(/^((?:#{1,6}\s+)?[^:：|]+?)\s+(?=(?:역할|성격|목표|관계|설명|내용)\s*[:：])/);
  if(!match||!(/^(?:#{1,6}\s+|(?:주인공|조연)\s*[(（])/.test(line)))return line;
  const name=match[1].replace(/^#{1,6}\s+/,'');
  return '## '+name+'\n'+line.slice(match[0].length).replace(/[ \t]+(?=(?:역할|성격|목표|관계|설명|내용)\s*[:：])/g,'\n');
 }).join('\n');
 const records=[];let current=null,activeField=null;
 const hasExplicitTitles=/^\s*#{1,6}\s+\S/m.test(text);
 const fields=new Set(['성격','목표','관계','설명','규칙','역할','배경','상태','특징','능력','외모','나이','과거','소속','말투','동기','비밀','특성','신분','비고','종족','성별','직업','키워드','시대','시간','장소','위치','지리','문화','역사','정치','사회','마법','기술','기원','제약','한계','효과','사용 조건','분위기']);
 fields.add('효과');
 fields.add('대가');
 fields.add('무기');
 for(const field of genericSettingAttributes)fields.add(field);
 const groups=/^(주요\s*)?(등장인물(?:\s*설정)?|인물\s*설정|인물\s*목록|세계관|주요\s*설정|설정\s*자료집)$|^(확정|제안)\s*설정/;
 const start=name=>{current={name:documentPlain(name),fields:{},notes:[]};records.push(current);activeField=null;};
 const ensure=()=>{if(!current)start('이름 미정');};
 const append=(label,value)=>{ensure();current.fields[label]=(current.fields[label]?current.fields[label]+'\n':'')+value;activeField=label;};
 const lines=text.replace(/([.!?])\s+(?=[가-힣A-Za-z]{2,12}:)/g,'$1\n').split('\n');
 for(let i=0;i<lines.length;i++){
  const raw=lines[i],line=documentPlain(raw).replace(/^\s*[-*+]\s+/,'');if(!line||documentSeparator(line))continue;
  if(line.includes('|')&&documentSeparator(lines[i+1])){
   const headers=documentCells(line).map(normalizeField);i++;
   while(i+1<lines.length&&lines[i+1].trim().startsWith('|')){
    const cells=documentCells(lines[++i]);const nameAt=headers.findIndex(h=>['이름','인물','인물명','등장인물'].includes(h));
    if(nameAt>=0){start(cells[nameAt]||'이름 미정');headers.forEach((h,n)=>{if(n!==nameAt&&cells[n]){if(fields.has(h))append(h,cells[n]);else current.notes.push(h+': '+cells[n]);}});}
    else if(fields.has(normalizeField(cells[0])))append(normalizeField(cells[0]),cells.slice(1).join(' | '));
    else{ensure();current.notes.push(cells.join(' · '));}
   }continue;
  }
  const heading=line.match(/^#{1,6}\s+(.+?)(?:\s+#+)?$/);const labelLine=documentPlain(heading?heading[1]:line);
  if(groups.test(labelLine.replace(/^\[|\]$/g,""))){activeField=null;continue;}
  const pair=labelLine.match(/^([^:：|]{1,35})\s*[:：]\s*(.*)$/);
  if(pair){const label=normalizeField(documentPlain(pair[1])),value=documentPlain(pair[2]);
   if(fields.has(label)){append(label,value);continue;}
   if(['이름','인물명','인물'].includes(label)){if(!current||current.name!==value)start(value||'이름 미정');continue;}
   if(label==='주인공'){
    const parts=value.match(/^([^.!?\n]+)[.]\s*(.*)$/);
    const candidate=parts?.[1]??value;
    const descriptive=candidate.length>24||candidate.split(/\s+/).length>4;
    start(descriptive||!candidate?'이름 미정':candidate);
    append('역할','주인공');
    const description=descriptive?value:parts?.[2];
    if(description)append('설명',description);
    continue;
   }
   if(groups.test(label)){if(value){ensure();current.notes.push(label+': '+value);}continue;}
   if(current&&hasExplicitTitles&&!heading){append(label,value);continue;}
   // Legacy heading-free documents may still name entities with name: description.
   if(heading||!current||/^[가-힣]{2,4}$/.test(label)||/^(미상의|이름\s*없는|의문의)\s+/.test(label)){start(label);if(value)current.notes.push(value);}
   else{ensure();current.notes.push(label+': '+value);}continue;
  }
  if(fields.has(normalizeField(labelLine))){ensure();activeField=normalizeField(labelLine);continue;}
  if(groups.test(labelLine)){activeField=null;continue;}
  if(heading||(/^\s*\*\*.+\*\*\s*$/.test(raw)&&!fields.has(labelLine))){start(labelLine);continue;}
  const numbered=line.match(/^\d+[.)]\s+([^.!?:：]{1,100})$/);if(numbered){start(numbered[1]);continue;}
  ensure();if(activeField)append(activeField,line);else current.notes.push(line);
 }
 return records;
}
function parsePlanDocument(text){
 const result={fields:{},synopsis:'',notes:'',plot:'',title:''};let section='notes',field=null;
 const aliases={'작품 제목':'제목','가제':'제목','총 회차수':'총 회차','회차당 목표 글자수':'회차 목표','목표 글자수':'회차 목표','회차 목표 글자수':'회차 목표'};
 const known=new Set(['로그라인','장르','총 회차','회차 목표','제목',...Object.keys(aliases)]);
 // Recover field boundaries when an older response put several sections on one line.
 const inlineField=new RegExp('([^\\S\\r\\n]+)(?=(?:\\*\\*)?(?:'+[...known].join('|')+')(?:\\*\\*)?\\s*[:：])','g');
 text=text.split('\n').map(line=>line.trimStart().startsWith('|')?line:line
  .replace(inlineField,'\n')
  .replace(/[^\S\r\n]+(?=#{1,6}\s+(?:전체\s*(?:플롯|아웃라인)|회차\s*구성|시놉시스))/g,'\n')
  .replace(/^(#{1,6}\s+(?:전체\s*(?:플롯|아웃라인)|회차\s*구성|시놉시스))[ \t]+(?=\S)/gm,'$1\n')
 ).join('\n');
 for(const raw of text.split('\n')){
  const line=documentPlain(raw).replace(/^[-*+]\s+/,'');if(!line||documentSeparator(line))continue;
  const heading=line.match(/^#{1,6}\s+(.+?)(?:\s+#+)?$/),label=heading?heading[1]:line;
  if(/^(시놉시스|줄거리|작품\s*소개)(?:\s*[:：].*)?$/.test(label)){section='synopsis';field=null;const inline=label.match(/[:：]\s*(.+)$/);if(inline)result.synopsis+=inline[1];continue;}
  if(/^(전체\s*(플롯|아웃라인|줄거리)|회차\s*구성|회차별\s*계획)/.test(label)){section='plot';field=null;result.plot+=(result.plot?'\n':'')+(heading?raw:'## '+label);continue;}
  const pair=label.match(/^([^:：]{1,25})\s*[:：]\s*(.*)$/),cells=line.startsWith('|')?documentCells(line):[];
  const key=pair?.[1]?.trim()||cells[0];if(known.has(key)){const normalized=aliases[key]||key;const value=(pair?pair[2]:cells.slice(1).join(' | ')).trim();if(!value){field=normalized;continue;}if(normalized==='제목')result.title=value;else result.fields[normalized]=value;field=null;continue;}
  if(heading&&known.has(label)){field=aliases[label]||label;continue;}
  if(field){if(field==='제목')result.title+=(result.title?' ':'')+line;else result.fields[field]=(result.fields[field]?result.fields[field]+' ':'')+line;continue;}
  if(heading&&/^기획안$/.test(label))continue;
  result[section]+=(result[section]?'\n':'')+raw;
 }
 result.title=result.title.replace(/(?:\s*[(（]\s*가제\s*[)）])+\s*$/,'').trim();
 return result;
}
function parseEpisodeNotes(text){
 const rows=[];let current=null;
 for(const raw of text.split('\n')){
  const line=documentPlain(raw).replace(/^\s*#{1,6}\s+/,'').replace(/^[-*+]\s+/,'');
  const m=line.match(episodeNoteHeading);
  if(m){
   const description=m[2].trim().replace(/^(?:주요\s*사건|사건|줄거리|구성|계획|요약)(?:\s*[:：]\s*|$)/,'');
   current={episode:m[1],title:'',description};
   rows.push(current);
  }
  else if(current&&line)current.description+=(current.description?'\n':'')+line;
 }
 return rows;
}
parseSettingRecords.normalizeAttributes=normalizeSettingAttributeSections;
parseSettingRecords.attributeNames=genericSettingAttributes;
if(typeof module!=='undefined')module.exports={parsePlotDocument,parseSettingRecords,parsePlanDocument,parseEpisodeNotes};
