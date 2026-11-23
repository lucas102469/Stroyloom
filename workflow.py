"""Pure workflow helpers shared by HTTP endpoints and offline tests."""
import difflib
import json
import re
import hashlib
from character_identity import explicit_identity, source_label, confirmed_character_aliases

KINDS = ('plan', 'characters', 'world', 'places', 'lore', 'plot', 'episode', 'settings', 'memory', 'guidelines')
DEFAULT_SETTINGS = {'target_chars': 4000, 'total_episodes': 30}


def branch_pending_start(state):
    origin = state.get('branch_origin') or {}
    number = origin.get('episode')
    if type(number) is not int or not isinstance(origin.get('body'), str):
        return None
    official = state.get('official', {}).get(f'episode:{number}')
    if not official or hashlib.sha256(official['text'].encode()).hexdigest() == origin['body']:
        return number
    return None


def normalize_metadata(value):
    """Accept common structured forms without inventing story facts."""
    if not isinstance(value, dict):
        raise ValueError('AI 요약 응답이 객체 형식이 아닙니다. 본문은 유지됩니다.')
    source = value
    for key in ('metadata', 'meta'):
        if isinstance(value.get(key), dict):
            source = value[key]
            break
    summary = source.get('summary', source.get('요약'))
    facts = source.get('facts', source.get('사실 기록', source.get('사실')))
    if not isinstance(summary, str) or not summary.strip():
        raise ValueError('AI 응답에 회차 요약이 누락되어 반영하지 않았습니다. 본문은 유지됩니다.')
    if isinstance(facts, list):
        facts = '\n'.join(x if isinstance(x, str) else json.dumps(x, ensure_ascii=False) for x in facts)
    elif isinstance(facts, dict):
        facts = '\n'.join(f'{k}: {json.dumps(v, ensure_ascii=False) if not isinstance(v, str) else v}' for k, v in facts.items())
    if not isinstance(facts, str):
        raise ValueError('AI 응답에 사실 기록 항목이 누락되어 반영하지 않았습니다. 본문은 유지됩니다.')
    return {'summary': summary.strip(), 'facts': facts.strip() or '추가로 추출된 사실 없음'}


REFERENCE_DOCUMENTS = ('characters', 'world', 'places', 'lore', 'plot')
FINDING_FIELDS = {
    'characters': ('성격', '목표', '관계', '능력'),
    'world': ('배경', '규칙', '제약'),
    'places': ('위치', '특징'),
    'lore': ('효과', '사용 조건', '대가', '규칙'),
}


def is_concrete_place_name(name):
    """Recognize common physical locations without moving broad regions or societies."""
    return bool(isinstance(name, str) and re.fullmatch(
        r'(?:.{1,45}\s)?(?:교차로|사거리|골목|아파트|제과점|도서관|학교|공원|병원|등대|정거장|광장|카페)',
        name.strip(),
    ))


def reference_body(text):
    """Ignore cosmetic Markdown and whitespace in reference document comparisons."""
    lines = []
    for line in text.splitlines():
        line = re.sub(r'^\s*(?:#{1,6}|[-*+•])\s+', '', line)
        line = re.sub(r'\*\*|__', '', line)
        line = re.sub(r'\s*[:：]\s*', ':', line)
        if line.strip():
            lines.append(' '.join(line.split()))
    return '\n'.join(lines)


