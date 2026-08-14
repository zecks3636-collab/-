"""COSMAX Audit SDK 0.1.0-alpha.1 — Incubation Portal drop-in.

Source: PI-INNOVATION-DIVISION-IT/COSMAX-CM-AUDIT-SDK. Server-side only.

계약 경계 (원장 결정 DU-20260812-03, docs/governance/DATA-PROTECTION.md §2.5/§2.8 참조):
  이 드랍인이 Portal로 보내는 것은 "Portal ingest 계약"이며 C1 envelope이 아니다.
  - 드랍인 -> Portal ingest 구간: actor.user_email(upn) 평문 허용 (Portal이 원장 SoR).
  - Portal -> Firehose -> S3 구간(C1 envelope): user_email 금지.
    spec/audit-envelope-v1.schema.json의 actor는 additionalProperties:false이고
    허용 키는 user_uuid/actor_type/employee_no/impersonator_uuid뿐이다.
  Portal은 S3 복제 전에 반드시 user_email을 드롭하거나 SHA-256 해시로 마스킹해야 한다
  (DATA-PROTECTION.md §2.5). 이 드랍인은 그 마스킹을 수행하지 않는다 — 책임은 Portal에 있다.
"""

import datetime
import json
import math
import os
import re
import sys
import time
import unicodedata
import urllib.error
import urllib.request
import uuid

LOG_TYPES = {"API_AUDIT", "AUTH", "BATCH", "DOMAIN", "DATA_ACCESS"}
ACTOR_TYPES = {"USER", "SERVICE", "SYSTEM", "WEBHOOK", "ANONYMOUS"}
ACTIONS = {"CREATE", "READ", "UPDATE", "DELETE", "EXPORT", "DOWNLOAD", "LOGIN", "LOGOUT", "GRANT", "REVOKE", "EXECUTE", "IMPERSONATE", "APPROVE", "OTHER"}
OUTCOMES = {"SUCCESS", "FAIL", "DENY"}
BUSINESS_ACTION_RE = re.compile(r"^[A-Z][A-Z0-9_]{0,63}$")
TOKEN_RULES = (
    (("IMPERSONATE",), "IMPERSONATE"), (("LOGOUT",), "LOGOUT"), (("LOGIN",), "LOGIN"),
    (("GRANT",), "GRANT"), (("REVOKE",), "REVOKE"), (("APPROVE", "APPROVAL", "REJECT"), "APPROVE"),
    (("DELETE", "REMOVE"), "DELETE"), (("EXPORT",), "EXPORT"), (("DOWNLOAD",), "DOWNLOAD"),
    (("CREATE", "ADD"), "CREATE"), (("UPDATE", "CHANGE", "PROGRESS", "STATUS"), "UPDATE"),
    (("READ", "VIEW"), "READ"), (("EXECUTE", "RUN", "TRIGGER", "START"), "EXECUTE"),
)


# 미등록 action 폴백 계측: spec/action-registry-v1.json에 없는 action이 들어오면
# (spec/incubation-action-mapping-v1.json 규칙으로) 조용히 정규화한다. 업무 코드를
# 죽이지 않기 위해 예외를 던지지 않고, 대신 카운터를 남기고 경고만 출력한다.
ACTION_FALLBACK_STATS = {"total": 0, "by_action": {}}


def _record_action_fallback(raw_action):
    ACTION_FALLBACK_STATS["total"] += 1
    ACTION_FALLBACK_STATS["by_action"][raw_action] = ACTION_FALLBACK_STATS["by_action"].get(raw_action, 0) + 1
    print(
        f'[audit-sdk] unregistered action "{raw_action}" -> spec/action-registry-v1.json 미등록. '
        "incubation-action-mapping-v1.json 규칙으로 폴백 정규화됨 (audit_sdk.py _record_action_fallback)",
        file=sys.stderr,
    )


def reset_action_fallback_stats():
    ACTION_FALLBACK_STATS["total"] = 0
    ACTION_FALLBACK_STATS["by_action"].clear()


