"""Editing view of existing settings, including accepted chapter findings."""
import re
from workflow import replace_linked_names

KINDS = ('characters', 'world', 'places', 'lore')

def edit_source(state, key):
    source = state.get('drafts', {}).get(key) or state.get('official', {}).get(key) or {}
    kind = key.split(':')[0]
    if kind not in KINDS or not source:
        return source
    text = source.get('text', '')
    compact = lambda value: re.sub(r'[\s.!。]', '', value)
    for record in state.get('records', {}).values():
        if record.get('setting_review') in ('continuity', 'organize'):
            continue
        for item in record.get('findings', []):
            if item.get('kind') != kind or item.get('reason') or item.get('removed') or not item.get('name'):
                continue
            name = state.get('linked_names', {}).get(item['name'], item['name'])
            fact = replace_linked_names(item['fact'], state.get('linked_names', {}), preserve_new=True)
            if item['fact'] in source.get('reference_materialized_facts', []) or compact(fact) in compact(text):
                continue
            headings = list(re.finditer(r'^#{1,6}[ \t]+(.+?)[ \t]*$', text, re.M))
            match = next((heading for heading in headings if heading[1] == name), None)
            row = (item.get('field') or '설명') + ': ' + fact
            if match:
                index = headings.index(match)
                end = headings[index+1].start() if index+1 < len(headings) else len(text)
                text = text[:end].rstrip() + '\n' + row + '\n\n' + text[end:]
            else:
                role = '\n역할: ' + item['role'] if kind == 'characters' and item.get('role') else ''
                text = text.rstrip() + '\n\n## ' + name + role + '\n' + row
    return {**source, 'text': text}

def heading_at(text, start):
    headings = [heading for heading in re.finditer(r'^#{1,6}[ \t]+(.+?)[ \t]*$', text, re.M) if heading.start() <= start]
    return headings[-1][1] if headings else ''

def rename_request(text, document):
    names = re.findall(r'^#{1,6}[ \t]+(.+?)[ \t]*$', document, re.M)
    for old in sorted(set(names), key=len, reverse=True):
        match = re.fullmatch(re.escape(old) + r'(?:의)?\s*(?:이름(?:은|을)?\s*)?(?:을|를)?\s*["“\x27]?([^\s"”\x27]+?)["”\x27]?(?:으로|로)\s*(?:바꿔\s*줘|변경해\s*줘|바꿔|변경해)[.!?\s]*', text.strip())
        if match and match[1] != old and len(match[1]) <= 60:
            return old, match[1]
    return None

def requested_target(text, document):
    if not re.search(r'고쳐|수정|변경|바꿔|추가|삭제|없애', text):
        return None
    names = re.findall(r'^#{1,6}[ \t]+(.+?)[ \t]*$', document, re.M)
    mentioned = [name for name in set(names) if re.search(r'(?<![가-힣A-Za-z0-9])' + re.escape(name) + r'(?=\s|의|은|는|이|가|을|를|에게|에|$)',text)]
    return mentioned[0] if len(mentioned) == 1 else None

def card_scope(key, source, name):
    headings = list(re.finditer(r'^#{1,6}[ \t]+(.+?)[ \t]*$', source['text'], re.M))
    matches = [(index, heading) for index,heading in enumerate(headings) if heading[1] == name]
    if len(matches) != 1:
        return None
    index, heading = matches[0]
    end = headings[index+1].start() if index+1 < len(headings) else len(source['text'])
    quote = source['text'][heading.start():end].rstrip()
    return {'key':key,'version':source['version'],'start':heading.start(),'quote':quote}

def materialized_facts(state, key):
    source = state.get('drafts', {}).get(key) or state.get('official', {}).get(key) or {}
    facts = list(source.get('reference_materialized_facts', []))
    for record in state.get('records', {}).values():
        if record.get('setting_review') in ('continuity', 'organize'):
            continue
        for item in record.get('findings', []):
            if item.get('kind') == key.split(':')[0] and not item.get('reason') and not item.get('removed') and item.get('name'):
                if item.get('fact') and item['fact'] not in facts:
                    facts.append(item['fact'])
    return facts
