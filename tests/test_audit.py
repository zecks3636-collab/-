import ast
import contextlib
import json
import os
import re
import threading
import unittest
import uuid
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer
from pathlib import Path
from unittest import mock

from fastapi import FastAPI, Response
from fastapi.testclient import TestClient

import audit_integration
import audit_sdk
from audit_integration import (
    init_fastapi_api_audit,
    mark_business_outcome,
    mark_verified_service,
)
from audit_registry import (
    AUTO_LAYER2_ROUTE_ACTIONS,
    LAYER1_COVERED_ROUTES,
    LAYER1_EXCLUDED_ROUTES,
)


ROOT = Path(__file__).resolve().parents[1]
ACTION_RE = re.compile(r"^[A-Z][A-Z0-9_]{0,63}$")


def _base_event(**overrides):
    values = {
        "log_type": "DOMAIN",
        "actor": {"type": "ANONYMOUS"},
        "action": "UPDATE",
        "business_action": "TEST_UPDATE",
        "target": {"type": "test_record", "id": "selected"},
        "outcome": "SUCCESS",
        "request_id": str(uuid.uuid4()),
        "trace_id": str(uuid.uuid4()),
        "http": {
            "method": "POST",
            "path": "/api/test/:id",
            "status": 200,
            "duration_ms": 1,
        },
    }
    values.update(overrides)
    return values


class _FakeIngest:
    def __init__(self, statuses):
        self.statuses = list(statuses)
        self.event_ids = []
        self.inserted = set()
        self.duplicates = 0
        owner = self

        class Handler(BaseHTTPRequestHandler):
            def do_POST(self):
                length = int(self.headers.get("Content-Length", "0"))
                payload = json.loads(self.rfile.read(length))
                event_id = payload["events"][0]["event_id"]
                owner.event_ids.append(event_id)
                if event_id in owner.inserted:
                    owner.duplicates += 1
                else:
                    owner.inserted.add(event_id)

                status = owner.statuses.pop(0) if owner.statuses else 200
                body = json.dumps({"accepted": 1 if status < 400 else 0}).encode()
                self.send_response(status)
                self.send_header("Content-Type", "application/json")
                self.send_header("Content-Length", str(len(body)))
                self.end_headers()
                self.wfile.write(body)

            def log_message(self, _format, *_args):
                return

        self.server = ThreadingHTTPServer(("127.0.0.1", 0), Handler)
        self.thread = threading.Thread(target=self.server.serve_forever, daemon=True)

    def __enter__(self):
        self.thread.start()
        return self

    def __exit__(self, *_args):
        self.server.shutdown()
        self.server.server_close()
        self.thread.join(timeout=2)

    @property
    def url(self):
        host, port = self.server.server_address
        return f"http://{host}:{port}/api/audit/events"


@contextlib.contextmanager
def _configured_ingest(server):
    original_urlopen = audit_sdk.urllib.request.urlopen

    def closing_urlopen(*args, **kwargs):
        try:
            return original_urlopen(*args, **kwargs)
        except audit_sdk.urllib.error.HTTPError as error:
            error.close()
            raise

    with (
        mock.patch.dict(
            os.environ,
            {
                "AUDIT_INGEST_URL": server.url,
                "USAGE_INGEST_TOKEN": "synthetic-test-token",
            },
            clear=False,
        ),
        mock.patch.object(
            audit_sdk.urllib.request,
            "urlopen",
            side_effect=closing_urlopen,
        ),
    ):
        yield


def _decorated_routes():
    tree = ast.parse((ROOT / "server.py").read_text(encoding="utf-8"))
    routes = []
    methods = {"get", "post", "put", "patch", "delete", "options", "head"}
    for node in ast.walk(tree):
        if not isinstance(node, (ast.FunctionDef, ast.AsyncFunctionDef)):
            continue
        for decorator in node.decorator_list:
            if not isinstance(decorator, ast.Call):
                continue
            function = decorator.func
            if not (
                isinstance(function, ast.Attribute)
                and isinstance(function.value, ast.Name)
                and function.value.id == "app"
                and function.attr in methods
                and decorator.args
                and isinstance(decorator.args[0], ast.Constant)
            ):
                continue
            routes.append((function.attr.upper(), decorator.args[0].value))
    return routes