# 공백 제거 규칙(드랍인/core 동치 수리) — 기본 str.strip()(인자 없음)은 Unicode
# White_Space=Yes 속성을 따르는데, BOM(U+FEFF, ZWNBSP)은 White_Space 속성이 없는 Cf(포맷)
# 문자라 strip()이 건드리지 않는다(재현: target.id 선두에 BOM이 붙으면 그대로 통과 →
# 상관관계 키가 원본 시스템 값과 바이트 단위로 어긋남). packages/python/src/cosmax_audit/
# __init__.py의 _TRIM_CODEPOINTS와 바이트 동일한 명시 코드포인트 집합을 여기서도 쓴다.
# 회귀 방지: scripts/dropin-core-parity.sh.
_TRIM_CODEPOINTS = (
    "\t\n\x0b\x0c\r"  # U+0009-U+000D
    "\x20"  # U+0020 SPACE
    "\xa0"  # U+00A0 NO-BREAK SPACE
    "\u1680"  # OGHAM SPACE MARK
    + "".join(chr(c) for c in range(0x2000, 0x200B))  # U+2000-U+200A
    + "\u2028\u2029"  # LINE/PARAGRAPH SEPARATOR
    + "\u202f"  # NARROW NO-BREAK SPACE
    + "\u205f"  # MEDIUM MATHEMATICAL SPACE
    + "\u3000"  # IDEOGRAPHIC SPACE
    + "\ufeff"  # ZERO WIDTH NO-BREAK SPACE / BOM
)


def _text(value, maximum):
    value = value.strip(_TRIM_CODEPOINTS) if isinstance(value, str) else ""
    return value[:maximum] or None


def _trim_or_null(value):
    if not isinstance(value, str):
        return None
    trimmed = value.strip(_TRIM_CODEPOINTS)
    return trimmed or None


# 정수 판정 규칙(드랍인/core 동치 수리) — http.status/http.duration_ms에 "200.0"처럼 소수점
# 붙은 정수 값이 흔히 들어온다(직렬화기 차이). core와 동일하게 "수학적으로 정수인 값은
# 정수로 본다"(1200.0 == 1200)를 채택한다 — 기존 isinstance(x, int)만 검사하면 유효한
# 이벤트를 거짓 REJECT한다(재현: http.duration_ms=1200.0 → ValueError). bool은 python에서
# int의 서브클래스이지만 JSON boolean이 정수로 둔갑하면 안 되므로 명시적으로 제외한다.
# 회귀 방지: scripts/dropin-core-parity.sh.
def _as_integer(value):
    if isinstance(value, bool):
        return None
    if isinstance(value, int):
        return value
    if isinstance(value, float) and math.isfinite(value) and value.is_integer():
        return int(value)
    return None


# PII(이메일) 검출(드랍인/core 동치 수리) — 종전 검사는 5단계 정규화 파이프라인 중 NFKC와
# 퍼센트디코드 "2단계만"(고정 5회 반복, 겹 사이 공백 관용 없음, 표준 준수 UTF-8 디코더
# urllib.parse.unquote) 이식하고 있었다. packages/python/src/cosmax_audit/__init__.py의
# _normalize_once_for_pii_check/_contains_email_marker가 실제로 쓰는 나머지 3단계 — HTML
# 문자참조 해제(&#64;·&#x40;·&commat; 등)·%uXXXX(레거시 IIS 스타일) 해제·리터럴 "\uXXXX"
# 텍스트 이스케이프 해제 — 가 드랍인에 아예 없어 그 세 변형이 그대로 통과했다(예:
# "user&#64;example.com"). 아래는 core의 5단계 파이프라인(NFKC → HTML 문자참조 해제 →
# %uXXXX 해제 → 리터럴 \uXXXX 해제 → 관용적(permissive) 퍼센트 디코드)을 고정점(더 이상 안
# 변할 때까지) 반복하는 알고리즘을 그대로 이식한 것이다 — 규칙 이식이지 core 파일 자체를
# 복사한 것이 아니다(드랍인은 core를 import하지 않는 별개 재구현이라는 배포 제약은 유지).
# 회귀 방지: scripts/dropin-core-parity.sh.
_MAX_EMAIL_DECODE_ROUNDS = 64  # core _MAX_NORMALIZE_ROUNDS와 동일 — 계약상 상한이 아니라 무한루프 방지 안전판.


