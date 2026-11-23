"""Official Gemini client. Does not load files or expose credentials in logs."""
import json

class RetryableAIError(ValueError):
    """A transient provider failure whose completed checkpoint can be reused."""
    retryable = True


class GeminiUnavailable(RetryableAIError):
    """Gemini returned HTTP 503."""
import logging
import os
import threading
import time
import re
from functools import lru_cache

import httpx
from google import genai
from google.genai import types, errors
from reference_setup import SETUP_SCHEMA, render_reference_setup

# App-specific setting keeps old GEMINI_MODEL in the user's .env untouched.
DEFAULT_MODEL = 'gemini-3.5-flash-lite'


PLOT_PROPERTIES = {
    **{field: {'type': 'string'} for field in ('beginning', 'middle', 'ending')},
    'episodes': {'type': 'array', 'items': {'type': 'object', 'properties': {
        'number': {'type': 'integer'}, 'event': {'type': 'string'},
    }, 'required': ['number', 'event']}},
}


EPISODE_FINDINGS_SCHEMA = {
    'type': 'array', 'items': {'type': 'object', 'properties': {
        'kind': {'type': 'string', 'enum': ['characters', 'world', 'places', 'lore', 'plot']},
        **{field: {'type': 'string'} for field in ('name', 'previous_name', 'role', 'field', 'fact', 'quote', 'reason')},
        'status': {'type': 'string', 'enum': ['clear', 'review']},
    }, 'required': ['kind', 'name', 'role', 'field', 'fact', 'quote', 'status', 'reason']},
}


@lru_cache(maxsize=2)
def get_client(key):
    return genai.Client(api_key=key, vertexai=False, http_options=types.HttpOptions(
        base_url='https://generativelanguage.googleapis.com', api_version='v1beta',
        timeout=180_000, retry_options=types.HttpRetryOptions(attempts=1)))


def partial_text(text):
    match = re.search(r'"(?:reply|text)"\s*:\s*"', text)
    if not match:
        return ''
    start = match.end()
    escaped = False
    end = start
    for end in range(start, len(text)):
        char = text[end]
        if char == '"' and not escaped:
            break
        if char == '\\' and not escaped:
            escaped = True
        else:
            escaped = False
    else:
        end = len(text)
    fragment = text[start:end]
    for trim in range(min(8, len(fragment)) + 1):
        try:
            return json.loads('"' + (fragment[:-trim] if trim else fragment) + '"')
        except json.JSONDecodeError:
            pass
    return ''


