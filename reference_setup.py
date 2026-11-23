"""Structured first-time references; rendering changes layout, never story content."""

TEXT = {'type': 'string', 'minLength': 1}
REFERENCE_DESCRIPTION_STYLE = (
    '설정 설명은 대상 자체의 구체적인 사실과 특징을 직접 서술하세요. '
    '중요한 배경·원인·기능·조건·제약은 빠짐없이 유지하되, 길게 보이기 위한 수식과 같은 뜻의 반복은 넣지 마세요. '
    '이야기의 중심축·역할·긴장감을 담당한다는 작품 해설이나 아직 쓰지 않은 전개 예고로 설명을 늘리지 마세요. '
    '정해진 글자 수나 문장 수를 채우지 말고 필요한 정보의 양에 맞춰 자연스럽게 연결하세요. '
)
CHARACTER_ROLE_STYLE = (
    '인물의 role/역할은 이름 옆 배지에 표시할 서사적 역할입니다. '
    '주인공, 주요 조연, 조력자, 적대자, 조력자 겸 배후처럼 짧은 역할명으로 쓰세요. '
    '직업·신분·능력·운명·인물 소개를 역할 대신 쓰지 말고 필요한 내용은 설명이나 해당 속성에 보존하세요. '
    '확정된 서사적 역할은 유지하고 근거 없이 바꾸지 마세요. '
)
ATTRIBUTE = {'type': 'object', 'properties': {'field': TEXT, 'value': TEXT}, 'required': ['field', 'value']}
CARD = {'type': 'object', 'properties': {
    'name': TEXT, 'description': {**TEXT, 'description': REFERENCE_DESCRIPTION_STYLE},
    'attributes': {'type': 'array', 'items': ATTRIBUTE,
        'description': '기본 설명에 없는 중요한 별도 정보만. 다른 필드에서 이미 알 수 있는 내용과 사소한 장식은 넣지 않는다. 필요한 정보가 없으면 생략한다.'},
}, 'required': ['name', 'description']}
CHARACTER = {'type': 'object', 'properties': {
    **CARD['properties'], **{key: TEXT for key in ('role', 'personality', 'goal', 'relationships')},
    'role': {**TEXT, 'description': CHARACTER_ROLE_STYLE},
}, 'required': [*CARD['required'], 'role', 'personality', 'goal', 'relationships']}
SETUP_SCHEMA = {'type': 'object', 'properties': {
    'characters': {'type': 'array', 'items': CHARACTER, 'minItems': 1},
    **{kind: {'type': 'array', 'items': CARD, 'minItems': 1} for kind in ('world', 'places', 'lore')},
    'world_summary': TEXT,
    'plot': {'type': 'object', 'properties': {
        **{key: TEXT for key in ('beginning', 'middle', 'ending')},
        'episodes': {'type': 'array', 'minItems': 1, 'items': {'type': 'object', 'properties': {
            'number': {'type': 'integer', 'minimum': 1, 'maximum': 10000}, 'event': TEXT,
        }, 'required': ['number', 'event']}},
    }, 'required': ['beginning', 'middle', 'ending', 'episodes']},
}, 'required': ['characters', 'world', 'places', 'lore', 'world_summary', 'plot']}


def render_reference_setup(value):
    """Reject missing fields; retain all generated attributes in the existing document format."""
    def text(value):
        if not isinstance(value, str) or not value.strip():
            raise ValueError('설정 초안의 필수 항목이 비어 있습니다. 기존 자료는 유지됩니다.')
        return value.strip()

    updates = []
    for kind in ('characters', 'world', 'places', 'lore'):
        cards = value.get(kind)
        if not isinstance(cards, list) or not cards:
            raise ValueError('설정 초안의 자료가 누락됐습니다. 기존 자료는 유지됩니다.')
        sections = []
        for card in cards:
            if not isinstance(card, dict):
                raise ValueError('설정 항목 형식이 올바르지 않습니다.')
            lines = ['## ' + text(card.get('name'))]
            if kind == 'characters':
                lines += [label + ': ' + text(card.get(key)) for key, label in (
                    ('role', '역할'), ('personality', '성격'), ('goal', '목표'), ('relationships', '관계'))]
            lines.append('설명: ' + text(card.get('description')))
            attributes = card.get('attributes', [])
            if not isinstance(attributes, list):
                raise ValueError('설정 속성 형식이 올바르지 않습니다.')
            for attribute in attributes:
                if not isinstance(attribute, dict):
                    raise ValueError('설정 속성 형식이 올바르지 않습니다.')
                lines.append(text(attribute.get('field')) + ': ' + text(attribute.get('value')))
            sections.append('\n'.join(lines))
        update = {'kind': kind, 'content': '\n\n'.join(sections)}
        if kind == 'world':
            update['summary'] = text(value.get('world_summary'))
        updates.append(update)
    plot = value.get('plot')
    if not isinstance(plot, dict):
        raise ValueError('플롯 형식이 올바르지 않습니다.')
    episodes = plot.get('episodes')
    if (not isinstance(episodes, list) or not episodes or any(
            not isinstance(row, dict) or type(row.get('number')) is not int
            or not 1 <= row['number'] <= 10000 for row in episodes)
            or len({row['number'] for row in episodes}) != len(episodes)):
        raise ValueError('회차 구성 형식이 올바르지 않습니다.')
    lines = ['## 전체 플롯', *[label + ': ' + text(plot.get(key)) for key, label in (
        ('beginning', '시작'), ('middle', '중간'), ('ending', '결말'))], '', '## 회차 구성',
        *[str(row['number']) + '화: ' + text(row.get('event')) for row in sorted(episodes, key=lambda row: row['number'])]]
    updates.append({'kind': 'plot', 'content': '\n'.join(lines)})
    return {'updates': updates}
