"""Bounded manuscript length correction and unambiguous batch passage application."""
import re
from workflow import normalize_manuscript_breaks


def replays_existing_manuscript(manuscript, addition, *, allow_excerpt=False):
    """Reject recycled prose as an insertion, including whitespace/punctuation changes."""
    compact = lambda value: re.sub(r'[\W_]+', '', value, flags=re.UNICODE)
    source, returned = compact(manuscript), compact(addition)
    if not returned:
        return True
    if not allow_excerpt and returned in source:
        return True
    if len(source) >= 80 and source in returned:
        return True
    # A returned whole chapter can have small edits while still replaying its opening/ending.
    return (len(source) >= 200 and len(returned) >= len(source) * .6
            and source[:100] in returned and source[-100:] in returned)


def repeated_passage_issues(text):
    """Report exact, long sentence runs across adjacent paragraphs; never delete prose."""
    paragraphs = [p for p in re.split(r'\n\s*\n', text) if p.strip()]
    issues = []
    previous = {}
    for paragraph in paragraphs:
        sentences = list(re.finditer(r'''\S.*?[.!?。！？]["”’']?(?=\s|$)''', paragraph, re.S))
        current = {}
        for size in (2,3):
            for index in range(len(sentences)-size+1):
                start,end=sentences[index].start(),sentences[index+size-1].end()
                quote=paragraph[start:end]
                normalized=re.sub(r'\s+','',quote)
                if len(normalized)<100:
                    continue
                current[normalized]=quote
                if normalized in previous and not issues:
                    issues.append('인접 문단에서 같은 긴 연속 문장들이 그대로 반복됩니다. 이미 끝난 행동을 새로 일어나는 것처럼 반복한 것인지 확인하고, 중복이면 한 번만 남기세요. '
                                  '의도된 반복이나 회상이면 해당 의도를 보존하세요. 반복 구절: '+quote)
        previous=current
    return issues


def expansion_span(text, turn=0):
    """Choose a complete interior passage; leave the chapter ending untouched."""
    spans = []
    offset = 0
    paragraphs = text.split('\n\n')
    for part in paragraphs[:-1]:
        if 80 <= len(part.strip()) <= 800:
            spans.append((offset + len(part)-len(part.lstrip()), offset+len(part.rstrip())))
        offset += len(part)+2
    if not spans:
        sentences = list(re.finditer(r'''\S.*?[.!?。！？]["”’']?(?=\s|$)''', text, re.S))
        for index in range(1, len(sentences)-3):
            start, end = sentences[index].start(), sentences[index+2].end()
            if 80 <= end-start <= 800:
                spans.append((start,end))
    return spans[turn % len(spans)] if spans else None


def revision_timeline(chapters, revised, drafts, results):
    pending = {row['episode']: row.get('version') for row in results
               if row.get('version') and row.get('decision') != 'kept'}
    timeline = {}
    for number, item in chapters.items():
        draft = drafts.get(f'episode:{number}')
        text = draft['text'] if draft and draft['version'] == pending.get(number) else item['text']
        timeline[number] = revised.get(number, text)
    return timeline


def repair_reviewed_manuscript(manuscript, issues, context, nearby, generate, normalize=None):
    """Return a concrete correction, never treat advice or a no-op as a repair."""
    import json
    response = generate(
        '점검 의견을 원고에 직접 반영해 수정하세요. 의견이나 승인 요청만 반환하지 마세요. '
        '확정 설정과 회차별 계획을 기준으로 중복 사건·성급한 등장·다음 회차 침범을 이 회차 안에서 해결하세요. '
        '사건을 계획된 다음 회차로 미뤄야 하면 현재 회차의 해당 부분을 덜어내고 현재 회차 장면을 자연스럽게 구성하세요. '
        '확정 설정을 바꾸거나 다른 회차 본문을 대신 수정하지 마세요. 기존 결말은 회차 계획과 충돌하지 않는 범위에서 유지하세요. '
        '고칠 범위가 넓거나 정확한 구절 교체가 어려우면 문단을 나눈 전체 수정본을 text로 반환하세요. '
        'JSON {"text":"전체 수정 원고","patches":[]} 또는 정확한 patches와 빈 text를 반환하세요.\n'
        + '확정 자료:\n'+context+'\n점검 의견:\n'+'\n'.join(issues)
        + '\n주변 회차:\n'+json.dumps(nearby,ensure_ascii=False)+'\n수정할 원고:\n'+manuscript,
        task='continuity_revision')
    if not isinstance(response, dict):
        return None
    value = response.get('text')
    if response.get('patches'):
        try:
            value = apply_revision_patches(manuscript, response['patches'])
        except ValueError:
            if not isinstance(value,str) or not value.strip():
                return None
    if not isinstance(value,str) or not value.strip():
        return None
    value = readable_manuscript(normalize(value) if normalize else value).strip()
    return value if value != manuscript.strip() else None


def readable_manuscript(text):
    """Break oversized paragraphs at sentence boundaries without rewriting words."""
    text = normalize_manuscript_breaks(text)
    paragraphs = re.split(r'\n[ \t]*\n', text)
    output = []
    for paragraph in paragraphs:
        if len(paragraph) <= 600:
            output.append(paragraph)
            continue
        start = 0
        for match in re.finditer(r'''[.!?。！？]["”’']?([ \t]+)(?=\S)''', paragraph):
            if match.start(1) - start >= 280:
                output.append(paragraph[start:match.start(1)])
                start = match.end(1)
        output.append(paragraph[start:])
    return '\n\n'.join(output)