def _permissive_decode_utf8_bytes(data):
    """관용적(permissive) UTF-8 바이트 디코더 — PII 검출 정규화 전용, 저장값에는 안 쓴다.
    bytes.decode('utf-8','replace')는 overlong 인코딩(예: "@"(0x40)를 표준이 요구하는
    1바이트 대신 2바이트로 편법 인코딩한 %C1%80)을 규격 위반으로 거부해 U+FFFD로 치환하는데,
    shortest-form 검사 없이 리딩바이트 비트 패턴만으로 조합하는 관대한 다운스트림 파서가 그
    값을 "@"로 읽을 수 있다 — 그 다운스트림이 볼 수 있는 문자를 검출기도 봐야 한다. core
    packages/python/src/cosmax_audit/__init__.py _permissive_decode_utf8_bytes와 동일."""
    out = []
    i = 0
    n = len(data)
    while i < n:
        b0 = data[i]
        if (b0 & 0x80) == 0x00:
            value, need = b0, 0
        elif (b0 & 0xE0) == 0xC0:
            value, need = b0 & 0x1F, 1
        elif (b0 & 0xF0) == 0xE0:
            value, need = b0 & 0x0F, 2
        elif (b0 & 0xF8) == 0xF0:
            value, need = b0 & 0x07, 3
        else:
            out.append("�")
            i += 1
            continue
        if i + need >= n:
            out.append("�")
            i += 1
            continue
        ok = True
        for k in range(1, need + 1):
            bk = data[i + k]
            if (bk & 0xC0) != 0x80:
                ok = False
                break
            value = (value << 6) | (bk & 0x3F)
        if not ok:
            out.append("�")
            i += 1
            continue
        try:
            out.append(chr(value))
        except ValueError:
            out.append("�")
        i += need + 1
    return "".join(out)


_HEX_DIGIT_RE = re.compile(r"[0-9a-fA-F]")
_PERCENT_GAP_RE = re.compile(r"[ \t\r\n]")


def _percent_decode_once(s):
    """%XX(헥스 2자리, 대소문자 무관) 연속 구간을 한 겹만 디코드한다 — 헥스 자리 사이에
    공백류가 끼어도("%4\\n0") 한 겹으로 흡수한다(core _percent_decode_once와 동일)."""
    length = len(s)
    out = []
    i = 0
    byte_buf = bytearray()

    def flush():
        if byte_buf:
            out.append(_permissive_decode_utf8_bytes(bytes(byte_buf)))
            byte_buf.clear()

    while i < length:
        if s[i] == "%":
            j = i + 1
            while j < length and _PERCENT_GAP_RE.match(s[j]):
                j += 1
            h1 = s[j] if j < length else None
            if h1 is not None and _HEX_DIGIT_RE.match(h1):
                k = j + 1
                while k < length and _PERCENT_GAP_RE.match(s[k]):
                    k += 1
                h2 = s[k] if k < length else None
                if h2 is not None and _HEX_DIGIT_RE.match(h2):
                    byte_buf.append(int(h1 + h2, 16))
                    i = k + 1
                    continue
        flush()
        out.append(s[i])
        i += 1
    flush()
    return "".join(out)


# HTML 문자참조 해제 — 숫자 참조(10진/16진, 대소문자 x 둘 다, 종결 세미콜론 선택)는
# 일반화, 명명된 참조는 최소 집합만(완벽한 HTML5 표를 이식하지 않는다). core
# _decode_html_entities와 동일.
_HTML_NAMED_ENTITIES = {"commat": "@", "amp": "&", "lt": "<", "gt": ">", "quot": '"', "apos": "'"}
_HTML_ENTITY_RE = re.compile(r"&(#[xX][0-9a-fA-F]+;?|#[0-9]+;?|[a-z]+;)")