def linked_entity_renames(before, after, *, characters=False):
    def cards(text):
        parts = re.split(r'(?m)^##[ \t]+([^\n]+)\n', text)
        return [(name.strip(), body.strip()) for name, body in zip(parts[1::2], parts[2::2])]

    old, new = cards(before), cards(after)
    old_names = {name for name, _ in old}
    new_names = {name for name, _ in new}
    if len(old_names) != len(old) or len(new_names) != len(new):
        return {}
    def same_card(body, revised):
        if body and body == revised:
            return True
        lines = set(body.splitlines())
        updated = set(revised.splitlines())
        if min(len(lines), len(updated)) >= 2 and (lines <= updated or updated <= lines):
            return True
        if not characters:
            return False
        # A name and another field can change in the same edit. A shared role
        # alone is not evidence that two cards describe the same person.
        shared_details = {line for line in lines & updated if not re.match(r'^역할\s*[:：]', line)}
        return len(shared_details) >= 2 and len(lines & updated) * 2 > max(len(lines), len(updated))

    removed = [(name, body) for name, body in old if name not in new_names]
    added = [(name, body) for name, body in new if name not in old_names]
    candidates = {name: [replacement for replacement, revised in added if same_card(body, revised)]
                  for name, body in removed}
    renames = {name: matches[0] for name, matches in candidates.items()
               if len(matches) == 1 and sum(matches[0] in others for others in candidates.values()) == 1}
    if characters:
        # Preserve the common surname-free reference only when it names one character.
        all_names = old_names | new_names
        for old_name, new_name in list(renames.items()):
            if not (re.fullmatch(r'[가-힣]{3}', old_name) and re.fullmatch(r'[가-힣]{2,}', new_name)):
                continue
            short = old_name[1:]
            if short not in all_names and not any(name.endswith(short) for name in all_names - {old_name}):
                renames[short] = new_name[1:] if old_name[0] == new_name[0] else new_name
    return renames


def replace_linked_names(text, renames, *, preserve_new=False):
    if not renames or not text:
        return text
    names = set(renames)
    if preserve_new:
        names.update(renames.values())
    names = '|'.join(re.escape(name) for name in sorted(names, key=len, reverse=True))
    particles = '에게서는|에게서|에게는|에서|에게|으로|께서|부터|까지|처럼|보다|은|는|이|가|을|를|과|와|로|의|에|도|만|께'
    pairs = {'은': '은는', '는': '은는', '이': '이가', '가': '이가',
             '을': '을를', '를': '을를', '과': '과와', '와': '과와'}

    def replace(match):
        name, particle = match.groups()
        if name not in renames:
            return match[0]
        replacement = renames[name]
        last = ord(replacement[-1])
        if particle and 0xAC00 <= last <= 0xD7A3:
            ending = (last - 0xAC00) % 28
            if particle in pairs:
                particle = pairs[particle][int(ending == 0)]
            elif particle in ('으로', '로'):
                particle = '으로' if ending not in (0, 8) else '로'
        return replacement + (particle or '')

    return re.sub(rf'(?<!\w)({names})({particles})?(?!\w)', replace, text)


def name_only_changes(changes, renames):
    """Only bypass story review when every change is explained by exact renames."""
    return bool(changes and renames) and all(
        key.split(':')[0] in ('plan', *REFERENCE_DOCUMENTS)
        and isinstance(change.get('before'), str) and isinstance(change.get('after'), str)
        and reference_body(replace_linked_names(change['before'], renames, preserve_new=True))
        == reference_body(replace_linked_names(change['after'], renames, preserve_new=True))
        for key, change in changes.items()
    )


def normalize_plan_heading(text):
    """Recognize an unambiguous synopsis paragraph without regenerating its content."""
    if (re.search(r'(?m)^\s*(?:#{1,6}\s*)?시놉시스(?:[ \t]*[:：]|[ \t]*$)', text)
            or not all(re.search(pattern, text) for pattern in (
                r'(?m)^제목\s*[:：]\s*\S', r'(?m)^로그라인\s*[:：]\s*\S', r'(?m)^장르\s*[:：]\s*\S'))):
        return text
    headings = list(re.finditer(r'(?m)^#{1,6}[ \t]+([^\n]+)', text))
    if len(headings) != 1:
        return text
    heading = headings[0]
    if re.search(r'플롯|아웃라인|회차|구성|장면|등장인물|세계관|설정|목차', heading[1]):
        return text
    body = text[heading.end():].strip()
    if len(body) < 40 or re.search(r'(?m)^\s*(?:[-*|]|\d+\s*[화회]\s*[:：]|(?:시작|중간|결말)\s*[:：])', body):
        return text
    return text[:heading.start()] + '## 시놉시스' + text[heading.end():]


def is_plan_without_plot(text):
    """Identify planning fields sent in place of an outline or episode plan."""
    return (bool(re.search(r'(?:제목|로그라인|장르|시놉시스)\s*[:：]', text))
            and not re.search(
                r'(?:전체\s*(?:플롯|아웃라인|줄거리)|회차\s*구성|회차별\s*(?:계획|구성))'
                r'|(?:시작|중간|결말|도입부?|전개|\d+\s*[화회])\s*[:：]', text))