def _captured_events(record_mock):
    return [call.kwargs for call in record_mock.call_args_list]


class AuditSchemaTests(unittest.TestCase):
    def test_http_method_mapping_and_outcome_mapping(self):
        expected = {
            "GET": "READ",
            "HEAD": "READ",
            "POST": "CREATE",
            "PUT": "UPDATE",
            "PATCH": "UPDATE",
            "DELETE": "DELETE",
            "OPTIONS": "EXECUTE",
        }
        for method, action in expected.items():
            self.assertEqual(
                audit_sdk.canonicalize_action("API_REQUEST", method),
                (action, "API_REQUEST"),
            )
        self.assertEqual(audit_integration._http_outcome(200), "SUCCESS")
        self.assertEqual(audit_integration._http_outcome(401), "DENY")
        self.assertEqual(audit_integration._http_outcome(403), "DENY")
        self.assertEqual(audit_integration._http_outcome(404), "FAIL")
        self.assertEqual(audit_integration._http_outcome(500), "FAIL")

    def test_schema_rejects_invalid_ids_time_enums_and_unknown_raw_field(self):
        bad_cases = (
            {"event_id": "not-a-uuid"},
            {"event_time": "2026-08-05T10:00:00"},
            {"log_type": "UNKNOWN"},
            {"outcome": "UNKNOWN"},
            {"actor": {"type": "UNKNOWN"}},
        )
        for changes in bad_cases:
            with self.subTest(changes=changes), self.assertRaises(ValueError):
                audit_sdk.audit_event(**_base_event(**changes))
        with self.assertRaises(TypeError):
            audit_sdk.audit_event(**_base_event(), request_body={"private": True})

    def test_schema_rejects_pii_target_and_unverified_user(self):
        with self.assertRaises(ValueError):
            audit_sdk.audit_event(
                **_base_event(target={"type": "record", "id": "person@example.invalid"})
            )
        with self.assertRaises(ValueError):
            audit_sdk.audit_event(**_base_event(actor={"type": "USER"}))

    def test_schema_accepts_verified_user_and_service_actor(self):
        user = audit_sdk.audit_event(
            **_base_event(
                actor={"type": "USER", "user_uuid": str(uuid.uuid4())}
            )
        )
        service = audit_sdk.audit_event(
            **_base_event(actor={"type": "SERVICE", "service_id": "automation"})
        )
        self.assertEqual(user["actor"]["actor_type"], "USER")
        self.assertEqual(service["actor"]["actor_type"], "SERVICE")

    def test_registry_actions_are_canonical_append_only_and_non_pii(self):
        allowed = audit_sdk.ACTIONS - {"OTHER"}
        business_actions = []
        for config in AUTO_LAYER2_ROUTE_ACTIONS.values():
            self.assertIn(config["action"], allowed)
            self.assertRegex(config["business_action"], ACTION_RE)
            self.assertNotIn("@", config["target_id"])
            self.assertLessEqual(len(config["target_id"]), 200)
            business_actions.append(config["business_action"])
        self.assertEqual(len(business_actions), len(set(business_actions)))