def _decode_html_entities(s):
    def repl(m):
        raw_body = m.group(1)
        body = raw_body[:-1] if raw_body.endswith(";") else raw_body
        if body[0] == "#":
            is_hex = body[1] in "xX"
            try:
                code_point = int(body[2:] if is_hex else body[1:], 16 if is_hex else 10)
            except ValueError:
                return m.group(0)
            if 0 <= code_point <= 0x10FFFF:
                try:
                    return chr(code_point)
                except ValueError:
                    return m.group(0)
            return m.group(0)
        return _HTML_NAMED_ENTITIES.get(body, m.group(0))

    return _HTML_ENTITY_RE.sub(repl, s)


# %uXXXX(레거시 IIS 스타일) 해제 — 'u' 대소문자 모두 인정.
_PERCENT_U_RE = re.compile(r"%[uU]([0-9a-fA-F]{4})")


def _decode_percent_u(s):
    return _PERCENT_U_RE.sub(lambda m: chr(int(m.group(1), 16)), s)


# 리터럴 "\uXXXX" 텍스트 이스케이프 해제(문자열 값 자체에 백슬래시+u+헥스4자리가 텍스트로
# 남아있는 경우 — 이중 직렬화 등으로 유입).
_LITERAL_BACKSLASH_U_RE = re.compile(r"\\u([0-9a-fA-F]{4})")


def _decode_literal_backslash_u(s):
    return _LITERAL_BACKSLASH_U_RE.sub(lambda m: chr(int(m.group(1), 16)), s)


def _normalize_once_for_email_check(s):
    """정규화 파이프라인 한 겹: NFKC → HTML 문자참조 해제 → %uXXXX 해제 → 리터럴 \\uXXXX
    해제 → 퍼센트 디코드(core _normalize_once_for_pii_check와 동일)."""
    out = unicodedata.normalize("NFKC", s)
    out = _decode_html_entities(out)
    out = _decode_percent_u(out)
    out = _decode_literal_backslash_u(out)
    out = _percent_decode_once(out)
    return out


def _contains_email_marker(value):
    if not value:
        return False
    s = value
    for _round in range(_MAX_EMAIL_DECODE_ROUNDS):
        nxt = _normalize_once_for_email_check(s)
        if nxt == s:
            break
        s = nxt
    return "@" in s


# PII 검사 순서 수리(드랍인/core 동치, core packages/node/src/index.js item 4와 동일 순서 — python
# core도 normalize_path에서 같은 순서를 쓴다) — 종전에는 _text()가 트림+절단(target.id 200/
# target.type 64)을 먼저 끝낸 뒤 그 "절단된" 결과에 _contains_email_marker를 걸었다. 절단
# 상한이 "@" *이전* 어딘가에서 값을 자르면 검사가 "@" 없는 접두부만 보고 통과시킨다(재현:
# "X"*190 + "hong.gildong@cosmax.com" — 213 코드포인트를 200자로 자르면 "hong.gildo"까지만
# 남아 "@"가 통째로 잘려나가 검사를 우회한다). core와 동일하게 트림한 "절단 전" 원문 전체를
# 먼저 검사하고, 통과한 값만 절단한다. 회귀 방지: scripts/dropin-core-parity.sh
# pii_x_truncation_boundary 픽스처.
def _bounded_id_or_dropped(value, maximum):
    # trace_id/request_id 전용 — core(boundedIdOrDropped)와 동일하게 절단하지 않는다(상관관계
    # 식별자라 절단하면 원본 시스템 값과 바이트 단위로 어긋나는데 신호가 안 남는다). 길이초과·
    # 이메일 마커 둘 다 조용히 드롭(None)한다 — 이 두 필드는 required가 아니므로 raise하지
    # 않는다(업무 비차단). 종전에는 이 두 필드에 PII 검사 자체가 없었다. 회귀 방지:
    # scripts/dropin-core-parity.sh pii_field_coverage:trace_id/request_id 픽스처.
    trimmed = _trim_or_null(value)
    if trimmed is None:
        return None
    if len(trimmed) > maximum or _contains_email_marker(trimmed):
        return None
    return trimmed