def classify_document_updates(value):
    """Keep explicitly labelled plot material out of the planning document."""
    updates = value.get('updates', [])
    plot = next((u for u in updates if u.get('kind') == 'plot'), None)
    places = next((u for u in updates if u.get('kind') == 'places'), None)
    for update in list(updates):
        text = update.get('content', '')
        if update.get('kind') == 'world' and isinstance(text, str):
            sections = re.split(r'(?m)(?=^#{1,6}[ \t]+)', text)
            kept, moved = [], []
            for section in sections:
                heading = re.match(r'^#{1,6}[ \t]+([^\r\n]+)', section)
                (moved if heading and is_concrete_place_name(heading[1]) else kept).append(section)
            if moved:
                if places is None:
                    places = {'kind': 'places', 'content': ''}
                    updates.append(places)
                existing = places.get('content', '')
                existing = existing.strip() if isinstance(existing, str) else ''
                additions = [section.strip() for section in moved if section.strip() not in existing]
                places['content'] = '\n\n'.join(filter(None, [existing, *additions]))
                update['content'] = ''.join(kept).strip()
                if not update['content']:
                    updates.remove(update)
                else:
                    update.pop('summary', None)
            continue
        if update.get('kind') != 'plan' or not isinstance(text, str):
            continue
        plot_only = re.search(r'^\s*#{1,6}\s*(전체\s*(플롯|아웃라인)|회차\s*구성)', text, re.M)
        plan_fields = re.search(r'(로그라인|시놉시스|장르\s*[:：])', text)
        if plot_only and not plan_fields:
            if plot is None:
                update['kind'] = 'plot'
                plot = update
            else:
                plot['content'] += '\n\n' + text
                updates.remove(update)
            value['reply'] += '\n플롯으로 작성된 내용은 플롯 자료에 분류했습니다. 기획안은 별도로 정리해야 합니다.'
    return value


def settings_value(value, previous=None):
    if not isinstance(value, dict):
        raise ValueError('분량 설정 형식을 확인하세요.')
    output = {**DEFAULT_SETTINGS, **(previous or {})}
    for key in DEFAULT_SETTINGS:
        if key in value:
            number = value[key]
            if key == 'total_episodes' and number is None:
                output[key] = None
                continue
            if isinstance(number, bool) or not isinstance(number, int):
                raise ValueError('목표 글자수와 총 회차수는 정수로 입력하세요.')
            output[key] = number
    total = output['total_episodes']
    if not 1000 <= output['target_chars'] <= 5000 or (total is not None and not 1 <= total <= 10000):
        raise ValueError('목표 글자수는 1,000~5,000자, 총 회차수는 1~10000화입니다.')
    return output


def parse_key(key):
    if not isinstance(key, str) or not re.fullmatch(r'[a-z]+:\d+', key):
        raise ValueError('자료 위치가 올바르지 않습니다.')
    kind, number = key.split(':')
    number = int(number)
    if kind not in KINDS or (kind == 'episode' and not 1 <= number <= 10000) or (kind != 'episode' and number != 0):
        raise ValueError('자료 종류 또는 회차가 올바르지 않습니다.')
    return kind, number


def source_fingerprint(state):
    source = {key: state.get(key, {}) for key in ('official', 'drafts', 'settings')}
    source['messages'] = state.get('messages', [])
    return hashlib.sha256(json.dumps(source, sort_keys=True, ensure_ascii=False).encode()).hexdigest()


