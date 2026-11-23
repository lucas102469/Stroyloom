"""Current-chapter-only revisions for alternative stories; earlier text is read-only."""
import json
import hashlib
import re
from revision_tools import apply_revision_patches
from workflow import normalize_metadata, episode_findings


def target(state, text, scope=None, operation=None):
    if not state.get('branch_origin'):
        return None
    if operation:
        return int(operation['key'].split(':')[1]) if operation.get('type') == 'resolve_continuity' else None
    if scope:
        return int(scope['key'].split(':')[1]) if scope['key'].startswith('episode:') else None
    if re.search(r'이름.{0,20}(?:바꿔|변경)|기획|장르|분량|플롯|제목',text):
        return None
    strong = re.search(r'수정|고쳐|바꿔|추가|넣어|반영|삭제|없애|재작성',text)
    if re.search(r'어때|할까|가능|수정해도\s*(?:돼|되)',text):
        return None
    if not strong and re.search(r'설명|요약|분석|알려|말해|보여|왜|무슨\s*뜻',text):
        return None
    if not strong and re.search(r'(?:이어|다음|계속|새로운|새로|새\s*회차).*(?:써|집필|작성)',text):
        return None
    match = re.match(r'^\s*(\d+)\s*(?:화|회차)',text)
    reference_only = match and re.match(r'\s*(?:와|과|처럼|기준|이후)',text[match.end():])
    number = int(match[1]) if match and not reference_only else state.get('episode') if state.get('selected') == 'episode' else None
    if type(number) is not int or f'episode:{number}' not in {**state.get('official',{}),**state.get('drafts',{})}:
        return None
    return number