# http.path 정규화 — 3언어 갈림 수리(core packages/python/src/cosmax_audit/__init__.py
# normalize_path가 정본).
# 뿌리1: split("?")/split("#") 이전에 trim+300자 절단을 한 번에 처리하던 예전 방식(_text() 선적용)은
# split 이후 남는 후행 공백류(스페이스·탭·NBSP·전각공백 등)를 재트림하지 않았다 — 그 결과
# ":id" 마스킹 정규식의 `(?=/|$)` lookahead가 무력화돼 UUID·주문번호 같은 원본 식별자가
# http.path에 그대로 노출됐다. trim → split → 재trim → 시작(`/`) 및 이메일 마커 검사(절단 전
# 전체 경로 기준) → 300자 절단 순서로 core와 동일하게 맞춘다.
# 뿌리2: 정규식 `$`는 python에서 "문자열 끝" 뿐 아니라 "문자열 끝 직전의 단일 개행" 앞에서도
# 매치한다(re.MULTILINE 없이도) — java `$`(멀티라인별 줄끝) 및 core의 `\Z`(항상 진짜 끝)와
# 의미가 갈린다. core와 동일하게 `\Z`로 고정한다.
def normalize_audit_path(value):
    trimmed = _trim_or_null(value)
    if trimmed is None:
        return None
    raw_path = _trim_or_null(re.split(r"[?#]", trimmed, maxsplit=1)[0])
    if raw_path is None or not raw_path.startswith("/") or _contains_email_marker(raw_path):
        return None
    path = raw_path[:300]
    path = re.sub(r"/[0-9a-f]{8}-[0-9a-f-]{27,36}(?=/|\Z)", "/:id", path, flags=re.I)
    path = re.sub(r"/[0-9a-f]{16,}(?=/|\Z)", "/:id", path, flags=re.I)
    return re.sub(r"/[0-9]+(?=/|\Z)", "/:id", path)  # ★ASCII 고정 — python \d 는 유니코드 Nd 전체를 먹어 core(js/ts)와 갈린다


def canonicalize_action(action, http_method=None, business_action=None):
    action = _text(action, 64)
    business_action = _text(business_action, 64)
    if not BUSINESS_ACTION_RE.fullmatch(action or ""):
        raise ValueError("action must be controlled UPPER_SNAKE_CASE")
    if business_action and not BUSINESS_ACTION_RE.fullmatch(business_action):
        raise ValueError("invalid business_action")
    if action in ACTIONS:
        return action, business_action
    _record_action_fallback(action)
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
    # target.type/target.id — 절단 전 원문 전체를 PII 검사한다(위 _bounded_id_or_dropped 주석의
    # "절단 순서" 수리 참고, core item 4와 동일 순서).
    target_type_raw = _trim_or_null(target.get("type"))
    target_id_raw = _trim_or_null(str(target.get("id")) if target.get("id") is not None else None)
    if target_type_raw and _contains_email_marker(target_type_raw):
        raise ValueError("target.type must be a non-PII value")
    if target_id_raw and _contains_email_marker(target_id_raw):
        raise ValueError("target.id must be a non-PII stable id")
    target_type = target_type_raw[:64] if target_type_raw else None
    target_id = target_id_raw[:200] if target_id_raw else None
    if not target_type or not target_id:
        raise ValueError("target.type and target.id are required")
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
    # 정수 판정(드랍인/core 동치 수리, 위 _as_integer 주석 참고) — "200.0"처럼 수학적으로
    # 정수인 float 값을 REJECT하지 않고 int로 수용한다. 값 자체도 status_val/duration_val로
    # 정규화해 출력한다(core가 1200.0을 1200으로 내는 것과 동일 — 원본 float가 그대로 새지
    # 않는다).
    status_val = _as_integer(http.get("status")) if http.get("status") is not None else None
    if http.get("status") is not None and (status_val is None or not 100 <= status_val <= 599):
        raise ValueError("http.status must be 100..599")
    duration_val = _as_integer(http.get("duration_ms")) if http.get("duration_ms") is not None else None
    if http.get("duration_ms") is not None and (duration_val is None or duration_val < 0):
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
        "trace_id": _bounded_id_or_dropped(trace_id, 128),
        "request_id": _bounded_id_or_dropped(request_id, 128),
        "http": ({
            "method": (_text(http.get("method"), 16) or "").upper() or None,
            "path": normalize_audit_path(http.get("path")),
            "status": status_val,
            "duration_ms": duration_val,
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
