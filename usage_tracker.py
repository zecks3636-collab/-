"""COSMAX 인큐베이션 사용량 추적 드랍인 모듈 v2 (Flask + FastAPI).

규칙 SSOT: 인큐베이션 포탈 docs/USAGE-TRACKING.md
- 서버의 신뢰된 SSO/OTP 세션에서만 actor를 읽는다. 브라우저 actor는 받지 않는다.
- env 미설정이면 전송만 no-op이며, 추적 장애는 서비스 동작에 영향을 주지 않는다.
- 표준 라이브러리만 사용한다(웹 프레임워크는 앱이 이미 설치한 것을 사용).
"""

import atexit
import datetime
import inspect
import json
import os
import re
import threading
import urllib.request
from collections.abc import Mapping

_FLUSH_INTERVAL_SEC = 10
_FLUSH_BATCH = 50
_QUEUE_MAX = 1000
_MAX_BEACON_BODY_BYTES = 2048
_EVENT_TYPES = {"page_view", "action", "download", "login"}
_CLIENT_TYPES = {"web", "api", "extension"}
_MUTATION_METHODS = {"POST", "PUT", "PATCH", "DELETE"}
_SESSION_ID_RE = re.compile(r"^[A-Za-z0-9_-]{1,64}$")
_UUID_SEGMENT_RE = re.compile(r"/[0-9a-f]{8}-[0-9a-f-]{27,36}(?=/|$)", re.I)
_HEX_SEGMENT_RE = re.compile(r"/[0-9a-f]{16,}(?=/|$)", re.I)
_NUMBER_SEGMENT_RE = re.compile(r"/\d+(?=/|$)")

_queue = []
_lock = threading.Lock()
_flusher_started = False
_flushing = False


def _config():
    ingest_url = os.environ.get("USAGE_INGEST_URL", "").strip()
    token = os.environ.get("USAGE_INGEST_TOKEN", "").strip()
    return ingest_url, token, bool(ingest_url and token)


def _utc_now_iso():
    return datetime.datetime.now(datetime.timezone.utc).isoformat()


def _value(container, key):
    if isinstance(container, Mapping):
        return container.get(key)
    return getattr(container, key, None) if container is not None else None


def _normalize_actor(value):
    if not isinstance(value, str):
        return None
    actor = value.strip()
    return actor if "@" in actor and len(actor) <= 320 else None


def _actor_from_objects(user=None, session=None):
    """신뢰된 서버 session/user 객체에서 UPN 또는 email을 찾는다."""
    session_user = _value(session, "user")
    candidates = (
        _value(user, "preferred_username"), _value(user, "upn"), _value(user, "email"),
        _value(session, "preferred_username"), _value(session, "upn"),
        _value(session, "user_upn"), _value(session, "user_email"), _value(session, "email"),
        _value(session_user, "preferred_username"), _value(session_user, "upn"),
        _value(session_user, "email"),
    )
    for candidate in candidates:
        actor = _normalize_actor(candidate)
        if actor:
            return actor
    return None


def _actor_from_flask_session():
    try:
        from flask import g, session
        return _actor_from_objects(getattr(g, "user", None), session)
    except Exception:
        return None


def _actor_from_asgi_request(request):
    try:
        user = getattr(request, "user", None)
    except Exception:
        user = None
    try:
        session = request.session
    except Exception:
        session = None
    return _actor_from_objects(user, session)


def _resolve_actor(request=None, resolver=None, fallback=None):
    try:
        actor = _normalize_actor(resolver(request)) if resolver else None
        if actor:
            return actor
    except Exception:
        pass
    return fallback() if fallback else None


async def _resolve_actor_async(request, resolver=None):
    try:
        candidate = resolver(request) if resolver else None
        if inspect.isawaitable(candidate):
            candidate = await candidate
        actor = _normalize_actor(candidate)
        if actor:
            return actor
    except Exception:
        pass
    return _actor_from_asgi_request(request)


def normalize_usage_route(value):
    """query/fragment/식별자 형태의 path segment를 제거한 집계용 route를 만든다."""
    if not isinstance(value, str):
        return None
    route = re.split(r"[?#]", value.strip(), maxsplit=1)[0]
    if (
        not route.startswith("/")
        or "@" in route
        or "%40" in route.lower()
        or any(ord(char) < 32 for char in route)
    ):
        return None
    route = _UUID_SEGMENT_RE.sub("/:id", route)
    route = _HEX_SEGMENT_RE.sub("/:id", route)
    route = _NUMBER_SEGMENT_RE.sub("/:id", route)
    return route[:300] or None


