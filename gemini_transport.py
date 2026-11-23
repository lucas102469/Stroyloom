"""Compare HTTP clients without putting credentials in process arguments or files."""
import json
import shutil
import subprocess


class TransportFailure(Exception):
    def __init__(self, category, status=None):
        self.category, self.status = category, status
        super().__init__(category)


def curl_request(url, body, key, timeout=30, ipv4=False):
    executable = shutil.which('curl.exe') or shutil.which('curl')
    if not executable:
        raise TransportFailure('CURL_UNAVAILABLE')
    # curl reads secrets from stdin, never command-line arguments or temp files.
    config = '\n'.join([
        'url = ' + json.dumps(url),
        'header = ' + json.dumps('Content-Type: application/json'),
        'header = ' + json.dumps('x-goog-api-key: ' + key),
        'data-binary = ' + json.dumps(json.dumps(body, ensure_ascii=False), ensure_ascii=False),
    ])
    args = [executable, '--config', '-', '--silent', '--show-error',
            '--connect-timeout', '10', '--max-time', str(timeout),
            '--write-out', '\nSTORYLOOM_HTTP:%{http_code}']
    if ipv4:
        args.append('--ipv4')
    try:
        completed = subprocess.run(args, input=config.encode('utf-8'), capture_output=True,
                                   timeout=timeout + 5,
                                   creationflags=getattr(subprocess, 'CREATE_NO_WINDOW', 0))
    except subprocess.TimeoutExpired:
        raise TransportFailure('TIMEOUT') from None
    if completed.returncode:
        categories = {28: 'TIMEOUT', 6: 'DNS_ERROR', 7: 'CONNECT_ERROR',
                      35: 'TLS_ERROR', 60: 'CERTIFICATE_ERROR'}
        raise TransportFailure(categories.get(completed.returncode, 'CURL_ERROR'))
    payload, separator, code = completed.stdout.rpartition(b'\nSTORYLOOM_HTTP:')
    if not separator or not code.isdigit():
        raise TransportFailure('INVALID_HTTP_RESPONSE')
    status = int(code)
    if status != 200:
        raise TransportFailure('HTTP_ERROR', status)
    return json.loads(payload)
