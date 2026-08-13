"""COSMAX Entra Authorization Code login with shared server-side sessions."""

import hashlib
import hmac
import json
import os
import secrets
import time
import urllib.parse
import uuid

import msal
from fastapi import HTTPException, Request
from fastapi.responses import JSONResponse, RedirectResponse
from starlette.middleware.base import BaseHTTPMiddleware

PRODUCTION_REDIRECT_URI = "https://jhlee01.cosmaxhub.com/auth/callback"
SESSION_COOKIE = "bti_session"
STATE_COOKIE = "bti_oauth_state"
SESSION_MAX_AGE = 8 * 60 * 60
STATE_MAX_AGE = 10 * 60

PUBLIC_PATHS = frozenset({
    "/health", "/favicon.ico", "/login", "/auth/callback", "/logout",
})
# Compatibility allowlist only; path membership never proves an audit actor.
AUTOMATION_PATHS = frozenset({
    "/api/menu_auto", "/api/menu_auto_b64", "/api/menu_auto_drive",
    "/api/menu_auto_poll", "/api/schedule_imports/submit",
    "/api/schedule_imports/poll",
})
STATIC_SUFFIXES = (".css", ".js", ".png", ".jpg", ".jpeg", ".gif", ".svg", ".ico", ".woff", ".woff2")


def _is_production():
    return os.environ.get("APP_ENV", "production").lower() not in {"local", "development", "test"}


def _redirect_uri():
    value = os.environ.get("SSO_REDIRECT_URI", PRODUCTION_REDIRECT_URI).strip()
    if _is_production() and value != PRODUCTION_REDIRECT_URI:
        raise RuntimeError("production SSO_REDIRECT_URI does not match the registered callback")
    return value


def _load_sso_config():
    try:
        value = json.loads(os.environ.get("AZURE_SSO_SECRET", ""))
    except (TypeError, json.JSONDecodeError):
        return None
    keys = ("AZURE_TENANT_ID", "AZURE_CLIENT_ID", "AZURE_CLIENT_SECRET")
    if not isinstance(value, dict) or not all(
        isinstance(value.get(key), str) and value[key].strip() for key in keys
    ):
        return None
    return {key: value[key].strip() for key in keys}


def _token_hash(token):
    return hashlib.sha256(token.encode("utf-8")).digest()


class PostgresAuthStore:
    """Shared, replay-resistant state/session storage for App Runner instances."""

    def __init__(self, get_conn):
        self.get_conn = get_conn
        self._ready = False

    def _ensure(self):
        if self._ready:
            return
        with self.get_conn() as conn:
            with conn.cursor() as cur:
                cur.execute("""
                    CREATE TABLE IF NOT EXISTS auth_oidc_states (
                        state_hash BYTEA PRIMARY KEY,
                        return_url TEXT NOT NULL,
                        expires_at TIMESTAMPTZ NOT NULL
                    )
                """)
                cur.execute("""
                    CREATE TABLE IF NOT EXISTS auth_sessions (
                        session_hash BYTEA PRIMARY KEY,
                        user_json JSONB NOT NULL,
                        expires_at TIMESTAMPTZ NOT NULL
                    )
                """)
            conn.commit()
        self._ready = True

    def put_state(self, state, return_url):
        self._ensure()
        with self.get_conn() as conn:
            with conn.cursor() as cur:
                cur.execute("DELETE FROM auth_oidc_states WHERE expires_at <= now()")
                cur.execute(
                    "INSERT INTO auth_oidc_states (state_hash, return_url, expires_at) "
                    "VALUES (%s, %s, now() + interval '10 minutes')",
                    (_token_hash(state), return_url),
                )
            conn.commit()

    def consume_state(self, state):
        self._ensure()
        with self.get_conn() as conn:
            with conn.cursor() as cur:
                cur.execute(
                    "DELETE FROM auth_oidc_states WHERE state_hash=%s AND expires_at > now() "
                    "RETURNING return_url",
                    (_token_hash(state),),
                )
                row = cur.fetchone()
            conn.commit()
        return row[0] if row else None

    def put_session(self, session_id, user):
        self._ensure()
        with self.get_conn() as conn:
            with conn.cursor() as cur:
                cur.execute("DELETE FROM auth_sessions WHERE expires_at <= now()")
                cur.execute(
                    "INSERT INTO auth_sessions (session_hash, user_json, expires_at) "
                    "VALUES (%s, %s::jsonb, now() + interval '8 hours')",
                    (_token_hash(session_id), json.dumps(user, separators=(",", ":"))),
                )
            conn.commit()

    def get_session(self, session_id):
        if not session_id:
            return None
        self._ensure()
        with self.get_conn() as conn:
            with conn.cursor() as cur:
                cur.execute(
                    "SELECT user_json FROM auth_sessions WHERE session_hash=%s AND expires_at > now()",
                    (_token_hash(session_id),),
                )
                row = cur.fetchone()
        value = row[0] if row else None
        if isinstance(value, str):
            try:
                value = json.loads(value)
            except json.JSONDecodeError:
                return None
        return value if isinstance(value, dict) else None

    def delete_session(self, session_id):
        if not session_id:
            return
        self._ensure()
        with self.get_conn() as conn:
            with conn.cursor() as cur:
                cur.execute("DELETE FROM auth_sessions WHERE session_hash=%s", (_token_hash(session_id),))
            conn.commit()