class RetryTests(unittest.TestCase):
    def test_4xx_is_not_retried(self):
        with _FakeIngest([400, 200]) as ingest, _configured_ingest(ingest):
            result = audit_sdk.record_audit(
                **_base_event(), strict=False, retry_delay=0, max_attempts=3
            )
        self.assertFalse(result["accepted"])
        self.assertEqual(result["attempts"], 1)
        self.assertEqual(len(ingest.event_ids), 1)

    def test_429_and_5xx_retry_with_stable_event_id(self):
        for first_status in (429, 500):
            with self.subTest(status=first_status):
                with _FakeIngest([first_status, 200]) as ingest, _configured_ingest(ingest):
                    result = audit_sdk.record_audit(
                        **_base_event(), strict=False, retry_delay=0, max_attempts=3
                    )
                self.assertTrue(result["accepted"])
                self.assertEqual(result["attempts"], 2)
                self.assertEqual(len(ingest.event_ids), 2)
                self.assertEqual(len(set(ingest.event_ids)), 1)

    def test_5xx_retry_is_bounded(self):
        with _FakeIngest([500, 500, 500, 200]) as ingest, _configured_ingest(ingest):
            result = audit_sdk.record_audit(
                **_base_event(), strict=False, retry_delay=0, max_attempts=3
            )
        self.assertFalse(result["accepted"])
        self.assertEqual(result["attempts"], 3)
        self.assertEqual(len(ingest.event_ids), 3)
        self.assertEqual(len(set(ingest.event_ids)), 1)

    def test_fake_ledger_deduplicates_same_event_id(self):
        event_id = str(uuid.uuid4())
        with _FakeIngest([200, 200]) as ingest, _configured_ingest(ingest):
            first = audit_sdk.record_audit(
                **_base_event(event_id=event_id), strict=False, retry_delay=0
            )
            second = audit_sdk.record_audit(
                **_base_event(event_id=event_id), strict=False, retry_delay=0
            )
        self.assertTrue(first["accepted"])
        self.assertTrue(second["accepted"])
        self.assertEqual(ingest.inserted, {event_id})
        self.assertEqual(ingest.duplicates, 1)


class RouteCoverageTests(unittest.TestCase):
    def test_runtime_routes_exactly_match_layer1_registry(self):
        routes = _decorated_routes()
        self.assertEqual(len(routes), 62)
        self.assertEqual(len(routes), len(set(routes)))
        self.assertEqual(set(routes), LAYER1_COVERED_ROUTES)
        self.assertEqual(len(LAYER1_EXCLUDED_ROUTES), 5)

    def test_layer2_registry_is_an_exact_subset_and_documented(self):
        self.assertEqual(len(AUTO_LAYER2_ROUTE_ACTIONS), 57)
        self.assertLessEqual(set(AUTO_LAYER2_ROUTE_ACTIONS), LAYER1_COVERED_ROUTES)
        document = (ROOT / "docs" / "AUDIT-ACTIONS.md").read_text(encoding="utf-8")
        for method, route in LAYER1_COVERED_ROUTES | set(LAYER1_EXCLUDED_ROUTES):
            self.assertIn(f"`{route}`", document)
            self.assertIn(f"`{method}`", document)
        for config in AUTO_LAYER2_ROUTE_ACTIONS.values():
            self.assertIn(f"`{config['business_action']}`", document)