def validate_ai_result(value):
    if not isinstance(value, dict) or not isinstance(value.get('reply'), str):
        raise ValueError('AI 응답의 대화 형식이 올바르지 않습니다.')
    updates = value.get('updates', [])
    if not isinstance(updates, list) or len(updates) > 10:
        raise ValueError('AI 자료 형식이 올바르지 않습니다.')
    keys = set()
    for update in updates:
        if not isinstance(update, dict) or not isinstance(update.get('kind'), str):
            raise ValueError('AI 자료 형식이 올바르지 않습니다.')
        kind = update['kind']
        ep = update.get('episode', 1) if kind == 'episode' else 0
        if isinstance(ep, bool) or not isinstance(ep, int):
            raise ValueError('AI 회차 번호는 정수여야 합니다.')
        parse_key(f'{kind}:{ep}')
        if (kind, ep) in keys:
            raise ValueError('AI가 같은 자료를 중복 제안했습니다. 재시도하세요.')
        keys.add((kind, ep))
        if 'patches' not in update and (not isinstance(update.get('content'), str) or not update['content'].strip()):
            raise ValueError('AI 자료 본문이 비어 있습니다.')
        for field in ('summary', 'facts', 'impact'):
            if field in update and not isinstance(update[field], str):
                raise ValueError('AI 요약·사실 기록 형식이 올바르지 않습니다.')
    number = value.get('write_episode', 0)
    if isinstance(number, bool) or not isinstance(number, int) or not 0 <= number <= 10000:
        raise ValueError('집필 회차 번호가 올바르지 않습니다.')
    if number:
        goals = value.get('scene_goals')
        if not isinstance(goals, list) or not 2 <= len(goals) <= 6 or any(not isinstance(g, str) or not g.strip() for g in goals):
            raise ValueError('장면 계획이 올바르지 않습니다.')
        if ('episode', number) in keys:
            raise ValueError('새 회차의 장면 계획과 원고를 중복 제안했습니다.')
    if value.get('settings'):
        settings_value(value['settings'])
        if ('settings', 0) in keys:
            raise ValueError('분량 설정을 중복 제안했습니다.')
    return value


def normalize_manuscript_breaks(text):
    text = re.sub(r'(?:\\r\\n|\\n)', '\n', text)
    return re.sub(r'([.!?。！？]["”’\']?)nn(?=[가-힣"“‘\'])', r'\1\n\n', text)


def apply_patches(original, patches):
    if not isinstance(patches, list) or not patches or len(patches) > 30:
        raise ValueError('부분 수정 형식이 올바르지 않습니다.')
    result = original
    for patch in patches:
        if not isinstance(patch, dict):
            raise ValueError('부분 수정 형식이 올바르지 않습니다.')
        old, new = patch.get('old'), patch.get('new')
        if not isinstance(old, str) or not old or not isinstance(new, str) or result.count(old) != 1:
            raise ValueError('수정할 문장이 없거나 여러 곳에 있습니다. 위치를 더 구체적으로 지정하세요.')
        result = result.replace(old, new, 1)
    return result


def compare_text(before, after):
    return [{'type': tag, 'before': ''.join(a), 'after': ''.join(b)} for tag, a, b in _segments(before, after)]


def _segments(before, after):
    a, b = before.splitlines(keepends=True), after.splitlines(keepends=True)
    for tag, i, j, k, l in difflib.SequenceMatcher(None, a, b, autojunk=False).get_opcodes():
        yield tag, a[i:j], b[k:l]


def episode_findings(items, manuscript):
    findings = []
    seen = set()
    for item in items[:30] if isinstance(items, list) else []:
        if not isinstance(item, dict):
            continue
        kind, fact, quote = (item.get(field) for field in ('kind', 'fact', 'quote'))
        if kind == 'world' and is_concrete_place_name(item.get('name')):
            kind = 'places'
        if kind not in REFERENCE_DOCUMENTS or not isinstance(fact, str) or not fact.strip() or len(fact) > 500:
            continue
        fact = fact.strip()
        if fact in seen:
            continue
        seen.add(fact)
        quote = quote.strip() if isinstance(quote, str) else ''
        reason = item.get('reason')
        reason = reason.strip()[:300] if isinstance(reason, str) else ''
        if not (12 <= len(quote) <= 600 and quote in manuscript):
            quote = ''
            reason = '원고에서 근거 구절을 확인할 수 없어요.'
        if item.get('status') != 'clear' and not reason:
            reason = '기존 설정과의 관계를 확인해 주세요.'
        entry = {'kind': kind, 'fact': fact, 'quote': quote, 'reason': reason}
        field = item.get('field')
        if field in FINDING_FIELDS.get(kind, ()):
            entry['field'] = field
        name = item.get('name')
        if (kind != 'plot' and isinstance(name, str) and 0 < len(name.strip()) <= 60
                and not re.search(r'미정|미확정|미상|[\r\n]', name)
                and name.strip() not in ('이름', '주인공', '조연', '설정', '설명', '세계관')):
            entry['name'] = name.strip()
        if kind == 'characters':
            if not entry.get('name') and quote:
                label = source_label(fact, quote)
                if label:
                    entry['name'] = label
            previous_name = item.get('previous_name')
            if previous_name:
                if explicit_identity(quote, previous_name, entry.get('name')):
                    entry['previous_name'] = previous_name
                else:
                    entry['reason'] = '같은 인물인지 원고의 명시된 근거를 확인해 주세요.'
        role = item.get('role')
        if kind == 'characters' and isinstance(role, str):
            role = role.strip()
            if 0 < len(role) <= 40 and not re.search(r'미정|미확정|미상|없음|[\r\n]', role):
                entry['role'] = role
        findings.append(entry)
    return findings