def _normalize_session_id(value):
    return value if isinstance(value, str) and _SESSION_ID_RE.fullmatch(value) else None


def _normalize_client_type(value):
    return value if isinstance(value, str) and value in _CLIENT_TYPES else "web"


def _outcome_for_status(status):
    if status in (401, 403):
        return "DENY"
    return "SUCCESS" if status < 400 else "FAIL"


def _post(events):
    ingest_url, token, enabled = _config()
    if not enabled:
        return
    body = json.dumps({"events": events}).encode("utf-8")
    request = urllib.request.Request(
        ingest_url,
        data=body,
        method="POST",
        headers={"Content-Type": "application/json", "Authorization": "Bearer " + token},
    )
    urllib.request.urlopen(request, timeout=5).read()


def _flush():
    global _flushing
    with _lock:
        if _flushing or not _queue:
            return
        _flushing = True
        batch = _queue[:100]
        del _queue[:100]
    try:
        _post(batch)
    except Exception:
        pass  # 사용량은 근사 지표다. 재시도/에러 전파 없이 드랍한다.
    finally:
        with _lock:
            _flushing = False


def _flusher_loop():
    import time
    while True:
        time.sleep(_FLUSH_INTERVAL_SEC)
        _flush()


def _ensure_flusher():
    global _flusher_started
    if _flusher_started or not _config()[2]:
        return
    with _lock:
        if _flusher_started:
            return
        _flusher_started = True
    threading.Thread(target=_flusher_loop, daemon=True, name="usage-tracker-flush").start()
    atexit.register(_flush)


def track(event_type, detail=None, actor=None, route=None, session_id=None, client_type="web"):
    """의미 있는 page/action/download/login 이벤트를 기록한다."""
    if not _config()[2] or event_type not in _EVENT_TYPES:
        return
    try:
        if actor is None:
            actor = _actor_from_flask_session()
        event = {
            "ts": _utc_now_iso(),
            "event_type": event_type,
            "actor_upn": _normalize_actor(actor) or "anonymous",
            "route": normalize_usage_route(route),
            "session_id": _normalize_session_id(session_id),
            "client_type": _normalize_client_type(client_type),
            "detail": str(detail)[:512] if detail is not None else None,
        }
        with _lock:
            _queue.append(event)
            if len(_queue) > _QUEUE_MAX:
                del _queue[: len(_queue) - _QUEUE_MAX]
            should_flush = len(_queue) >= _FLUSH_BATCH
        _ensure_flusher()
        if should_flush:
            threading.Thread(target=_flush, daemon=True).start()
    except Exception:
        pass  # 추적 코드는 어떤 경우에도 앱을 죽이지 않는다.


def _should_track_api(path, method, mode, prefix):
    normalized_prefix = prefix[:-1] if prefix.endswith("/") else prefix
    under_prefix = path == normalized_prefix or path.startswith(normalized_prefix + "/")
    if mode == "none" or not under_prefix or path.startswith("/api/usage/"):
        return False
    return mode == "all" or method.upper() in _MUTATION_METHODS


