"""Preparation gates exclusive to stories created with the branch action."""
import hashlib
import json
import re


def events(text):
    result = {}
    current = None
    for line in text.splitlines():
        match = re.match(r'^\s*(?:[-*]\s*)?(\d+)\s*화\s*[:：]\s*(.*)', line)
        if not match:
            match = re.match(r'^\s*\|\s*(\d+)\s*화?\s*\|\s*([^|]+)', line)
        if not match:
            match = re.match(r'^#{1,6}\s*(\d+)\s*화\s*[:：]?\s*(.*)', line)
        if match:
            current = int(match[1]);result[current] = match[2].strip()
        elif current is not None and line.strip() and not re.match(r'^(?:#|시작|중간|결말|\|)', line.strip()):
            result[current] += ' ' + line.strip()
    return result


def retained_plot(text, number, records):
    rows = events(text)
    for n in range(1, number+1):
        record = records.get(str(n), {})
        if not rows.get(n) and record.get('summary') and not record.get('metadata_stale'):
            rows[n] = ' '.join(record['summary'].split())
    return '## 회차 구성\n' + '\n'.join(f'{n}화: {rows[n]}' for n in sorted(rows) if n <= number and rows[n])


def clean_findings(state):
    if not state.get('branch_origin'):
        return
    origin = state['branch_origin']
    review_target = state.get('records',{}).get(str(origin.get('episode'))) if origin.get('setup_flow') and not origin.get('setup_complete') else None
    containers = list(state.get('records', {}).values())
    containers += [item for group in ('official','drafts') for key,item in state.get(group,{}).items() if key.startswith('episode:')]
    for record in containers:
        for finding in record.get('findings', []):
            if str(finding.get('reason','')).strip().lower() == 'clear':
                finding['reason'] = ''
        if record is review_target and record.get('setting_review') in ('done','review'):
            record['setting_review'] = 'review' if any(item.get('reason') and not item.get('removed') for item in record.get('findings', [])) else 'done'


def stage(state):
    origin = state.get('branch_origin', {})
    if not origin.get('setup_flow') or origin.get('setup_complete'):
        return 'complete'
    number = origin['episode']
    key = f'episode:{number}'
    source = state.get('official', {}).get(key, {})
    if (not source or key in state.get('drafts', {})
            or hashlib.sha256(source.get('text','').encode()).hexdigest() == origin.get('body')):
        return 'revise'
    record = state.get('records', {}).get(str(number), {})
    impact = state.get('revision_impact', {})
    if (record.get('version') != source.get('version') or record.get('setting_review') != 'done'
            or any(key in state.get('drafts',{}) for key in ('plan:0','characters:0','world:0','places:0','lore:0','settings:0'))
            or ('plot:0' in state.get('drafts',{}) and not state['drafts']['plot:0'].get('branch_setup_plot'))
            or impact.get('status') in ('pending','awaiting_settings','settings_ready','running','ready','blocked','failed')
            or any(item.get('decision') == 'kept' for item in impact.get('results',[]))):
        return 'review'
    return 'plan' if state.get('drafts',{}).get('plot:0',{}).get('branch_setup_plot') else 'length'


def error(state):
    current = stage(state)
    number = state.get('branch_origin', {}).get('episode')
    if current == 'revise':
        return f'가져온 {number}화를 먼저 수정하고 확정한 뒤 다음 회차를 집필해 주세요.'
    if current == 'review':
        return f'수정한 {number}화의 설정 검토와 필요한 변경 수락을 먼저 마쳐 주세요.'
    if current in ('length','plan'):
        return '다른 줄거리의 분량과 이후 회차 구성을 정하고 수락한 뒤 집필해 주세요.'
    return None

def basis(state):
    payload = {'official':{key:item.get('text','') for key,item in state.get('official',{}).items()},
               'drafts':{key:item.get('text','') for key,item in state.get('drafts',{}).items() if not item.get('branch_setup_plot')},
               'settings':state['settings'],
               'records':{key:{field:item.get(field) for field in ('findings','summary','facts','setting_review')}
                          for key,item in state.get('records',{}).items()}}
    return hashlib.sha256(json.dumps(payload,ensure_ascii=False,sort_keys=True).encode()).hexdigest()