CONTINUITY_RULES = (
    '확정 자료와 이전 회차의 명시된 사실을 우선하세요. '
    '능력과 제약의 발동 조건, 시간 순서, 인물마다 이미 아는 정보를 지키세요. '
    '기록에 없는 능력이나 행동을 금지된 것으로 간주하지 마세요. '
    '기획과 플롯의 예정 사건은 실제로 벌어진 사건과 구분하세요.'
)
CONTINUITY_CHECK = (
    '이번 원고와 이전에 확정한 설정·회차의 실제 충돌을 검사하세요. '
    '먼저 인물의 위치·지식·관계, 시간 순서, 능력의 발동 조건·대가·범위를 대조하세요. '
    '확정 플롯에서 이번 회차에 배정한 사건과 규모도 확인하세요. '
    '인물 카드의 이름과 본문·요약의 호칭을 대조하고 같은 인물이 다른 이름으로 섞이지 않았는지 확인하세요. '
    '직전 회차에서 이미 끝난 사건을 새 사건처럼 반복하거나 같은 갈등과 결말을 그대로 되풀이했는지 확인하세요. '
    '짧은 회상이나 이전 사건의 후속 결과는 반복으로 지적하지 마세요. '
    '이웃의 가뭄을 시험 삼아 해결하는 단계에서 도시 전체의 물길을 조종하는 것처럼 '
    '이번 회차에 명시된 범위나 이후 단계의 능력을 명백히 앞당긴 경우를 지적하세요. '
    '양립 가능한 사건, 전개 속도에 대한 취향, 설명이 아직 나오지 않은 사실은 제외하세요. '
    '자료에 능력의 한계나 공개 시점이 명시되지 않았다면, 기존에 묘사되지 않은 능력이라는 이유만으로 충돌 처리하지 마세요. '
    '작가가 의도했다고 기록한 전개는 같은 근거로 지적하지 말고, 새로 발생한 명시적 모순은 보고하세요. '
    '각 항목에 원고의 직접 인용과 어떤 확정 사실 또는 회차 범위와 충돌하는지 적으세요. '
    'JSON의 issues에 충돌과 양쪽 근거를 문자열 배열로 반환하고, 충돌이 없으면 issues는 빈 배열로 반환하세요.'
)


def build_episode_context(state, episode):
    official = {key: value for key, value in state['official'].items()
                if not key.startswith('episode:') or int(key.split(':')[1]) < episode}
    records = {key: value for key, value in state.get('records', {}).items()
               if key.isdigit() and int(key) < episode and f'episode:{key}' in official}
    context = json.loads(build_context({**state, 'episode': episode, 'official': official,
                                       'records': records, 'drafts': {}, 'messages': []}))
    aliases = confirmed_character_aliases(state)
    if aliases:
        context['character_aliases'] = aliases
    plot = official.get('plot:0', {}).get('text', '')
    events = {}
    for line in plot.splitlines():
        match = re.match(r'^\s*(?:[-*]\s*)?(\d+)\s*화\s*[:：]\s*(.+)$', line)
        if not match:
            match = re.match(r'^\s*\|\s*(\d+)\s*화?\s*\|\s*([^|]+)', line)
        if match:
            events[int(match[1])] = match[2].strip()
    if episode in events:
        context['episode_scope'] = {
            'episode': episode, 'current_events': events[episode],
            'reserved_for_later': {str(n): events[n] for n in sorted(events) if episode < n <= episode+4},
            'instruction': '이번 원고는 current_events의 사건 범위 안에서 마무리한다. reserved_for_later는 아직 발생하지 않은 예정 사건이다. '
                           '언급·복선과 사건을 실제 진행하는 것을 구분한다. 분량이 부족해도 이후 회차 사건을 실행하지 말고 현재 장면을 구체화한다. '
                           '수정 시 회차 범위를 벗어난 사건·결말은 보존하지 말고 현재 회차 계획에 맞게 다시 구성한다.'}
    return json.dumps(context, ensure_ascii=False, separators=(',', ':'))


