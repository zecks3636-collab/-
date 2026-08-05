"""COSMAX Audit SDK 0.1.0-alpha.1 — Incubation Portal drop-in.

Source: PI-INNOVATION-DIVISION-IT/COSMAX-CM-AUDIT-SDK. Server-side only.
"""

import datetime
import json
import os
import re
import time
import urllib.error
import urllib.request
import uuid

LOG_TYPES = {"API_AUDIT", "AUTH", "BATCH", "DOMAIN", "DATA_ACCESS"}
ACTOR_TYPES = {"USER", "SERVICE", "SYSTEM", "WEBHOOK", "ANONYMOUS"}
ACTIONS = {"CREATE", "READ", "UPDATE", "DELETE", "EXPORT", "LOGIN", "LOGOUT", "GRANT", "REVOKE", "EXECUTE", "IMPERSONATE", "APPROVE", "OTHER"}
OUTCOMES = {"SUCCESS", "FAIL", "DENY"}
BUSINESS_ACTION_RE = re.compile(r"^[A-Z][A-Z0-9_]{0,63}$")
TOKEN_RULES = (
    (("IMPERSONATE",), "IMPERSONATE"), (("LOGOUT",), "LOGOUT"), (("LOGIN",), "LOGIN"),
    (("GRANT",), "GRANT"), (("REVOKE",), "REVOKE"), (("APPROVE", "APPROVAL", "REJECT"), "APPROVE"),
    (("DELETE", "REMOVE"), "DELETE"), (("EXPORT", "DOWNLOAD"), "EXPORT"),
    (("CREATE", "ADD"), "CREATE"), (("UPDATE", "CHANGE", "PROGRESS", "STATUS"), "UPDATE"),
    (("READ", "VIEW"), "READ"), (("EXECUTE", "RUN", "TRIGGER", "START"), "EXECUTE"),
)


def _text(value, maximum):
    value = value.strip() if isinstance(value, str) else ""
    return value[:maximum] or None


def normalize_audit_path(value):
    path = (_text(value, 300) or "").split("?", 1)[0].split("#", 1)[0]
    if not path.startswith("/") or "@" in path or "%40" in path.lower():
        return None
    path = re.sub(r"/[0-9a-f]{8}-[0-9a-f-]{27,36}(?=/|$)", "/:id", path, flags=re.I)
    path = re.sub(r"/[0-9a-f]{16,}(?=/|$)", "/:id", path, flags=re.I)
    return re.sub(r"/\d+(?=/|$)", "/:id", path)


def canonicalize_action(action, http_method=None, business_action=None):
    action = _text(action, 64)
    business_action = _text(business_action, 64)
    if not BUSINESS_ACTION_RE.fullmatch(action or ""):
        raise ValueError("action must be controlled UPPER_SNAKE_CASE")
    if business_action and not BUSINESS_ACTION_RE.fullmatch(business_action):
        raise ValueError("invalid business_action")
    if action in ACTIONS:
        return action, business_action
    if action == "API_REQUEST":
        by_method = {"GET": "READ", "HEAD": "READ", "POST": "CREATE", "PUT": "UPDATE", "PATCH": "UPDATE", "DELETE": "DELETE"}
        return by_method.get((_text(http_method, 16) or "").upper(), "EXECUTE"), business_action or action
    tokens = set(action.split("_"))
    for candidates, canonical in TOKEN_RULES:
        if tokens.intersection(candidates):
            return canonical, business_action or action
    return "OTHER", business_action or action


