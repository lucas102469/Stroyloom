"""Detect bare reference headings and add only descriptions backed by supplied text."""
import re
import json


def needs_reference_classification(text):
    """Keep ambiguous spatial descriptions on the AI path, not mere mentions inside explicit rules."""
    spatial = r'(?:사무실|거실|주방|아파트|교차로|골목|매장|교실|가게|도서관|제과점|공원)'
    for section in re.split(r'(?m)(?=^[ \t]*#{1,6}[ \t]+)', text):
        if not re.search(spatial, section):
            continue
        # A named physical room still needs classification even if it also lists a rule.
        heading = re.match(r'^[ \t]*#{1,6}[ \t]+([^\n]+)', section)
        if heading and re.search(spatial, heading[1]):
            return True
        if not re.search(r'(?m)^[ \t]*(?:[-*][ \t]*)?(?:규칙|시대|사회|역사|문화|정치|마법|제약|세계관)[ \t]*[:：][ \t]*\S', section):
            return True
    return False


def normalize_character_layout(text):
    """Restore field boundaries when an AI character card is emitted on one line."""
    fields = r'(?:역할|성격|목표|관계|설명|능력|외모|나이|과거|소속|말투|동기|비밀|성별|직업)'
    result = []
    for line in text.splitlines(keepends=True):
        # Only card headings with explicit attributes qualify; ordinary prose stays intact.
        if re.match(r'^[ \t]*#{2,6}[ \t]+', line) and re.search(r'[ \t]'+fields+r'[ \t]*[:：]', line):
            line = re.sub(r'[ \t]+(?=#{2,6}[ \t]+\S)', '\n', line)
            line = re.sub(r'[ \t]+(?='+fields+r'[ \t]*[:：])', '\n', line)
        result.append(line)
    return ''.join(result)


def complete_reference_descriptions(updates, state, request, generate, saved):
    """Repair all missing descriptions in one request, retaining grounded partial success."""
    candidates = [u for u in updates if u.get('kind') in ('characters', 'world', 'places', 'lore')
                  and 'patches' not in u and isinstance(u.get('content'), str)]
    for update in candidates:
        if update['kind'] == 'characters':
            update['content'] = normalize_character_layout(update['content'])
    characters = '\n'.join([*(u['content'] for u in candidates if u['kind'] == 'characters'),
                            *(state[g].get('characters:0', {}).get('text', '') for g in ('official', 'drafts'))])
    pending = []
    for update in candidates:
        if update['kind'] != 'characters':
            update['content'] = normalize_reference_topics(update['content'], characters)
        pending.extend({'kind': update['kind'], 'name': name}
                       for name, _ in empty_reference_cards(update['content']))
    saved('생성한 자료의 설명 확인 중')
    if not pending:
        return
    saved('이름만 있는 설정의 설명 보완 중')
    sources = '\n'.join([request, *(u['content'] for u in candidates),
                         *(record.get('text', '') for g in ('official', 'drafts') for record in state[g].values())])
    completion = generate(
        '설명 누락 보완. 이름만 있고 설명이 없는 항목의 설명만 작성하세요. '
        '다른 카드의 설명을 옮기거나 합치지 마세요. 제공된 자료에서 해당 항목과 직접 연결되는 사실만 쓰고 '
        '새로운 사실이나 관계를 만들지 마세요. description은 400자 이내 한 문단, evidence는 근거 자료의 '
        '연속된 원문 구절 12자 이상을 그대로 인용하세요. 근거가 없으면 해당 항목을 생략하세요. '
        '각 항목의 kind와 name을 유지하세요. JSON {"items":[{"kind":"world",'
        '"name":"항목명","description":"설명","evidence":"원문 근거"}]}만 반환하세요.\n'
        + '설명이 없는 항목:\n' + json.dumps(pending, ensure_ascii=False)
        + '\n근거 자료:\n' + sources, task='reference_descriptions')
    items = completion.get('items', []) if isinstance(completion, dict) else []
    items = items if isinstance(items, list) else []
    for update in candidates:
        matching = [item for item in items if isinstance(item, dict) and (
            item.get('kind') == update['kind'] or (not item.get('kind') and
                len({p['kind'] for p in pending if p['name'] == item.get('name')}) == 1))]
        update['content'] = fill_reference_descriptions(update['content'], matching, sources)
        if update['kind'] != 'characters':
            update['content'] = normalize_reference_topics(update['content'], characters)
    saved('보완한 설명 중간 저장됨')
    unresolved = [name for u in candidates for name, _ in empty_reference_cards(u['content'])]
    if unresolved:
        raise ValueError('설정 설명을 보완하지 못했어요: ' + ', '.join(unresolved)
                         + '. 성공한 중간 결과는 보존했습니다. 다시 시도하면 누락된 항목만 이어서 처리합니다.')

FIELDS = set('설명 배경 규칙 특징 역사 지리 문화 정치 사회 마법 기술 제약 장소 시대 분위기 능력 역할 성격 목표 관계 상태 외모 나이 과거 소속 말투 동기 비밀 특성 신분 비고 종족 성별 직업 키워드 시간 위치 기원 한계 효과 대가'.split())
FIELDS.add('사용 조건')
GENERIC_ATTRIBUTES = set('환경 위험도 기후 지형 규모 인구 자원 용도 기능 재질 등급 희귀도 소유자 무기 장비 약점 강점 비용 조건 지속시간 범위'.split())
FIELDS.update(GENERIC_ATTRIBUTES)
GROUPS = {'세계관', '등장인물', '등장인물 설정', '주요 설정', '설정 자료집', '인물 목록'}
ATTRIBUTE_TOPICS = {'핵심 규칙': '규칙', '기본 규칙': '규칙', '핵심 특징': '특징', '주요 특징': '특징'}
ATTRIBUTE_TOPICS.update({name: name for name in GENERIC_ATTRIBUTES})


