"""FastAPI용 COSMAX Audit SDK 1·2계층 연결부.

요청마다 서버가 새 request/trace UUID를 만들고, route template registry에 있는
업무 API만 기록한다. 검증 marker가 없는 호출은 항상 ANONYMOUS다.
"""

import contextvars
import re
import time
import uuid
from dataclasses import dataclass
from functools import partial
from typing import Optional

from starlette.background import BackgroundTask, BackgroundTasks
from starlette.concurrency import run_in_threadpool
from starlette.responses import Response

from audit_registry import AUTO_LAYER2_ROUTE_ACTIONS, LAYER1_COVERED_ROUTES
from audit_sdk import record_audit


@dataclass
class AuditRequestContext:
    request: object
    request_id: str
    trace_id: str
    verified_actor: Optional[dict] = None
    business_outcome: Optional[str] = None


_AUDIT_CONTEXT: contextvars.ContextVar[Optional[AuditRequestContext]] = contextvars.ContextVar(
    "bti_schedule_audit_context",
    default=None,
)
_ROUTE_PARAM_RE = re.compile(r"\{([A-Za-z_][A-Za-z0-9_]*)(?::[^}]+)?\}")
_OUTCOMES = {"SUCCESS", "FAIL", "DENY"}

# 루트 StaticFiles가 서버 디렉터리를 서빙하므로 신규 감사 파일과 기존 서버 설정을
# 정적 응답에서 명시적으로 차단한다.
_SERVER_ONLY_PATHS = frozenset({
    "/apprunner.yaml",
    "/auth.py",
    "/audit_integration.py",
    "/audit_registry.py",
    "/audit_sdk.py",
    "/migration.sql",
    "/requirements-dev.txt",
    "/requirements.txt",
    "/server.py",
    "/usage_tracker.py",
})
_SERVER_ONLY_PREFIXES = ("/.git/", "/__pycache__/", "/docs/", "/tests/")


def _route_registry_key(request) -> Optional[tuple]:
    route = request.scope.get("route")
    path = getattr(route, "path", None)
    if not isinstance(path, str):
        return None
    return request.method.upper(), path


def _expected_route_matches(context, expected_route) -> bool:
    if expected_route is None:
        return True
    return bool(context and _route_registry_key(context.request) == expected_route)


def mark_verified_service(service_id: str, *, expected_route=None) -> None:
    """별도 machine credential 검증 뒤에만 SERVICE marker를 남긴다."""
    context = _AUDIT_CONTEXT.get()
    principal = str(service_id or "").strip()
    if context and principal and _expected_route_matches(context, expected_route):
        context.verified_actor = {"type": "SERVICE", "service_id": principal}


def mark_business_outcome(outcome: str, *, expected_route=None) -> None:
    """HTTP 200 안의 terminal 업무 실패처럼 status와 다른 2계층 결과를 표시한다."""
    context = _AUDIT_CONTEXT.get()
    normalized = str(outcome or "").upper()
    if (
        context
        and normalized in _OUTCOMES
        and _expected_route_matches(context, expected_route)
    ):
        context.business_outcome = normalized


def _actor_from_context() -> dict:
    context = _AUDIT_CONTEXT.get()
    if context and context.verified_actor:
        return context.verified_actor
    if context:
        if getattr(context.request.state, "audit_actor_type", None) == "SYSTEM":
            return {"type": "SYSTEM"}
        user = getattr(context.request.state, "user", None)
        user_uuid = user.get("user_uuid") if isinstance(user, dict) else None
        if user_uuid:
            return {"type": "USER", "user_uuid": user_uuid}
    return {"type": "ANONYMOUS"}


def _safe_record_audit(**event) -> dict:
    try:
        return record_audit(strict=False, **event)
    except Exception as exc:
        return {
            "accepted": False,
            "reason": "integration_error",
            "error": type(exc).__name__,
        }


def _route_template(request) -> Optional[str]:
    route = request.scope.get("route")
    path = getattr(route, "path", None)
    if not isinstance(path, str):
        return None
    return _ROUTE_PARAM_RE.sub(r":\1", path)