def audit_event(*, log_type, action, target, outcome, actor=None, business_action=None,
                event_id=None, event_time=None, trace_id=None, request_id=None, http=None):
    actor = actor or {}
    event_id = event_id or str(uuid.uuid4())
    try:
        parsed_id = uuid.UUID(event_id)
        if parsed_id.version != 4:
            raise ValueError
    except (ValueError, AttributeError):
        raise ValueError("event_id must be UUID v4")
    if log_type not in LOG_TYPES:
        raise ValueError("invalid log_type")
    if outcome not in OUTCOMES:
        raise ValueError("invalid outcome")
    actor_type = actor.get("type", "SYSTEM")
    if actor_type not in ACTOR_TYPES:
        raise ValueError("invalid actor.type")
    target_type = _text(target.get("type"), 64)
    target_id = _text(str(target.get("id")) if target.get("id") is not None else None, 200)
    if not target_type or not target_id:
        raise ValueError("target.type and target.id are required")
    if "@" in target_id or "%40" in target_id.lower():
        raise ValueError("target.id must be a non-PII stable id")
    actor_upn = _text(actor.get("upn"), 200)
    if actor_upn and "@" not in actor_upn:
        raise ValueError("actor.upn must be a verified email/UPN")
    user_uuid = _text(actor.get("user_uuid"), 36)
    if user_uuid:
        try:
            uuid.UUID(user_uuid)
        except ValueError:
            raise ValueError("actor.user_uuid must be UUID")
    if actor_type == "USER" and not (actor_upn or user_uuid):
        raise ValueError("USER actor requires verified upn or user_uuid")
    event_time = event_time or datetime.datetime.now(datetime.timezone.utc).isoformat()
    try:
        parsed_time = datetime.datetime.fromisoformat(event_time.replace("Z", "+00:00"))
        if parsed_time.tzinfo is None:
            raise ValueError
    except (ValueError, AttributeError):
        raise ValueError("event_time must be timezone-aware ISO8601")
    http = http or {}
    if http.get("status") is not None and (not isinstance(http["status"], int) or not 100 <= http["status"] <= 599):
        raise ValueError("http.status must be 100..599")
    if http.get("duration_ms") is not None and (not isinstance(http["duration_ms"], int) or http["duration_ms"] < 0):
        raise ValueError("http.duration_ms must be a non-negative integer")
    canonical_action, mapped_business_action = canonicalize_action(action, http.get("method"), business_action)
    return {
        "schema_version": "1",
        "event_id": event_id,
        "event_time": parsed_time.astimezone(datetime.timezone.utc).isoformat().replace("+00:00", "Z"),
        "log_type": log_type,
        "actor": {"actor_type": actor_type, "user_uuid": user_uuid, "user_email": actor_upn},
        "action": canonical_action,
        "business_action": mapped_business_action,
        "target": {"type": target_type, "id": target_id},
        "outcome": outcome,
        "trace_id": _text(trace_id, 128),
        "request_id": _text(request_id, 128),
        "http": ({
            "method": (_text(http.get("method"), 16) or "").upper() or None,
            "path": normalize_audit_path(http.get("path")),
            "status": http.get("status"),
            "duration_ms": http.get("duration_ms"),
        } if http else None),
    }


def record_audit(*, strict=False, timeout=5, max_attempts=3, retry_delay=0.1, **event_args):
    usage_url = os.environ.get("USAGE_INGEST_URL", "").strip()
    url = os.environ.get("AUDIT_INGEST_URL", "").strip() or re.sub(r"/api/usage/events$", "/api/audit/events", usage_url)
    token = os.environ.get("USAGE_INGEST_TOKEN", "").strip()
    if not (url and token):
        if strict:
            raise RuntimeError("Audit SDK is not configured")
        return {"accepted": False, "reason": "not_configured"}
    try:
        event = audit_event(**event_args)
    except Exception as exc:
        if strict:
            raise
        return {"accepted": False, "reason": "invalid_event", "error": str(exc)}
    body = json.dumps({"events": [event]}, separators=(",", ":")).encode("utf-8")
    attempts = max(1, min(int(max_attempts or 1), 5))
    last_error = None
    for attempt in range(1, attempts + 1):
        try:
            request = urllib.request.Request(url, data=body, method="POST", headers={
                "Content-Type": "application/json", "Authorization": "Bearer " + token,
            })
            with urllib.request.urlopen(request, timeout=timeout) as response:
                result = json.loads(response.read())
            if result.get("accepted") != 1:
                error = RuntimeError("audit ingest rejected event")
                error.retryable = False
                raise error
            return {"accepted": True, "event_id": event["event_id"], "attempts": attempt}
        except Exception as exc:
            last_error = exc
            status = getattr(exc, "code", None)
            retryable = getattr(exc, "retryable", None)
            if retryable is False or (isinstance(status, int) and status < 500 and status != 429) or attempt == attempts:
                break
            time.sleep(retry_delay * attempt)
    if strict:
        raise last_error
    return {"accepted": False, "reason": "delivery_failed", "event_id": event["event_id"], "attempts": attempt}