def revise(state, number, instruction, scope, context, generate, minimum, maximum, filter_issues, saved=None, checkpoint=None):
    if number < state['branch_origin']['episode']:
        return {'reply':'분기 이전 회차는 유지할게요. 현재 수정할 회차 안에서 어떻게 연결할지 알려주세요.'}
    key = f'episode:{number}'
    source = state['drafts'].get(key) or state['official'].get(key)
    if not source:
        raise ValueError('수정할 회차를 찾을 수 없어요.')
    original = source['text']
    issues = state.get('records',{}).get(str(number),{}).get('continuity_issues',[])
    basis = hashlib.sha256(json.dumps([original,instruction,scope,context],ensure_ascii=False,sort_keys=True).encode()).hexdigest()
    cached = saved.get('result') if isinstance(saved,dict) and saved.get('basis') == basis else None
    result = cached if cached is not None else generate(
        'BRANCH_CURRENT_CHAPTER_EDIT\n'
        f'다른 줄거리의 기존 {number}화만 수정하세요. 이전 회차와 확정 설정은 읽기 전용 기준입니다. '
        '명확한 수정 요청이나 직전 수정 질문에 대한 답변이 아닌 단순 대화라면 patches=[]로 두고 reply로 답하세요. '
        '사용자가 요청한 변경을 유지하면서, 그 변경이 성립하는 데 필요한 현재 회차의 원인·행동·대화·반응·장면 연결만 함께 고치세요. '
        '관련 없는 문장과 사건·결말은 유지하고 회차 전체를 새로 쓰려 하지 마세요. '
        '앞 회차와 달라졌다는 이유만으로 모순이라고 단정하지 마세요. 현재 회차에서 새로 얻은 물건이나 발생한 변화는 자연스러운 과정이 있으면 허용됩니다. '
        '이전 회차의 확정 사실을 바꿔야만 성립하거나 사용자의 의도가 불명확하면 needs_clarification=true, patches=[]로 두고 '
        'reply에 해결할 수 없는 이유와 현재 회차에서 확인할 질문을 쓰세요. 이전 회차를 고치자고 제안하거나 동의를 요청하지 마세요. '
        '부활·새 능력·숨겨진 과거·반전을 임의로 만들어 충돌을 덮지 마세요. '
        '변경은 현재 원고에서 정확히 한 번 나오는 old와 교체할 new의 작은 patches로 반환하세요. 다른 회차나 설정 수정안은 반환하지 마세요. '
        'JSON {"needs_clarification":bool,"reply":"설명 또는 질문","patches":[{"old":"원문","new":"교체문"}]}만 반환하세요.\n'
        + context + '\n' + json.dumps({'대상 회차':number,'사용자 요청':instruction,'선택 구절':scope.get('quote') if scope else None,
                                          '확인된 충돌':issues,'최근 대화':state.get('messages',[])[-6:],'현재 원고':original},ensure_ascii=False),task='branch_chapter_edit')
    if (not isinstance(result,dict) or type(result.get('needs_clarification')) is not bool
            or not isinstance(result.get('reply'),str) or not result['reply'].strip() or not isinstance(result.get('patches'),list)):
        raise ValueError('현재 회차의 수정 결과를 확인하지 못했어요. 기존 원고는 유지했어요.')
    if result['needs_clarification']:
        return {'reply':result['reply']}
    if any(field in result for field in ('updates','episodes','earlier_changes')):
        raise ValueError('다른 자료를 바꾸는 수정안이 포함되어 반영하지 않았어요.')
    patches = result['patches']
    if len(patches) > 30 or any(not isinstance(patch,dict) or not isinstance(patch.get('old'),str)
                              or not isinstance(patch.get('new'),str) for patch in patches):
        raise ValueError('수정 구절의 형식을 확인하지 못했어요.')
    patches = [patch for patch in patches if patch['old'] != patch['new']]
    if not patches:
        return {'reply':result['reply']}
    if (len(original) >= 600 and sum(len(patch['old']) for patch in patches) > len(original)*.6
            and not re.search(r'전체|재작성|다시\s*(?:써|작성)',instruction)):
        return {'reply':'제안된 수정 범위가 요청한 장면보다 너무 넓어 원고를 유지했어요. 바꿀 장면과 연결에 꼭 필요한 내용을 더 구체적으로 알려주세요.'}
    changed = apply_revision_patches(original,patches)
    if minimum <= len(original) <= maximum and not minimum <= len(changed) <= maximum:
        return {'reply':'요청한 장면을 반영하면 현재 분량 범위를 벗어나요. 다른 내용을 임의로 늘리거나 줄이지 않았어요. 수정 범위를 조금 더 구체적으로 알려주세요.'}
    if checkpoint:
        checkpoint({'basis':basis,'result':result})
    audit = generate(
        'BRANCH_CURRENT_CHAPTER_AUDIT\n'
        '수정한 현재 회차 전체를 이전 회차·확정 설정과 대조하세요. 앞 회차는 수정할 수 없습니다. '
        '요청한 변화가 실제로 반영됐는지, 그 원인·소지품 획득·인물별 지식·행동·반응·장면 연결이 자연스러운지 확인하세요. '
        '새 사건이나 물건이 등장했다는 사실만으로 충돌 처리하지 말고, 현재 회차에 합리적인 과정이 있는지 확인하세요. '
        '요청과 연결에 무관한 내용을 바꾸거나, 부활·능력·과거를 임의로 창작해 기존 사실을 덮었으면 issues에 보고하세요. '
        '실제 모순만 근거와 함께 issues에 쓰고 없으면 []로 쓰세요. '
        'summary와 facts는 이 수정 원고의 실제 사건만 기록하세요. findings에는 기존 자료에 없는 중요 설정만 넣고 '
        'kind, name, role, field, fact, quote, status, reason을 쓰세요. 중요하지 않은 일시적 행동과 중복 사실은 제외하세요. '
        'quote는 원문에서 연속된 12~600자를 그대로 인용하고 fact는 500자 이내로 쓰세요. 실명이 없으면 원문 호칭을 유지하세요. '
        '확인할 이유가 없으면 status=clear, reason은 빈 문자열입니다. 없으면 findings=[]입니다.\n'
        + context + '\n' + json.dumps({'대상 회차':number,'사용자 요청':instruction,'수정 전':original,'수정 구절':patches,'검토 원고':changed},ensure_ascii=False),task='episode_audit')
    if (not isinstance(audit,dict) or not isinstance(audit.get('issues'),list)
            or any(not isinstance(item,str) or not item.strip() for item in audit['issues'])):
        raise ValueError('수정 원고의 연결 검토를 완료하지 못했어요. 기존 원고는 유지했어요.')
    remaining = filter_issues(audit['issues'])
    if remaining:
        return {'reply':'현재 회차 안에서 다음 연결 문제를 해결하지 못해 수정안을 반영하지 않았어요.\n'
                +'\n'.join(remaining[:5])+'\n앞 회차는 유지할게요. 현재 회차에서 의도한 상황을 더 알려주세요.'}
    if not all(isinstance(audit.get(field),str) and audit[field].strip() for field in ('summary','facts')) or not isinstance(audit.get('findings'),list):
        raise ValueError('수정 원고의 요약과 설정 확인을 완료하지 못했어요.')
    individual = [episode_findings([item],changed) for item in audit['findings']]
    if len(individual) > 30 or any(not entries or not entries[0].get('quote') for entries in individual):
        raise ValueError('수정한 원고에서 설정의 근거 구절을 확인하지 못했어요.')
    content = {**normalize_metadata(audit),'text':changed,'metadata_stale':False,'findings':episode_findings(audit['findings'],changed),
               'impact':'요청 장면과 현재 회차의 필요한 연결 부분을 수정하고 일관성을 확인했어요.'}
    if source.get('title'):
        content['title'] = source['title']
    return {'reply':f'{number}화의 요청 장면과 필요한 연결 부분만 수정한 안을 만들었어요. 이전 회차는 유지했어요. 내용을 확인하고 수락해 주세요.',
            'content':content,'key':key}