class FastApiAuditIntegrationTests(unittest.TestCase):
    def _client(self, configure):
        app = FastAPI()
        init_fastapi_api_audit(app)
        configure(app)
        client = TestClient(app)
        self.addCleanup(client.close)
        return client

    @mock.patch.object(audit_integration, "record_audit")
    def test_layer1_only_route_uses_server_ids_and_omits_raw_inputs(self, record):
        def configure(app):
            @app.get("/api/schedules")
            def read_schedules():
                return {"ok": True}

        client = self._client(configure)
        response = client.get(
            "/api/schedules?private=synthetic-private-value",
            headers={"X-Request-Id": "external-request-id", "Cookie": "sid=synthetic"},
        )
        self.assertEqual(response.status_code, 200)
        events = _captured_events(record)
        self.assertEqual(len(events), 1)
        event = events[0]
        self.assertFalse(event["strict"])
        self.assertEqual(event["business_action"], "API_REQUEST")
        self.assertEqual(event["actor"], {"type": "ANONYMOUS"})
        self.assertEqual(event["http"]["path"], "/api/schedules")
        self.assertNotEqual(event["request_id"], "external-request-id")
        self.assertNotEqual(event["request_id"], event["trace_id"])
        self.assertEqual(uuid.UUID(event["request_id"]).version, 4)
        self.assertEqual(uuid.UUID(event["trace_id"]).version, 4)
        serialized = json.dumps(events)
        self.assertNotIn("synthetic-private-value", serialized)
        self.assertNotIn("sid=synthetic", serialized)

    @mock.patch.object(audit_integration, "record_audit")
    def test_same_request_has_exactly_two_correlated_layers(self, record):
        def configure(app):
            @app.delete("/api/schedules/{schedule_id}")
            def delete_schedule(schedule_id: str):
                return {"deleted": bool(schedule_id)}

        client = self._client(configure)
        raw_id = "synthetic-sensitive-route-value"
        response = client.delete(f"/api/schedules/{raw_id}?private=do-not-copy")
        self.assertEqual(response.status_code, 200)
        events = _captured_events(record)
        self.assertEqual(len(events), 2)
        self.assertEqual({event["business_action"] for event in events}, {
            "API_REQUEST",
            "SCHEDULE_DELETE",
        })
        self.assertEqual(len({event["request_id"] for event in events}), 1)
        self.assertEqual(len({event["trace_id"] for event in events}), 1)
        self.assertTrue(all(event["http"]["path"] == "/api/schedules/:schedule_id" for event in events))
        serialized = json.dumps(events)
        self.assertNotIn(raw_id, serialized)
        self.assertNotIn("do-not-copy", serialized)

    @mock.patch.object(audit_integration, "record_audit")
    def test_verified_service_marker_requires_exact_route(self, record):
        def configure(app):
            @app.post("/api/menu_auto")
            def verified():
                mark_verified_service(
                    "menu_automation",
                    expected_route=("POST", "/api/menu_auto"),
                )
                return {"ok": True}

            @app.post("/api/menu_auto_b64")
            def mismatched():
                mark_verified_service(
                    "menu_automation",
                    expected_route=("POST", "/api/menu_auto"),
                )
                return {"ok": True}

        client = self._client(configure)
        self.assertEqual(client.post("/api/menu_auto").status_code, 200)
        verified_events = _captured_events(record)
        self.assertEqual(len(verified_events), 2)
        self.assertTrue(all(event["actor"]["type"] == "SERVICE" for event in verified_events))

        record.reset_mock()
        self.assertEqual(client.post("/api/menu_auto_b64").status_code, 200)
        anonymous_events = _captured_events(record)
        self.assertEqual(len(anonymous_events), 2)
        self.assertTrue(all(event["actor"] == {"type": "ANONYMOUS"} for event in anonymous_events))

    @mock.patch.object(audit_integration, "record_audit")
    def test_business_failure_can_override_only_layer2(self, record):
        def configure(app):
            @app.post("/api/schedule_imports/poll")
            def poll():
                mark_business_outcome(
                    "FAIL",
                    expected_route=("POST", "/api/schedule_imports/poll"),
                )
                return {"ok": False}

        client = self._client(configure)
        self.assertEqual(client.post("/api/schedule_imports/poll").status_code, 200)
        by_action = {
            event["business_action"]: event for event in _captured_events(record)
        }
        self.assertEqual(by_action["API_REQUEST"]["outcome"], "SUCCESS")
        self.assertEqual(by_action["SCHEDULE_IMPORT_SYNC_RUN"]["outcome"], "FAIL")

    @mock.patch.object(audit_integration, "record_audit")
    def test_4xx_correlation_and_server_only_exclusion(self, record):
        def configure(app):
            @app.get("/api/files/{folder}")
            def list_files(folder: str):
                del folder
                return Response(status_code=400)

        client = self._client(configure)
        self.assertEqual(client.get("/api/files/invalid-safe").status_code, 400)
        events = _captured_events(record)
        self.assertEqual(len(events), 2)
        self.assertTrue(all(event["outcome"] == "FAIL" for event in events))
        self.assertEqual(len({event["request_id"] for event in events}), 1)

        record.reset_mock()
        response = client.get("/audit_sdk.py")
        self.assertEqual(response.status_code, 404)
        self.assertEqual(response.headers["cache-control"], "no-store")
        record.assert_not_called()


