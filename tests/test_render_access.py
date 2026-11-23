"""Deployment access regression tests. Temporary DBs and fake AI only."""
import sys
sys.dont_write_bytecode = True
import json
import os
import sqlite3
import tempfile
import time
import unittest
from contextlib import closing
from pathlib import Path
from unittest.mock import patch

from app import create_app

HOST = 'storyloom-test.onrender.com'
BASE = 'https://' + HOST

class RenderAccessTests(unittest.TestCase):
    def setUp(self):
        self.folder = tempfile.TemporaryDirectory()
        self.database = str(Path(self.folder.name) / 'test.sqlite3')
        self.env = patch.dict(os.environ, {'RENDER_EXTERNAL_HOSTNAME': HOST})
        self.env.start()
        self.calls = []
        def fake_ai(prompt):
            self.calls.append(prompt)
            return {'reply': '테스트 답변', 'updates': []}
        self.app = create_app(self.database, fake_ai, auth_required=True)
        self.app.testing = True
        self.owner = self.app.test_client()
        self.guest = self.app.test_client()
        self.other = self.app.test_client()

    def tearDown(self):
        self.app.extensions['storyloom_workers'].shutdown(wait=True)
        self.env.stop()
        self.folder.cleanup()

    def get(self, client, path):
        return client.get(path, base_url=BASE)

    def post(self, client, path, data):
        return client.post(path, json=data, base_url=BASE, headers={'Origin': BASE})

    def signup(self, client, name):
        response = self.post(client, '/api/auth/register', {
            'username': name, 'nickname': name, 'password': 'TestPass123!',
            'password_confirm': 'TestPass123!'})
        self.assertEqual(response.status_code, 200)
        return response

    def project(self):
        self.signup(self.owner, 'owner')
        response = self.post(self.owner, '/api/projects', {'title': 'Private'})
        self.assertEqual(response.status_code, 200)
        return response.json['id']

    def seed_publication(self, pid):
        with closing(sqlite3.connect(self.database)) as con, con:
            con.execute('INSERT INTO published_works(id,project,metadata,episodes,updated) VALUES(?,?,?,?,?)',
                        ('public-work', pid, json.dumps({'id': 'public-work', 'title': 'Published'}),
                         json.dumps([{'number': 1, 'title': 'First', 'text': 'Public text'}]), time.time()))

    def test_render_and_local_pages_and_assets(self):
        for base in (BASE, 'http://localhost', 'http://127.0.0.1:5000'):
            with self.subTest(base=base):
                response = self.guest.get('/', base_url=base)
                self.assertEqual(response.status_code, 200)
                self.assertIn(b'Storyloom', response.data)
        with self.get(self.guest, '/static/studio-ui.js') as response:
            self.assertEqual(response.status_code, 200)

    def test_unknown_hosts_and_spoofed_forwarded_host_rejected(self):
        for base in ('https://other.onrender.com', 'https://' + HOST + '.evil.test'):
            self.assertEqual(self.guest.get('/', base_url=base).status_code, 403)
        self.assertEqual(self.guest.get('/', base_url='https://evil.test',
            headers={'X-Forwarded-Host': HOST}).status_code, 403)

    def test_no_environment_keeps_local_only_default(self):
        with patch.dict(os.environ, {'RENDER_EXTERNAL_HOSTNAME': ''}):
            app = create_app(str(Path(self.folder.name) / 'local.sqlite3'), lambda _: {}, auth_required=True)
            try:
                client = app.test_client()
                self.assertEqual(client.get('/').status_code, 200)
                self.assertEqual(client.get('/', base_url=BASE).status_code, 403)
                self.assertFalse(app.config['SESSION_COOKIE_SECURE'])
            finally:
                app.extensions['storyloom_workers'].shutdown(wait=True)

    def test_anonymous_generation_and_private_apis_require_login(self):
        routes = [('/api/projects/x/chat', {'request_id': 'test-request', 'text': 'Generate'}),
                  ('/api/projects/x/episode-batch', {}),
                  ('/api/projects/x/branch-setup', {}),
                  ('/api/projects/x/revision-impact', {}),
                  ('/api/projects/x/episode-settings-review', {}),
                  ('/api/discover/works/x/branch', {'episode': 1})]
        for path, payload in routes:
            self.assertEqual(self.post(self.guest, path, payload).status_code, 401, path)
        self.assertEqual(self.get(self.guest, '/api/projects').status_code, 401)
        self.assertEqual(self.calls, [])

    def test_signup_login_logout_and_cookie_flags(self):
        response = self.signup(self.owner, 'owner')
        cookie = response.headers['Set-Cookie']
        for flag in ('Secure', 'HttpOnly', 'SameSite=Strict'):
            self.assertIn(flag, cookie)
        self.assertTrue(self.get(self.owner, '/api/auth/session').json['logged_in'])
        self.assertEqual(self.post(self.owner, '/api/auth/logout', {}).status_code, 200)
        self.assertEqual(self.get(self.owner, '/api/projects').status_code, 401)
        self.assertEqual(self.post(self.owner, '/api/auth/login', {
            'username': 'owner', 'password': 'TestPass123!'}).status_code, 200)
        self.assertEqual(self.get(self.owner, '/api/projects').status_code, 200)

    def test_other_users_cannot_read_modify_export_or_generate(self):
        pid = self.project()
        self.signup(self.other, 'reader')
        self.assertEqual(self.get(self.other, '/api/projects').json, [])
        for suffix in ('', '/versions', '/setting-history', '/export'):
            self.assertEqual(self.get(self.other, '/api/projects/' + pid + suffix).status_code, 400)
        for suffix, body in [('/chat', {'request_id': 'blocked-request', 'text': 'Generate'}),
                             ('/manage', {'title': 'Stolen'}), ('/edit', {'kind': 'plan', 'text': 'Changed'})]:
            self.assertEqual(self.post(self.other, '/api/projects/' + pid + suffix, body).status_code, 400)
        self.assertEqual(self.get(self.owner, '/api/projects/' + pid).status_code, 200)
        self.assertEqual(self.calls, [])

    def test_public_reading_allowed_but_mutations_protected(self):
        pid = self.project()
        self.seed_publication(pid)
        self.assertEqual(self.get(self.guest, '/api/discover/works').status_code, 200)
        public = self.get(self.guest, '/api/discover/works/public-work')
        self.assertEqual(public.status_code, 200)
        self.assertNotIn('manageProject', public.json)
        self.assertEqual(self.post(self.guest, '/api/discover/works/public-work/episodes/1/view', {}).status_code, 200)
        self.assertEqual(self.post(self.guest, '/api/discover/works/public-work/progress', {
            'episode': 1, 'scroll': 0, 'ratio': 0, 'width': 1000, 'updated': time.time()}).status_code, 200)
        for suffix in ('/like', '/comments', '/branch', '/branch-permission'):
            self.assertEqual(self.post(self.guest, '/api/discover/works/public-work' + suffix, {}).status_code, 401)
        self.signup(self.other, 'reader')
        self.assertEqual(self.post(self.other, '/api/discover/works/public-work/branch-permission', {'allowed': True}).status_code, 400)
        self.assertEqual(self.calls, [])

    def test_origin_and_content_type_guards_unchanged(self):
        self.signup(self.owner, 'owner')
        for origin in ('https://evil.test', 'https://other.onrender.com'):
            r = self.owner.post('/api/projects', base_url=BASE, json={'title': 'Blocked'}, headers={'Origin': origin})
            self.assertEqual(r.status_code, 403)
        self.assertEqual(self.owner.post('/api/projects', base_url=BASE, data='{}', content_type='text/plain', headers={'Origin': BASE}).status_code, 403)
        self.assertEqual(self.owner.post('/api/projects', base_url=BASE, json=[], headers={'Origin': BASE}).status_code, 400)
        # Existing JSON clients without Origin remain supported.
        self.assertEqual(self.owner.post('/api/projects', base_url=BASE, json={'title': 'JSON'}).status_code, 200)

    def test_same_origin_form_export_still_works(self):
        pid = self.project()
        path = '/api/projects/' + pid + '/export'
        self.assertEqual(self.owner.post(path, base_url=BASE, data={'format': 'json'}, headers={'Origin': BASE}).status_code, 200)
        self.assertEqual(self.owner.post(path, base_url=BASE, data={'format': 'json'}, headers={'Origin': 'https://evil.test'}).status_code, 403)

    def test_authenticated_owner_can_generate_with_fake_ai(self):
        pid = self.project()
        response = self.post(self.owner, '/api/projects/' + pid + '/chat', {
            'request_id': 'allowed-owner-request', 'text': '안녕'})
        self.assertEqual(response.status_code, 200, response.json)
        self.assertGreater(len(self.calls), 0)

    def test_session_survives_app_recreation_with_same_files(self):
        self.signup(self.owner, 'owner')
        cookie = self.owner.get_cookie('session', domain=HOST)
        recreated = create_app(self.database, lambda _: {}, auth_required=True)
        try:
            client = recreated.test_client()
            client.set_cookie('session', cookie.value, domain=HOST)
            self.assertEqual(client.get('/api/projects', base_url=BASE).status_code, 200)
            self.assertTrue(recreated.config['SESSION_COOKIE_SECURE'])
        finally:
            recreated.extensions['storyloom_workers'].shutdown(wait=True)

    def test_deleted_and_forged_sessions_rejected(self):
        self.signup(self.owner, 'owner')
        with closing(sqlite3.connect(self.database)) as con, con:
            con.execute('DELETE FROM users')
        self.assertEqual(self.get(self.owner, '/api/projects').status_code, 401)
        self.guest.set_cookie('session', 'forged', domain=HOST)
        self.assertEqual(self.get(self.guest, '/api/projects').status_code, 401)

if __name__ == '__main__':
    unittest.main()