def _canonical_action(method: str) -> str:
    return {
        "GET": "READ",
        "HEAD": "READ",
        "POST": "CREATE",
        "PUT": "UPDATE",
        "PATCH": "UPDATE",
        "DELETE": "DELETE",
    }.get(method, "EXECUTE")


def _http_outcome(status: int) -> str:
    if status in (401, 403):
        return "DENY"
    return "SUCCESS" if 200 <= status < 400 else "FAIL"


def _duration_ms(started: float) -> int:
    return max(0, int((time.perf_counter() - started) * 1000))


def _http_metadata(request, route, status, started):
    return {
        "method": request.method.upper(),
        "path": route,
        "status": status,
        "duration_ms": _duration_ms(started),
    }


def _layer1_event(request, *, status, started, request_id, trace_id):
    key = _route_registry_key(request)
    if request.method.upper() == "OPTIONS" or key not in LAYER1_COVERED_ROUTES:
        return None
    route = _route_template(request)
    if not route:
        return None
    method = request.method.upper()
    return {
        "log_type": "API_AUDIT",
        "actor": _actor_from_context(),
        "action": _canonical_action(method),
        "business_action": "API_REQUEST",
        "target": {"type": "api_route", "id": f"{method} {route}"[:200]},
        "outcome": _http_outcome(status),
        "request_id": request_id,
        "trace_id": trace_id,
        "http": _http_metadata(request, route, status, started),
    }


def _layer2_event(request, *, status, started, request_id, trace_id):
    config = AUTO_LAYER2_ROUTE_ACTIONS.get(_route_registry_key(request))
    if not config:
        return None
    route = _route_template(request)
    if not route:
        return None
    context = _AUDIT_CONTEXT.get()
    outcome = (
        context.business_outcome
        if context and context.business_outcome
        else _http_outcome(status)
    )
    return {
        "log_type": config["log_type"],
        "actor": _actor_from_context(),
        "action": config["action"],
        "business_action": config["business_action"],
        "target": {
            "type": config["target_type"],
            "id": config["target_id"],
        },
        "outcome": outcome,
        "request_id": request_id,
        "trace_id": trace_id,
        "http": _http_metadata(request, route, status, started),
    }


def _append_background(response, callback) -> None:
    existing = response.background
    if existing is None:
        response.background = BackgroundTask(callback)
        return
    tasks = BackgroundTasks()
    tasks.tasks.append(existing)
    tasks.add_task(callback)
    response.background = tasks


def _is_server_only_path(path: str) -> bool:
    if path in _SERVER_ONLY_PATHS:
        return True
    return any(path.startswith(prefix) for prefix in _SERVER_ONLY_PREFIXES)


def init_fastapi_api_audit(app):
    """FastAPI 업무 route를 fail-isolated 1·2계층 감사로 감싼다."""
    from fastapi import Request

    @app.middleware("http")
    async def _audit_middleware(request: Request, call_next):
        if _is_server_only_path(request.url.path):
            return Response(status_code=404, headers={"Cache-Control": "no-store"})

        started = time.perf_counter()
        request_id = str(uuid.uuid4())
        trace_id = str(uuid.uuid4())
        context = AuditRequestContext(
            request=request,
            request_id=request_id,
            trace_id=trace_id,
        )
        token = _AUDIT_CONTEXT.set(context)
        try:
            try:
                response = await call_next(request)
            except Exception:
                events = (
                    _layer2_event(
                        request,
                        status=500,
                        started=started,
                        request_id=request_id,
                        trace_id=trace_id,
                    ),
                    _layer1_event(
                        request,
                        status=500,
                        started=started,
                        request_id=request_id,
                        trace_id=trace_id,
                    ),
                )
                for event in events:
                    if event:
                        await run_in_threadpool(partial(_safe_record_audit, **event))
                raise

            events = (
                _layer2_event(
                    request,
                    status=response.status_code,
                    started=started,
                    request_id=request_id,
                    trace_id=trace_id,
                ),
                _layer1_event(
                    request,
                    status=response.status_code,
                    started=started,
                    request_id=request_id,
                    trace_id=trace_id,
                ),
            )
            for event in events:
                if event:
                    _append_background(response, partial(_safe_record_audit, **event))
            return response
        finally:
            _AUDIT_CONTEXT.reset(token)

    return app
