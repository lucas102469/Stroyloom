"""Experimental bounded paragraph edits; no model calls or automatic integration."""
import json
import math
import re
from workflow import normalize_manuscript_breaks
from revision_tools import replays_existing_manuscript


def plan_length_edits(body, minimum, maximum):
    target=(minimum+maximum)//2
    delta=target-len(body)
    if minimum<=len(body)<=maximum:
        return []
    paragraphs=[(m.start(),m.end()) for m in re.finditer(r'\S(?:.*?\S)?(?=\n\n|$)',body,re.S)]
    eligible=[s for s in paragraphs[1:-1] if 80<=s[1]-s[0]<=1000]
    limit=12 if delta<0 else 8
    count=min(len(eligible),max(2,min(limit,math.ceil(abs(delta)/300))))
    if count<2:
        return []
    selected=[eligible[i*len(eligible)//count] for i in range(count)]
    while delta<0 and sum((end-start)//2 for start,end in selected)<-delta:
        count+=1
        if count>min(limit,len(eligible)):
            return []
        selected=[eligible[i*len(eligible)//count] for i in range(count)]
    lengths=[end-start for start,end in selected]
    weights=[length//2 for length in lengths] if delta<0 else lengths
    # Allocate changes proportionally without rounding drift.
    cumulative=0
    windows=[]
    for i,(start,end) in enumerate(selected):
        before=cumulative;cumulative+=weights[i]
        share=round(delta*cumulative/sum(weights))-round(delta*before/sum(weights))
        wanted=end-start+share
        if wanted<60:
            return []
        windows.append({'id':i,'start':start,'end':end,'target_chars':wanted})
    return windows


def length_edit_prompt(body, windows, minimum, maximum, context, request=''):
    if not windows:
        raise ValueError('안전하게 보정할 중간 구간이 부족합니다.')
    operation='구체화' if len(body)<minimum else '압축'
    chunks=[];offset=0
    for item in windows:
        chunks.append({'fixed':body[offset:item['start']]})
        chunks.append({'id':item['id'],'text':body[item['start']:item['end']],
                       'target_chars':item['target_chars']})
        offset=item['end']
    chunks.append({'fixed':body[offset:]})
    return (f'이 원고는 현재 공백 포함 {len(body)}자입니다. 최종 {minimum}~{maximum}자를 목표로 '
        f'id가 있는 구간들을 한 번의 응답에서 {operation}하세요. 각 target_chars는 수정 후 그 구간의 실제 목표 글자 수입니다. '
        'fixed 부분은 앱이 그대로 보존하므로 반환하지 마세요. 각 구간의 진행 중인 행동·대화·반응을 조정하고 '
        '원래 사건·정보·핵심 대사·시점과 앞뒤 연결을 보존하세요. 이미 끝난 행동의 반복이나 새 사건·설정, '
        '다음 회차 사건을 추가하지 마세요. 중요한 내용 삭제나 같은 감정의 반복으로 분량만 맞추지 마세요. '
        '구간마다 이야기를 다시 시작하거나 마무리하지 말고 문단·대사 줄바꿈을 유지하세요. '
        'JSON {"edits":[{"id":0,"text":"수정 구간 본문"}]}만 반환하세요. 모든 id를 정확히 한 번 반환하세요.\n'
        '확정 회차 범위:\n'+context+'\n작가의 요청:\n'+request+'\n원고와 수정 구간:\n'
        +json.dumps(chunks,ensure_ascii=False))


def apply_length_edits(body, windows, response):
    edits=response.get('edits') if isinstance(response,dict) else None
    if not isinstance(edits,list) or len(edits)!=len(windows) or not windows:
        raise ValueError('분량 보정 구간이 누락됐습니다.')
    by_id={}
    for edit in edits:
        if (not isinstance(edit,dict) or type(edit.get('id')) is not int
                or edit['id'] in by_id or not isinstance(edit.get('text'),str) or not edit['text'].strip()):
            raise ValueError('분량 보정 구간 형식이 올바르지 않습니다.')
        replacement=normalize_manuscript_breaks(edit['text']).strip()
        if replays_existing_manuscript(body,replacement,allow_excerpt=True):
            raise ValueError('수정 구간 대신 전체 원고가 반환됐습니다.')
        by_id[edit['id']]=replacement
    if set(by_id)!={item['id'] for item in windows}:
        raise ValueError('분량 보정 구간 ID가 다릅니다.')
    result=body
    for item in reversed(windows):
        result=result[:item['start']]+by_id[item['id']]+result[item['end']:]
    return result


def length_edit_schema(count):
    return {'type':'object','properties':{'edits':{'type':'array','minItems':count,'maxItems':count,
        'items':{'type':'object','properties':{'id':{'type':'integer'},'text':{'type':'string'}},
                 'required':['id','text']}}},'required':['edits']}