def episode_continuity_stamp(state, episode, manuscript):
    context = build_episode_context({**state, 'selected': 'episode'}, episode)
    if episode > 1:
        canonical = json.loads(context)
        for key, record in canonical['official'].items():
            if key.startswith('episode:'):
                # Approval alone does not change the predecessor's story.
                # Keep prose, summary, facts and every reference document in the hash.
                record.pop('status', None)
        context = json.dumps(canonical, ensure_ascii=False, separators=(',', ':'))
    return hashlib.sha256((CONTINUITY_CHECK + '\n' + CONTINUITY_RULES + '\n' + context + '\n' + manuscript).encode()).hexdigest()


def build_context(state):
    memory = {'messages': state['messages'][-40:], 'official': {}, 'drafts': {},
              'settings': state.get('settings', DEFAULT_SETTINGS), 'selected': state['selected'], 'episode': state['episode']}
    selected = {state['episode']}
    latest_message = state['messages'][-1]['text'] if state['messages'] else ''
    selected.update(int(x) for x in re.findall(r'(\d+)\s*화', latest_message))
    terms = set(re.findall(r'[가-힣A-Za-z0-9]{2,}', latest_message))
    # Local retrieval adds relevant old chapters without another model request.
    ranked = []
    if terms:
        for key, record in state.get('official', {}).items():
            if key.startswith('episode:'):
                corpus = ' '.join(str(record.get(k, '')) for k in ('text', 'summary', 'facts'))
                score = sum(min(corpus.count(term), 3) for term in terms)
                if score:
                    ranked.append((score, int(key.split(':')[1])))
    selected.update(number for _, number in sorted(ranked, reverse=True)[:3])
    memory['retrieved_episodes'] = sorted(selected)
    memory['confirmed_episode_facts'] = {
        ep: [entry['fact'] for entry in record.get('findings', [])
             if not entry.get('reason') and not entry.get('removed')]
        for ep, record in state.get('records', {}).items() if record.get('findings')
    }
    intentional = {}
    for ep, record in state.get('records', {}).items():
        decision = record.get('intentional_development')
        if decision and decision['version'] == state['official'].get(f'episode:{ep}', {}).get('version'):
            intentional[ep] = {'issues': decision['issues'], 'note': decision['note']}
    if intentional:
        memory['author_intentional_developments'] = intentional
        memory['author_intent_instruction'] = (
            '작가가 유지하기로 한 전개입니다. 메모의 공개 시점과 기존 사건을 집필에 반영하고, '
            '같은 지적은 반복하지 마세요. 이후에 새로 생긴 명시적 모순은 점검하세요.'
        )
    for group in ('official', 'drafts'):
        numbers = sorted((int(k.split(':')[1]) for k in state[group] if k.startswith('episode:')), reverse=True)
        keep = set(numbers[:3]) | selected
        for key, record in state[group].items():
            if key == 'guidelines:0':
                continue
            item = {k: v for k, v in record.items() if k in ('text', 'summary', 'facts', 'status', 'metadata_stale')}
            if (key.startswith('episode:') and int(key.split(':')[1]) not in keep
                    and item.get('summary') and not item.get('metadata_stale')):
                item['text'] = '(이전 회차: 요약·공식 사실 기록 참고)'
            if group == 'drafts' and key in memory['official'] and item.get('text') == memory['official'][key].get('text'):
                item['text'] = '(공식 자료 본문과 동일)'
            memory[group][key] = item
    aliases = confirmed_character_aliases(state)
    if aliases:
        memory['character_aliases'] = aliases
    return json.dumps(memory, ensure_ascii=False, separators=(',', ':'))
