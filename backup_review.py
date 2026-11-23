"""Validate review state without changing the story text stored in a backup."""
import json


def restore_review(record, mapping):
    result = {}
    if 'findings' in record:
        findings = record['findings']
        if (not isinstance(findings, list) or any(
                not isinstance(item, dict)
                or any(not isinstance(item.get(field, ''), str)
                       for field in ('kind', 'name', 'fact', 'quote', 'reason', 'field', 'role'))
                or ('removed' in item and type(item['removed']) is not bool)
                for item in findings)):
            raise ValueError('백업의 회차 설정 기록이 올바르지 않습니다.')
        result['findings'] = json.loads(json.dumps(findings))
    stage = record.get('setting_review')
    if stage is not None:
        if stage not in ('continuity', 'organize', 'review', 'done'):
            raise ValueError('백업의 회차 검토 단계가 올바르지 않습니다.')
        result['setting_review'] = stage
    for field in ('findings_checked',):
        if field in record:
            value = record[field]
            if type(value) is not int or value not in mapping:
                raise ValueError('백업의 검토 기준 버전이 올바르지 않습니다.')
            result[field] = mapping[value]
    if 'continuity_issues' in record:
        issues = record['continuity_issues']
        if not isinstance(issues, list) or any(not isinstance(item, str) for item in issues):
            raise ValueError('백업의 일관성 점검 기록이 올바르지 않습니다.')
        result['continuity_issues'] = issues[:20]
    if 'intentional_development' in record:
        intent = record['intentional_development']
        if (not isinstance(intent, dict) or type(intent.get('version')) is not int
                or intent['version'] not in mapping or not isinstance(intent.get('note'), str)
                or not isinstance(intent.get('issues'), list)
                or any(not isinstance(item, str) for item in intent['issues'])):
            raise ValueError('백업의 전개 의도 기록이 올바르지 않습니다.')
        result['intentional_development'] = {
            'version': mapping[intent['version']], 'note': intent['note'],
            'issues': list(intent['issues']),
        }
    return result