def _safe_return_url(value):
    if not isinstance(value, str) or not value.startswith("/") or value.startswith("//"):
        return "/"
    parsed = urllib.parse.urlsplit(value)
    if parsed.scheme or parsed.netloc or "\\" in value or any(ord(char) < 32 for char in value):
        return "/"
    return urllib.parse.urlunsplit(("", "", parsed.path or "/", parsed.query, ""))


def _authorize_url(config, state, select_account=False):
    params = {
        "client_id": config["AZURE_CLIENT_ID"],
        "response_type": "code",
        "response_mode": "query",
        "redirect_uri": _redirect_uri(),
        "scope": "openid profile email",
        "state": state,
    }
    if select_account:
        params["prompt"] = "select_account"
    tenant = urllib.parse.quote(config["AZURE_TENANT_ID"], safe="")
    return f"https://login.microsoftonline.com/{tenant}/oauth2/v2.0/authorize?{urllib.parse.urlencode(params)}"


def _exchange_code(config, code):
    client = msal.ConfidentialClientApplication(
        config["AZURE_CLIENT_ID"],
        authority=f"https://login.microsoftonline.com/{config['AZURE_TENANT_ID']}",
        client_credential=config["AZURE_CLIENT_SECRET"],
        exclude_scopes=["offline_access"],
    )
    return client.acquire_token_by_authorization_code(
        code, scopes=["email"], redirect_uri=_redirect_uri()
    )


def _identity_from_result(result, tenant_id):
    claims = result.get("id_token_claims") if isinstance(result, dict) else None
    if not isinstance(claims, dict):
        return None
    claim_tenant = claims.get("tid")
    if claim_tenant and not hmac.compare_digest(str(claim_tenant).lower(), tenant_id.lower()):
        return None
    subject = claims.get("oid") or claims.get("sub")
    username = claims.get("preferred_username") or claims.get("upn") or claims.get("email")
    if not isinstance(subject, str) or not subject or not isinstance(username, str) or "@" not in username:
        return None
    return {
        "sub": subject,
        "preferred_username": username,
        "email": claims.get("email") if isinstance(claims.get("email"), str) else username,
        "name": claims.get("name") if isinstance(claims.get("name"), str) else "",
        "user_uuid": str(uuid.uuid5(uuid.NAMESPACE_URL, f"entra:{tenant_id}:{subject}")),
        "login_type": "sso",
        "iat": int(time.time()),
    }


def _set_cookie(response, key, value, max_age):
    response.set_cookie(
        key, value, max_age=max_age, httponly=True, secure=_is_production(),
        samesite="lax", path="/",
    )


def _clear_auth_cookies(response):
    for key in (SESSION_COOKIE, STATE_COOKIE):
        response.delete_cookie(
            key, path="/", httponly=True, secure=_is_production(), samesite="lax"
        )


def _same_origin(request):
    configured = urllib.parse.urlsplit(_redirect_uri())
    expected = f"{configured.scheme}://{configured.netloc}"
    origin = request.headers.get("origin")
    if origin:
        return hmac.compare_digest(origin.rstrip("/"), expected)
    referer = request.headers.get("referer")
    if referer:
        parsed = urllib.parse.urlsplit(referer)
        return hmac.compare_digest(f"{parsed.scheme}://{parsed.netloc}", expected)
    return request.headers.get("sec-fetch-site") in {"same-origin", "same-site"}