def gemini(prompt, task='chat', on_progress=None):
    key = os.environ.get('GEMINI_API_KEY')
    if not key:
        raise ValueError('.env 또는 환경변수에 GEMINI_API_KEY를 설정한 뒤 서버를 다시 실행하세요.')
    model = os.environ.get('STORYLOOM_MODEL', DEFAULT_MODEL)
    config = {'response_mime_type': 'application/json'}
    if model.startswith('gemini-3.') and 'lite' not in model:
        config['thinking_config'] = types.ThinkingConfig(thinking_level='MEDIUM' if task in ('scene','first_scene','continuation_scene') else 'LOW')
    if task == 'chat':
        config['response_json_schema'] = {'type': 'object', 'properties': {
            'reply': {'type': 'string'},
            'updates': {'type': 'array', 'maxItems': 10, 'items': {'type': 'object', 'properties': {
                'kind': {'type': 'string', 'enum': ['plan', 'characters', 'world', 'places', 'lore', 'plot', 'episode', 'memory', 'settings']},
                'episode': {'type': 'integer', 'minimum': 1, 'maximum': 10000},
                **{key: {'type': 'string'} for key in ('content', 'summary', 'facts', 'impact', 'title')},
                'patches': {'type': 'array', 'items': {'type': 'object', 'properties': {
                    'old': {'type': 'string'}, 'new': {'type': 'string'},
                }, 'required': ['old', 'new']}},
            }, 'required': ['kind']}},
            'settings': {'type': 'object', 'properties': {
                'target_chars': {'type': 'integer', 'minimum': 1000, 'maximum': 5000},
                'total_episodes': {'type': ['integer', 'null'], 'minimum': 1, 'maximum': 10000},
            }},
            'write_episode': {'type': 'integer', 'minimum': 0, 'maximum': 10000},
            'scene_goals': {'type': 'array', 'items': {'type': 'string'}},
        }, 'required': ['reply', 'updates']}
    elif task == 'scene':
        config['response_json_schema'] = {'type': 'object', 'properties': {
            key: {'type': 'string'} for key in ('text', 'title', 'summary', 'facts')}, 'required': ['text']}
    elif task in ('first_scene','continuation_scene'):
        marker=re.search(r'(?m)^scene_length:(\{[^\n]+\})',prompt)
        limits=json.loads(marker[1]) if marker else {}
        lower=limits.get('minimum');upper=limits.get('maximum',min(5500,lower+500) if type(lower) is int else None);passage_count=limits.get('parts')
        if (type(lower) is not int or not 1 <= lower <= 5500 or type(upper) is not int or not lower <= upper <= 5500
                or type(passage_count) is not int or not 1 <= passage_count <= 20):
            raise ValueError(('1화 장면' if task=='first_scene' else '이어쓰기')+'의 분량 배정을 확인할 수 없어요.')
        config['response_json_schema']={'type':'object','properties':{
            'passages':{'type':'array','minItems':passage_count,'maxItems':passage_count,'items':{
                'type':'string','minLength':max(1,(lower-2*(passage_count-1)+passage_count-1)//passage_count),
                'maxLength':max(1,(upper-2*(passage_count-1)+passage_count-1)//passage_count),
                'description':'장면 안에서 앞 구간을 이어받는 실제 소설 본문. 여러 문단과 대화를 포함할 수 있으며 구간 제목이나 요약을 넣지 않는다.'}},
            'title':{'type':'string'}},'required':['passages']}
    elif task == 'branch_chapter_edit':
        config['response_json_schema'] = {'type':'object','properties':{
            'needs_clarification':{'type':'boolean'},'reply':{'type':'string'},
            'patches':{'type':'array','maxItems':30,'items':{'type':'object','properties':{
                'old':{'type':'string'},'new':{'type':'string'}},'required':['old','new']}}
        },'required':['needs_clarification','reply','patches']}
    elif task == 'partial_edit':
        config['response_json_schema'] = {'type': 'object', 'properties': {
            'replacement': {'type': 'string'}}, 'required': ['replacement']}
    elif task == 'plan_reconcile':
        config['response_json_schema'] = {'type': 'object', 'properties': {
            'patches': {'type': 'array', 'items': {'type': 'object', 'properties': {
                'old': {'type': 'string'}, 'new': {'type': 'string'},
            }, 'required': ['old', 'new']}},
        }, 'required': ['patches']}
    elif task == 'metadata':
        config['max_output_tokens'] = 4096
        config['response_json_schema'] = {'type': 'object', 'properties': {
            'summary': {'type': 'string'}, 'facts': {'type': 'string'}}, 'required': ['summary', 'facts']}
    elif task == 'continuity':
        config['response_json_schema'] = {'type': 'object', 'properties': {
            'reply': {'type': 'string'}}, 'required': ['reply']}
    elif task == 'episode_plan':
        config['response_json_schema'] = {'type': 'object', 'properties': {
            'reply': {'type': 'string'},
            'scene_goals': {'type': 'array', 'items': {'type': 'string'}, 'minItems': 2, 'maxItems': 3},
        }, 'required': ['reply', 'scene_goals']}
    elif task == 'continuity_revision':
        config['response_json_schema'] = {'type': 'object', 'properties': {
            'text': {'type': 'string'},
            'patches': {'type': 'array', 'items': {'type': 'object', 'properties': {
                'old': {'type': 'string'}, 'new': {'type': 'string'}}, 'required': ['old', 'new']}},
        }, 'required': ['text', 'patches']}
    elif task == 'batch_revision':
        config['response_json_schema'] = {'type': 'object', 'properties': {
            'blocked': {'type': 'boolean'}, 'impact': {'type': 'string'},
            'patches': {'type': 'array', 'items': {'type': 'object', 'properties': {
                'old': {'type': 'string'}, 'new': {'type': 'string'}}, 'required': ['old', 'new']}},
        }, 'required': ['blocked', 'impact', 'patches']}
    elif task in ('episode_continuity', 'episode_audit', 'episode_review_metadata'):
        config['response_json_schema'] = {'type': 'object', 'properties': {
            'issues': {'type': 'array', 'items': {'type': 'string'}},
            'summary': {'type': 'string'},
            'facts': {'type': 'string'},
        }, 'required': ['issues']}
        if task == 'episode_audit':
            config['response_json_schema']['properties']['findings'] = EPISODE_FINDINGS_SCHEMA
            config['response_json_schema']['required'] += ['summary', 'facts', 'findings']
        elif task == 'episode_review_metadata':
            config['response_json_schema']['required'] += ['summary', 'facts']
    elif task == 'character_names':
        config['response_json_schema'] = {'type': 'object', 'properties': {
            'names': {'type': 'array', 'items': {'type': 'string'}}}, 'required': ['names']}
    elif task == 'planning_fields':
        fields = ('title', 'logline', 'genre', 'synopsis')
        config['response_json_schema'] = {'type': 'object', 'properties': {
            field: {'type': 'string'} for field in fields}, 'required': list(fields)}
    elif task == 'length_plan':
        config['response_json_schema'] = {'type': 'object', 'properties': {
            'minimum_episodes': {'type': 'integer'},
            'recommended_target_chars': {'type': 'integer', 'minimum': 2000, 'maximum': 5000},
            **{field: {'type': 'string'} for field in ('reason', 'compression', 'plot')},
            **PLOT_PROPERTIES,
        }, 'required': ['minimum_episodes', 'recommended_target_chars', 'reason', 'compression', 'plot']}
    elif task == 'plot_structure':
        config['response_json_schema'] = {'type': 'object', 'properties': {
            **PLOT_PROPERTIES, 'compression': {'type': 'string'},
        }, 'required': list(PLOT_PROPERTIES)}
    elif task == 'episode_findings':
        config['response_json_schema'] = {'type': 'object', 'properties': {'findings': EPISODE_FINDINGS_SCHEMA}, 'required': ['findings']}
    elif task == 'recover_findings':
        config['response_json_schema'] = {'type': 'object', 'properties': {
            'episodes': {'type': 'array', 'items': {'type': 'object', 'properties': {
                'episode': {'type': 'string'}, 'findings': EPISODE_FINDINGS_SCHEMA,
            }, 'required': ['episode', 'findings']}}}, 'required': ['episodes']}
    elif task == 'home_settings':
        config['response_json_schema'] = {'type': 'object', 'properties': {
            'items': {'type': 'array', 'maxItems': 2, 'items': {'type': 'object', 'properties': {
                'kind': {'type': 'string', 'enum': ['world', 'lore']},
                'title': {'type': 'string'}, 'description': {'type': 'string'},
            }, 'required': ['kind', 'title', 'description']}}}, 'required': ['items']}
    elif task == 'reference_setup':
        config['response_json_schema'] = SETUP_SCHEMA
    elif task == 'reference_descriptions':
        config['response_json_schema'] = {'type': 'object', 'properties': {
            'items': {'type': 'array', 'items': {'type': 'object', 'properties': {
                key: {'type': 'string'} for key in ('kind', 'name', 'description', 'evidence')},
                'required': ['name', 'description', 'evidence']}}}, 'required': ['items']}
    elif task in ('references', 'linked_references'):
        fields = {'kind': {'type': 'string', 'enum': ['characters', 'world', 'places', 'lore', 'plot']},
                  'content': {'type': 'string'}, 'impact': {'type': 'string'}, 'summary': {'type': 'string'}}
        if task == 'linked_references':
            fields['conflict'] = {'type': 'string'}
            fields['patches'] = {'type': 'array', 'items': {'type': 'object', 'properties': {
                'old': {'type': 'string'}, 'new': {'type': 'string'},
            }, 'required': ['old', 'new']}}
        config['response_json_schema'] = {'type': 'object', 'properties': {'updates': {'type': 'array', 'items': {
            'type': 'object', 'properties': fields, 'required': ['kind', 'content'],
        }}}, 'required': ['updates']}
    logger = logging.getLogger('storyloom.ai')
    started = time.monotonic()
    finished = threading.Event()

    def heartbeat():
        while not finished.wait(15):
            logger.warning('AI waiting transport=sdk task=%s elapsed=%.1fs (completion not received)',
                           task, time.monotonic() - started)

    logger.warning('AI start transport=sdk mode=%s model=%s task=%s prompt_chars=%d',
                   'stream' if on_progress else 'standard',
                   model if model in ('gemini-3.1-flash-lite', 'gemini-3.5-flash-lite', 'gemini-3.8-flash') else 'custom', task, len(prompt))
    monitor = threading.Thread(target=heartbeat, daemon=True)
    monitor.start()
    try:
        client = get_client(key)
        if on_progress is None:
            response = client.models.generate_content(model=model, contents=prompt, config=types.GenerateContentConfig(**config))
            candidates = response.candidates or []
            finish = candidates[0].finish_reason if candidates else None
            parts = candidates[0].content.parts if candidates and candidates[0].content else []
            text = ''.join(part.text for part in (parts or []) if part.text and not part.thought)
            usage = response.usage_metadata
        else:
            fragments, finish, usage = [], None, None
            for chunk in client.models.generate_content_stream(model=model, contents=prompt, config=types.GenerateContentConfig(**config)):
                if chunk.usage_metadata:
                    usage = chunk.usage_metadata
                for candidate in chunk.candidates or []:
                    if candidate.index not in (None, 0):
                        continue
                    if candidate.finish_reason:
                        finish = candidate.finish_reason
                    for part in (candidate.content.parts or []) if candidate.content else []:
                        if part.text and not part.thought:
                            fragments.append(part.text)
                text = ''.join(fragments)
                if len(text) > 2_000_000:
                    raise ValueError('AI 응답이 너무 큽니다. 요청 범위를 줄여주세요.')
                on_progress(partial_text(text), len(text))
            text = ''.join(fragments)
        if finish != types.FinishReason.STOP:
            raise ValueError('AI 응답이 완성되지 않았습니다. 기존 자료는 유지됩니다. 재시도하세요.')
        parsed = json.loads(text)
        if not isinstance(parsed, dict):
            raise ValueError('AI 응답 형식이 올바르지 않습니다.')
        if task == 'reference_setup':
            parsed = render_reference_setup(parsed)
        elif task in ('first_scene','continuation_scene'):
            passages=parsed.get('passages')
            if not isinstance(passages,list) or len(passages)!=passage_count or any(not isinstance(p,str) or not p.strip() for p in passages):
                raise ValueError(('1화 장면' if task=='first_scene' else '이어쓰기')+' 본문이 완성되지 않았습니다. 저장된 장면은 유지됩니다.')
            parsed={**parsed,'text':'\n\n'.join(p.strip() for p in passages)}
        logger.warning('AI done transport=sdk task=%s elapsed=%.1fs input_tokens=%s output_tokens=%s thinking_tokens=%s',
                       task, time.monotonic() - started, getattr(usage, 'prompt_token_count', 0),
                       getattr(usage, 'candidates_token_count', 0), getattr(usage, 'thoughts_token_count', 0))
        return parsed
    except json.JSONDecodeError:
        raise ValueError('AI 응답 형식이 올바르지 않습니다. 재시도하세요.') from None
    except errors.APIError as exc:
        # Provider text may echo input or credentials; expose numeric status only.
        code = exc.code if isinstance(exc.code, int) else 0
        logger.warning('AI failed transport=sdk task=%s http=%d elapsed=%.1fs', task, code, time.monotonic()-started)
        messages = {
            503: 'Gemini 서버가 일시적으로 혼잡하거나 이용할 수 없습니다 (503). 잠시 후 실패 요청을 재시도하세요.',
            429: 'Gemini 호출 빈도 또는 사용 한도에 도달했습니다 (429). Google AI Studio에서 한도와 재시도 가능 시간을 확인하세요.',
            401: 'Gemini API 인증에 실패했습니다 (401). API 키 설정을 확인하세요.',
            403: 'Gemini API 접근 권한이 없습니다 (403). API 키와 프로젝트 권한을 확인하세요.',
            404: '설정한 Gemini 모델 또는 API 경로를 찾을 수 없습니다 (404). 모델 설정을 확인하세요.',
        }
        error_type = RetryableAIError if code == 429 or code >= 500 else ValueError
        if code == 503:
            error_type = GeminiUnavailable
        raise error_type(messages.get(code, f'Gemini API 요청에 실패했습니다 ({code}). 잠시 후 재시도하세요.') + ' 기존 자료는 유지됩니다.') from None
    except (httpx.TimeoutException, TimeoutError):
        logger.warning('AI timeout transport=sdk task=%s elapsed=%.1fs', task, time.monotonic()-started)
        raise RetryableAIError('Gemini 응답을 180초 안에 받지 못했습니다. 서버에서 계속 처리 중인지는 확인할 수 없습니다. 기존 자료는 유지됩니다.') from None
    except httpx.TransportError:
        logger.warning('AI connection_failed transport=sdk task=%s elapsed=%.1fs', task, time.monotonic()-started)
        raise RetryableAIError('Gemini 연결에 실패했습니다. 기존 자료는 유지됩니다.') from None
    finally:
        finished.set()
        monitor.join(timeout=1)
