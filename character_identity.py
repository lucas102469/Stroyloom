"""Conservative, evidence-backed character labels; no invented names or AI calls."""
import re


def explicit_identity(quote, old, new):
    if not all(isinstance(value, str) for value in (quote, old, new)) or not old or not new or old == new or len(old)>60 or len(new)>60:
        return False
    old,new=map(re.escape,(old,new))
    return bool(re.search(old+r'(?:의)?\s*(?:본명|이름|성명)(?:은|는|이|가)?\s*["“‘\x27]?'+new+r'(?=["”’\x27\s.,。]|이|였|입|$)',quote)
                or re.search(old+r'(?:은|는|이|가)?\s*자신을\s*["“‘\x27]?'+new+r'["”’\x27]?(?:이)?라고\s*소개',quote))


def source_label(fact, quote):
    match=re.match(r'^\s*([^\n.!?]{1,60}?)(?:은|는|이|가|을|를)\s',fact)
    if not match:
        return None
    label=match[1].strip()
    if label in ('그','그녀','그들','그것','그곳','누군가') or label not in quote:
        return None
    return label


def confirmed_character_aliases(state):
    targets={}
    for _,record in sorted(state.get('records',{}).items(),key=lambda item:int(item[0]) if str(item[0]).isdigit() else -1):
        if record.get('setting_review') in ('continuity','organize'):
            continue
        for item in record.get('findings',[]):
            old,new=item.get('previous_name'),item.get('name')
            if (item.get('kind')=='characters' and not item.get('reason') and not item.get('removed')
                    and explicit_identity(item.get('quote',''),old,new)):
                targets.setdefault(old,set()).add(new)
    text=state.get('official',{}).get('characters:0',{}).get('text','')
    names=re.findall(r'^#{1,6}[ \t]+(.+?)\s*$',text,re.M)
    aliases={old:next(iter(values)) for old,values in targets.items() if len(values)==1 and names.count(old)<=1 and not (old in names and next(iter(values)) in names)}
    result={}
    for old in aliases:
        current=old;seen=set()
        while current in aliases and current not in seen:
            seen.add(current);current=aliases[current]
        if current not in seen:
            result[old]=current
    return result