class ProductionAppSmokeTests(unittest.TestCase):
    def _database_without_rows(self):
        connection = mock.MagicMock()
        connection.__enter__.return_value = connection
        cursor = mock.MagicMock()
        connection.cursor.return_value.__enter__.return_value = cursor
        cursor.fetchone.return_value = None
        return connection

    def _csv_response(self, content):
        response = mock.MagicMock()
        response.__enter__.return_value.read.return_value = content.encode()
        return response

    @mock.patch.object(audit_integration, "record_audit")
    def test_static_ui_and_technical_routes_are_excluded_and_sources_are_blocked(
        self, record
    ):
        import server

        with TestClient(server.app) as client:
            self.assertEqual(client.get("/").status_code, 200)
            self.assertEqual(client.get("/openapi.json").status_code, 200)
            for path in (
                "/audit_sdk.py",
                "/requirements-dev.txt",
                "/docs/AUDIT-ACTIONS.md",
                "/tests/test_audit.py",
            ):
                with self.subTest(path=path):
                    self.assertEqual(client.get(path).status_code, 404)
        record.assert_not_called()

    @mock.patch.object(audit_integration, "record_audit")
    def test_menu_poll_partial_failure_marks_only_business_layer_failed(self, record):
        import server

        sheet = self._csv_response(
            "url,filename,timestamp,done\n"
            "https://example.invalid/menu.pdf,menu.pdf,2026-08-01,\n"
        )
        with (
            mock.patch.object(server, "get_conn", return_value=self._database_without_rows()),
            mock.patch.object(
                audit_sdk.urllib.request,
                "urlopen",
                side_effect=[sheet, OSError("synthetic drive failure")],
            ),
            TestClient(server.app) as client,
        ):
            response = client.post("/api/menu_auto_poll")

        self.assertEqual(response.status_code, 200)
        by_action = {
            event["business_action"]: event for event in _captured_events(record)
        }
        self.assertEqual(by_action["API_REQUEST"]["outcome"], "SUCCESS")
        self.assertEqual(by_action["MENU_IMAGE_SYNC_RUN"]["outcome"], "FAIL")

    @mock.patch.object(audit_integration, "record_audit")
    def test_schedule_poll_partial_failure_marks_only_business_layer_failed(self, record):
        import server

        sheet = self._csv_response(
            "company,url,filename,timestamp,done\n"
            "Group,https://example.invalid/schedule.pdf,schedule.pdf,2026-08-01,\n"
        )
        with (
            mock.patch.object(server, "get_conn", return_value=self._database_without_rows()),
            mock.patch.object(audit_sdk.urllib.request, "urlopen", return_value=sheet),
            mock.patch.object(
                server,
                "schedule_imports_submit",
                side_effect=server.HTTPException(
                    status_code=500,
                    detail="synthetic import failure",
                ),
            ),
            TestClient(server.app) as client,
        ):
            response = client.post("/api/schedule_imports/poll")

        self.assertEqual(response.status_code, 200)
        by_action = {
            event["business_action"]: event for event in _captured_events(record)
        }
        self.assertEqual(by_action["API_REQUEST"]["outcome"], "SUCCESS")
        self.assertEqual(by_action["SCHEDULE_IMPORT_SYNC_RUN"]["outcome"], "FAIL")


if __name__ == "__main__":
    unittest.main()