def apply_revision_patches(original, patches):
    """Anchor every patch in the same original; tolerate whitespace only."""
    if not isinstance(patches, list) or not 0 < len(patches) <= 30:
        raise ValueError('부분 수정 형식이 올바르지 않습니다.')
    spans = []
    for patch in patches:
        if not isinstance(patch, dict):
            raise ValueError('부분 수정 형식이 올바르지 않습니다.')
        old, new = patch.get('old'), patch.get('new')
        if not isinstance(old, str) or not old.strip() or not isinstance(new, str):
            raise ValueError('부분 수정 형식이 올바르지 않습니다.')
        matches = list(re.finditer(re.escape(old), original))
        if not matches:
            pattern = r'\s+'.join(re.escape(part) for part in re.split(r'\s+', old.strip()))
            matches = list(re.finditer(pattern, original))
        if len(matches) != 1:
            raise ValueError('수정 구절을 원문에서 하나로 확인하지 못했어요.')
        match = matches[0]
        spans.append((match.start(), match.end(), new))
    spans.sort()
    if any(left[1] > right[0] for left, right in zip(spans, spans[1:])):
        raise ValueError('수정 구절의 범위가 서로 겹쳐요.')
    result = original
    for start, end, new in reversed(spans):
        result = result[:start] + new + result[end:]
    return result


def adjust_revision_length(manuscript, minimum, maximum, context, generate, progress, saved=None, checkpoint=None, normalize=None):
    """Keep the closest candidate, then expand or compress using measured lengths."""
    def clean(value):
        value = normalize(value) if normalize else value
        return readable_manuscript(value).strip()
    def distance(value):
        return max(minimum - len(value), len(value) - maximum, 0)
    candidate = clean(manuscript)
    resumed = isinstance(saved, str) and bool(saved.strip()) and distance(clean(saved)) < distance(candidate)
    if resumed:
        candidate = clean(saved)
    target = (minimum + maximum) // 2
    stalled = 0
    for attempt in range(4):
        if not distance(candidate):
            return candidate
        progress(f'분량 조정 중 · 현재 {len(candidate):,}자 / 목표 {minimum:,}~{maximum:,}자')
        if (attempt or resumed) and attempt < 3 and not stalled and len(candidate) < minimum:
            prefix, separator, ending = candidate.rpartition('\n\n')
            if not separator:
                prefix, ending = candidate, ''
            joins = 4 if ending else 2
            lower, upper = max(1, minimum-len(candidate)-joins), maximum-len(candidate)-joins
            prompt = (f'현재 원고는 공백 포함 {len(candidate)}자입니다. 결말 직전에 삽입할 본문만 '
                      f'{lower}~{upper}자, 권장 {max(lower, target-len(candidate)-joins)}자로 작성하세요. '
                      '기존 사건과 시점, 확정 설정을 유지하고 장면 속 행동·대화·감정을 구체화하세요. '
                      '새 사건·인물·능력을 만들거나 앞 내용을 반복하지 마세요. 결말은 다시 쓰지 마세요. '
                      'JSON {"text":"삽입할 본문만"}을 반환하세요.\n확정 자료:\n'+context+'\n원고:\n'+candidate)
            response = generate(prompt, task='scene')
            value = response.get('text') if isinstance(response, dict) else None
            proposal = ('\n\n'.join(p for p in (prefix, clean(value), ending) if p)
                        if isinstance(value, str) and value.strip() and value.strip() not in candidate else None)
        else:
            restructure = attempt > 0
            prompt = (f'아래 소설 원고를 공백 포함 {minimum}~{maximum}자로 맞추세요. '
                      f'현재 {len(candidate)}자이며 목표는 {target}자입니다. '
                      f'{abs(target-len(candidate))}자 정도를 '+('보강' if len(candidate)<minimum else '줄이')+'세요. '
                      + ('부분 보강으로 분량을 맞추기 어려웠습니다. 기존 문장과 문단 배치를 고집하지 말고, '
                         '장면 구성과 서술을 처음부터 다시 짜서 전체 원고를 재작성하세요. '
                         '기존 문장에 반복 묘사를 덧붙여 분량만 늘리지 마세요. ' if restructure else '')
                      + '확정 변경과 핵심 사건, 인물 관계, 시점, 결말을 유지하세요. '
                      '새로운 설정이나 다른 줄거리로 바꾸지 마세요. '
                      'JSON {"text":"분량 조정한 전체 원고"}만 반환하세요.\n확정 자료:\n'+context+'\n원고:\n'+candidate)
            response = generate(prompt, task='scene')
            proposal = response.get('text') if isinstance(response, dict) else None
        if isinstance(proposal, str) and proposal.strip():
            proposal = clean(proposal)
            if distance(proposal) < distance(candidate):
                candidate = proposal
                stalled = 0
                if checkpoint:
                    checkpoint(candidate)
            else:
                stalled += 1
        else:
            stalled += 1
    return candidate if not distance(candidate) else None