def init_usage_tracking(
    app,
    *,
    page_view_mode="server",
    api_tracking="none",
    api_prefix="/api/",
    beacon_path="/api/usage/page-view",
    actor_resolver=None,
):
    """Flask 앱에 자동 계측을 연결한다.

    Flask session/SSO/OTP middleware 설정 뒤, 실제 route 등록 전 호출하는 것을 권장한다.
    """
    from flask import request

    if page_view_mode not in {"server", "browser", "none"}:
        page_view_mode = "server"
    if api_tracking not in {"none", "mutations", "all"}:
        api_tracking = "none"

    if page_view_mode == "browser":
        def _usage_page_view_beacon():
            try:
                fetch_site = request.headers.get("Sec-Fetch-Site")
                if fetch_site and fetch_site not in ("same-origin", "same-site"):
                    return ("", 204, {"Cache-Control": "no-store"})
                if (request.content_length or 0) > _MAX_BEACON_BODY_BYTES:
                    return ("", 204, {"Cache-Control": "no-store"})
                body = request.get_json(silent=True) or {}
                route = normalize_usage_route(body.get("route"))
                if route and not re.match(r"^/(api(?:/|$)|_next(?:/|$)|favicon(?:\.|/|$))", route):
                    track(
                        "page_view",
                        route=route,
                        actor=_resolve_actor(request, actor_resolver, _actor_from_flask_session),
                        session_id=_normalize_session_id(body.get("sessionId")),
                    )
            except Exception:
                pass
            return ("", 204, {"Cache-Control": "no-store"})

        app.add_url_rule(
            beacon_path,
            endpoint="_cosmax_usage_page_view",
            view_func=_usage_page_view_beacon,
            methods=["POST"],
        )

    @app.after_request
    def _usage_after_request(response):
        try:
            path = request.path or "/"
            rule = getattr(getattr(request, "url_rule", None), "rule", None)
            route = normalize_usage_route(rule or path)
            actor = _resolve_actor(request, actor_resolver, _actor_from_flask_session)
            status = response.status_code

            if (
                page_view_mode == "server"
                and request.method == "GET"
                and 200 <= status < 300
                and "text/html" in (response.content_type or "")
                and route
                and not re.match(r"^/(static|api(?:/|$)|health(?:/|$)|favicon|_)", route)
            ):
                track("page_view", route=route, actor=actor)

            if _should_track_api(path, request.method, api_tracking, api_prefix) and route:
                is_download = "attachment" in response.headers.get("Content-Disposition", "").lower()
                track(
                    "download" if is_download else "action",
                    route=route,
                    actor=actor,
                    detail=f"{request.method.upper()} {_outcome_for_status(status)}",
                    client_type="api",
                )
        except Exception:
            pass
        return response

    _ensure_flusher()
    return app


def init_fastapi_usage_tracking(
    app,
    *,
    page_view_mode="server",
    api_tracking="none",
    api_prefix="/api/",
    beacon_path="/api/usage/page-view",
    actor_resolver=None,
):
    """FastAPI/Starlette 앱에 자동 계측을 연결한다."""
    from fastapi import Request, Response

    if page_view_mode not in {"server", "browser", "none"}:
        page_view_mode = "server"
    if api_tracking not in {"none", "mutations", "all"}:
        api_tracking = "none"

    @app.middleware("http")
    async def _usage_middleware(request: Request, call_next):
        response = await call_next(request)
        try:
            path = request.url.path or "/"
            route_object = request.scope.get("route")
            route = normalize_usage_route(getattr(route_object, "path", None) or path)
            actor = await _resolve_actor_async(request, actor_resolver)
            status = response.status_code
            content_type = response.headers.get("content-type", "")

            if (
                page_view_mode == "server"
                and request.method == "GET"
                and 200 <= status < 300
                and "text/html" in content_type
                and route
                and not re.match(r"^/(static|api(?:/|$)|health(?:/|$)|favicon|_)", route)
            ):
                track("page_view", route=route, actor=actor)

            if _should_track_api(path, request.method, api_tracking, api_prefix) and route:
                is_download = "attachment" in response.headers.get("content-disposition", "").lower()
                track(
                    "download" if is_download else "action",
                    route=route,
                    actor=actor,
                    detail=f"{request.method.upper()} {_outcome_for_status(status)}",
                    client_type="api",
                )
        except Exception:
            pass
        return response

    if page_view_mode == "browser":
        @app.post(beacon_path, include_in_schema=False)
        async def _usage_page_view_beacon(request: Request):
            try:
                fetch_site = request.headers.get("sec-fetch-site")
                if fetch_site and fetch_site not in ("same-origin", "same-site"):
                    return Response(status_code=204, headers={"Cache-Control": "no-store"})
                if int(request.headers.get("content-length", "0") or 0) > _MAX_BEACON_BODY_BYTES:
                    return Response(status_code=204, headers={"Cache-Control": "no-store"})
                body = await request.json()
                route = normalize_usage_route(body.get("route") if isinstance(body, Mapping) else None)
                if route and not re.match(r"^/(api(?:/|$)|_next(?:/|$)|favicon(?:\.|/|$))", route):
                    track(
                        "page_view",
                        route=route,
                        actor=await _resolve_actor_async(request, actor_resolver),
                        session_id=_normalize_session_id(body.get("sessionId")),
                    )
            except Exception:
                pass
            return Response(status_code=204, headers={"Cache-Control": "no-store"})

    _ensure_flusher()
    return app
