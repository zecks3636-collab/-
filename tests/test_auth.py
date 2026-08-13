import os
import urllib.parse
import unittest
from unittest import mock

from fastapi import FastAPI
from fastapi.testclient import TestClient

import auth


class MemoryStore:
    def __init__(self):
        self.states = {}
        self.sessions = {}

    def put_state(self, state, return_url):
        self.states[state] = return_url

    def consume_state(self, state):
        return self.states.pop(state, None)

    def put_session(self, session_id, user):
        self.sessions[session_id] = user

    def get_session(self, session_id):
        return self.sessions.get(session_id)

    def delete_session(self, session_id):
        self.sessions.pop(session_id, None)


class AuthTests(unittest.TestCase):
    def setUp(self):
        self.env = mock.patch.dict(os.environ, {
            "APP_ENV": "test",
            "SSO_REDIRECT_URI": "http://localhost:8080/auth/callback",
            "AZURE_SSO_SECRET": (
                '{"AZURE_TENANT_ID":"tenant","AZURE_CLIENT_ID":"client",'
                '"AZURE_CLIENT_SECRET":"not-a-real-secret"}'
            ),
        }, clear=False)
        self.env.start()
        self.addCleanup(self.env.stop)
        self.store = MemoryStore()
        app = FastAPI()

        @app.get("/")
        def root():
            return {"ok": True}

        @app.post("/_test/write")
        def write():
            return {"ok": True}

        auth.install_auth(app, lambda: None, store=self.store)
        self.client = TestClient(app)
        self.addCleanup(self.client.close)

    def _start(self, path="/login"):
        response = self.client.get(path, follow_redirects=False)
        query = urllib.parse.parse_qs(urllib.parse.urlsplit(response.headers["location"]).query)
        return response, query

    def _finish(self, return_url="/"):
        _, query = self._start("/login?return_url=" + urllib.parse.quote(return_url, safe=""))
        state = query["state"][0]
        claims = {
            "tid": "tenant", "oid": "object-id", "preferred_username": "user@cosmax.com",
            "email": "user@cosmax.com", "name": "Verified User",
        }
        with mock.patch.object(auth, "_exchange_code", return_value={"id_token_claims": claims}):
            return self.client.get(
                f"/auth/callback?code=code&state={urllib.parse.quote(state)}",
                follow_redirects=False,
            ), state

    def test_protected_routes_redirect_or_return_401(self):
        web = self.client.get("/", follow_redirects=False)
        api = self.client.post("/api/auth/me")
        self.assertEqual(web.status_code, 303)
        self.assertTrue(web.headers["location"].startswith("/login?return_url="))
        self.assertEqual(api.status_code, 401)

    def test_default_login_has_no_prompt_and_switch_has_select_account(self):
        default, default_query = self._start()
        switched, switched_query = self._start("/login?select_account=1")
        self.assertEqual(default.status_code, 303)
        self.assertNotIn("prompt", default_query)
        self.assertEqual(switched_query["prompt"], ["select_account"])
        self.assertEqual(default_query["scope"], ["openid profile email"])
        self.assertIn("HttpOnly", default.headers["set-cookie"])
        self.assertIn("SameSite=lax", default.headers["set-cookie"])

    def test_production_cookie_is_secure(self):
        with mock.patch.dict(os.environ, {
            "APP_ENV": "production", "SSO_REDIRECT_URI": auth.PRODUCTION_REDIRECT_URI,
        }):
            response, _ = self._start()
        self.assertIn("Secure", response.headers["set-cookie"])

    def test_state_is_required_single_use_and_checked_before_exchange(self):
        _, query = self._start()
        state = query["state"][0]
        with mock.patch.object(auth, "_exchange_code") as exchange:
            missing = self.client.get("/auth/callback?code=code")
            exchange.assert_not_called()
        self.assertEqual(missing.status_code, 400)

        # Start again because a failed callback clears the state cookie.
        _, query = self._start()
        state = query["state"][0]
        with mock.patch.object(auth, "_exchange_code") as exchange:
            mismatch = self.client.get("/auth/callback?code=code&state=wrong")
            exchange.assert_not_called()
        self.assertEqual(mismatch.status_code, 400)

        result, used_state = self._finish()
        self.assertEqual(result.status_code, 303)
        with mock.patch.object(auth, "_exchange_code") as exchange:
            replay = self.client.get(f"/auth/callback?code=code&state={used_state}")
            exchange.assert_not_called()
        self.assertEqual(replay.status_code, 400)

    def test_verified_session_is_opaque_and_supports_me_logout_and_csrf(self):
        response, _ = self._finish("/dashboard?tab=one")
        self.assertEqual(response.headers["location"], "/dashboard?tab=one")
        session_id = self.client.cookies.get(auth.SESSION_COOKIE)
        self.assertIn(session_id, self.store.sessions)
        self.assertNotIn("user@cosmax.com", session_id)

        me = self.client.get("/api/auth/me")
        self.assertEqual(me.status_code, 200)
        self.assertEqual(me.json()["preferred_username"], "user@cosmax.com")
        denied = self.client.post("/_test/write", headers={"Origin": "https://evil.example"})
        allowed = self.client.post(
            "/_test/write", headers={"Origin": "http://localhost:8080"}
        )
        self.assertEqual(denied.status_code, 403)
        self.assertEqual(allowed.status_code, 200)

        logout = self.client.get("/logout", follow_redirects=False)
        self.assertEqual(logout.headers["location"], "/login?select_account=1")
        self.assertNotIn(session_id, self.store.sessions)

    def test_open_redirect_is_rejected(self):
        _, query = self._start("/login?return_url=https://evil.example/steal")
        state = query["state"][0]
        self.assertEqual(self.store.states[state], "/")


if __name__ == "__main__":
    unittest.main()