def attach_reference_attributes(text, characters=''):
    """Attach generic attribute sections only to an already described named owner."""
    names = {m[1].strip() for m in re.finditer(r'(?m)^#{2,6}\s+([^\n]+)', characters)}
    sections = re.split(r'(?m)^(#{2,6}[ \t]+[^\n]+)\n?', text)
    output = [sections[0]]
    owner = False
    for heading, body in zip(sections[1::2], sections[2::2]):
        title = re.sub(r'^#+\s+', '', heading).replace('**', '').strip()
        if (owner and title in ATTRIBUTE_TOPICS
                and not re.search(r'세계 전체|세계 전역|모든 지역|모든 세계', body)):
            value = re.sub(r'^\s*(?:[-*]\s*)?(?:설명|'+re.escape(ATTRIBUTE_TOPICS[title])+r')[:：]\s*', '', body)
            output.append(ATTRIBUTE_TOPICS[title] + ': ' + value.strip() + '\n')
            continue
        output.extend([heading+'\n', body])
        owner = (title not in names and title not in GROUPS and title not in ATTRIBUTE_TOPICS
                 and bool(re.search(r'(?m)^\s*(?:[-*]\s*)?(?:설명|배경|특징|위치|규칙)[:：]\s*\S', body)))
    return ''.join(output).rstrip()


def normalize_reference_topics(text, characters=''):
    """Use an existing topic label instead of naming its empty wrapper as an entity."""
    names = {m[1].strip() for m in re.finditer(r'(?m)^#{2,6}\s+([^\n]+)', characters)}
    text = attach_reference_attributes(text, characters)
    lines = text.splitlines()
    result = []
    for line in lines:
        pair = re.match(r'^\s*([^:#\n：]{2,40})[:：]\s*(\S.*)$', line.strip().lstrip('-*• ').replace('**', ''))
        if pair and pair[1].strip() in ATTRIBUTE_TOPICS:
            headings = [i for i, value in enumerate(result) if re.match(r'^#{2,6}\s+\S', value)]
            if headings:
                at = headings[-1]
                title = re.sub(r'^#+\s+', '', result[at]).strip()
                if (title not in names and title not in GROUPS
                        and any(re.match(r'\s*(?:설명|배경|특징|위치|규칙)[:：]\s*\S', value) for value in result[at+1:])
                        and not re.search(r'세계 전체|세계 전역|모든 지역|모든 세계', pair[2])):
                    result.append(ATTRIBUTE_TOPICS[pair[1].strip()] + ': ' + pair[2])
                    continue
        if pair and pair[1].strip() not in FIELDS:
            headings = [i for i, value in enumerate(result) if re.match(r'^#{2,6}\s+\S', value)]
            if headings:
                at = headings[-1]
                title = re.sub(r'^#+\s+', '', result[at]).strip()
                if (title not in names and title not in GROUPS and
                        any(re.match(r'\s*(?:설명|배경|특징|위치|규칙)[:：]\s*\S', value) for value in result[at+1:])):
                    result.append(line)
                    continue
            # A topic following an empty or known-character wrapper owns its own text.
            while result and not result[-1].strip():
                result.pop()
            if result and re.fullmatch(r'\s*#{2,6}\s*(?:' + '|'.join(re.escape(n) for n in names) + r')?\s*', result[-1]):
                result.pop()
            result.extend(['## ' + pair[1].strip(), '설명: ' + pair[2]])
        else:
            result.append(line)
    return '\n'.join(result)


def empty_reference_cards(text):
    headings = [match for match in re.finditer(r'(?m)^#{2,6}[ \t]+([^\n]+)(?:\n|$)', text)
                if match[1].strip() not in FIELDS]
    missing = []
    for index, heading in enumerate(headings):
        name = heading[1].strip()
        if name in FIELDS or name in GROUPS:
            continue
        end = headings[index + 1].start() if index + 1 < len(headings) else len(text)
        meaningful = False
        for raw in text[heading.end():end].splitlines():
            line = raw.strip().lstrip('-*• ').replace('**', '')
            if not line:
                continue
            if re.fullmatch(r'#{2,6}\s+.+', line):
                continue
            pair = re.match(r'^([^:：]{1,40})[:：]\s*(.*)$', line)
            if pair:
                if pair[1].strip() not in FIELDS:
                    break  # Another inline topic is not this heading's description.
                line = pair[2].strip()
            if line and not re.fullmatch(r'(?:미정|미확정|없음|미작성|추후 작성)[.。]?', line):
                meaningful = True
                break
        if not meaningful:
            missing.append((name, heading.end()))
    return missing


def fill_reference_descriptions(text, items, sources):
    if not isinstance(items, list):
        return text
    additions = {}
    for item in items:
        if not isinstance(item, dict):
            continue
        name, description, evidence = (item.get(field) for field in ('name', 'description', 'evidence'))
        if (isinstance(name, str) and isinstance(description, str) and isinstance(evidence, str)
                and 1 <= len(description.strip()) <= 400 and '\n' not in description.strip()
                and 12 <= len(evidence.strip()) <= 1200 and evidence.strip() in sources):
            additions.setdefault(name, []).append(description.strip())
    missing = empty_reference_cards(text)
    for name, offset in reversed(missing):
        if sum(other == name for other, _ in missing) != 1 or len(additions.get(name, [])) != 1:
            continue
        prefix = '' if offset and text[offset-1] == '\n' else '\n'
        text = text[:offset] + prefix + '설명: ' + additions[name][0] + '\n' + text[offset:]
    return text
