"""Reuse only findings verified against the exact manuscript and canonical context."""
import copy
from workflow import episode_continuity_stamp, REFERENCE_DOCUMENTS


def reusable_findings(state, episode):
    source=state.get('official',{}).get(f'episode:{episode}',{})
    record=state.get('records',{}).get(str(episode),{})
    if (not source or record.get('version')!=source.get('version')
            or f'episode:{episode}' in state.get('drafts',{})
            or 'findings' not in source or source.get('continuity_issues') or record.get('continuity_issues')
            or source.get('continuity_stamp')!=episode_continuity_stamp(state,episode,source['text'])):
        return None
    basis={key:value.get('version') for key,value in state['official'].items()
           if key.split(':')[0] in REFERENCE_DOCUMENTS}
    if source.get('findings_basis')!=basis:
        return None
    findings=record.get('findings',source['findings'])
    if not isinstance(findings,list):
        return None
    findings=copy.deepcopy(findings)
    for item in findings:
        if (not isinstance(item,dict) or item.get('kind') not in REFERENCE_DOCUMENTS
                or not isinstance(item.get('fact'),str) or not item['fact'].strip()
                or (not item.get('removed') and (not item.get('quote') or item['quote'] not in source['text']))):
            return None
        if item.get('reason')=='회차 설정 검토 대기':
            item['reason']=''
    return findings