class AuthMiddleware(BaseHTTPMiddleware):
    def __init__(self, app, store):
        super().__init__(app)
        self.store = store

    async def dispatch(self, request: Request, call_next):
        path = request.url.path
        is_public_automation = path in AUTOMATION_PATHS
        request.state.user = self.store.get_session(request.cookies.get(SESSION_COOKIE))
        is_public = (
            path in PUBLIC_PATHS
            or is_public_automation
            or path.endswith(STATIC_SUFFIXES)
        )
        if not is_public and request.state.user is None:
            if path.startswith("/api/"):
                return JSONResponse({"detail": "authentication required"}, status_code=401)
            target = urllib.parse.quote(_safe_return_url(path), safe="")
            return RedirectResponse(f"/login?return_url={target}", status_code=303)
        if (
            request.state.user
            and not is_public_automation
            and request.method in {"POST", "PUT", "PATCH", "DELETE"}
            and not _same_origin(request)
        ):
            return JSONResponse({"detail": "cross-site request rejected"}, status_code=403)
        return await call_next(request)


def install_auth(app, get_conn, store=None):
    store = store or PostgresAuthStore(get_conn)
    app.add_middleware(AuthMiddleware, store=store)

    @app.get("/health", include_in_schema=False)
    def health():
        return {"status": "ok"}

    @app.get("/login", include_in_schema=False)
    def login(request: Request, return_url: str = "/", select_account: int = 0):
        destination = _safe_return_url(return_url)
        if request.state.user and not select_account:
            return RedirectResponse(destination, status_code=303)
        config = _load_sso_config()
        if config is None:
            raise HTTPException(status_code=503, detail="SSO is not configured")
        state = secrets.token_urlsafe(32)
        store.put_state(state, destination)
        response = RedirectResponse(_authorize_url(config, state, bool(select_account)), status_code=303)
        _set_cookie(response, STATE_COOKIE, state, STATE_MAX_AGE)
        return response

    @app.get("/auth/callback", include_in_schema=False)
    def callback(request: Request, code: str = "", state: str = ""):
        cookie_state = request.cookies.get(STATE_COOKIE, "")
        if not code or not state or not cookie_state or not hmac.compare_digest(cookie_state, state):
            response = JSONResponse({"detail": "invalid or expired login state"}, status_code=400)
            _clear_auth_cookies(response)
            return response
        return_url = store.consume_state(state)
        if return_url is None:
            response = JSONResponse({"detail": "invalid or expired login state"}, status_code=400)
            _clear_auth_cookies(response)
            return response
        config = _load_sso_config()
        if config is None:
            raise HTTPException(status_code=503, detail="SSO is not configured")
        try:
            result = _exchange_code(config, code)
        except Exception:
            response = JSONResponse({"detail": "identity provider unavailable"}, status_code=502)
            _clear_auth_cookies(response)
            return response
        identity = _identity_from_result(result, config["AZURE_TENANT_ID"])
        if identity is None:
            response = JSONResponse({"detail": "identity verification failed"}, status_code=401)
            _clear_auth_cookies(response)
            return response
        session_id = secrets.token_urlsafe(32)
        store.put_session(session_id, identity)
        response = RedirectResponse(_safe_return_url(return_url), status_code=303)
        _set_cookie(response, SESSION_COOKIE, session_id, SESSION_MAX_AGE)
        response.delete_cookie(
            STATE_COOKIE, path="/", httponly=True, secure=_is_production(), samesite="lax"
        )
        from usage_tracker import track
        track("login", actor=identity["preferred_username"], detail="SSO", route="/auth/callback")
        return response

    @app.get("/logout", include_in_schema=False)
    def logout(request: Request):
        store.delete_session(request.cookies.get(SESSION_COOKIE))
        response = RedirectResponse("/login?select_account=1", status_code=303)
        _clear_auth_cookies(response)
        return response

    @app.get("/api/auth/me", include_in_schema=False)
    def me(request: Request):
        return {
            key: request.state.user.get(key)
            for key in ("preferred_username", "email", "name", "login_type")
        }
