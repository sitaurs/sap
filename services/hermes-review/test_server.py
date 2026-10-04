import http.client
import json
import os
import tempfile
import threading
import unittest
from unittest.mock import patch

import server


def request_body(run_id="11111111-1111-4111-8111-111111111111"):
    snapshot = {
        "schemaVersion": "sap-evidence-snapshot-v1",
        "subjectType": "report",
        "subjectId": "22222222-2222-4222-8222-222222222222",
        "subjectRevision": 2,
        "sourceReportId": "22222222-2222-4222-8222-222222222222",
        "sourceReportRevision": 5,
        "source": {},
        "subject": {},
        "evidence": [],
        "scan": None,
        "duplicateCandidates": [],
    }
    return {
        "runId": run_id,
        "modelVersion": "provider/model-pinned-test",
        "policyVersion": "sap-moderation-r1",
        "snapshotHash": "a" * 64,
        "snapshot": snapshot,
        "images": [],
        "limits": {
            "timeoutMs": 10000,
            "maxIterations": 1,
            "maxInputTokens": 4000,
            "maxOutputTokens": 500,
            "maxCostUsd": 0.25,
        },
    }


def response_body(request):
    snapshot = request["snapshot"]
    return {
        "result": {
            "schemaVersion": "sap-evidence-review-v1",
            "subjectType": snapshot["subjectType"],
            "subjectId": snapshot["subjectId"],
            "subjectRevision": snapshot["subjectRevision"],
            "sourceReportId": snapshot["sourceReportId"],
            "sourceReportRevision": snapshot["sourceReportRevision"],
            "snapshotHash": request["snapshotHash"],
            "recommendation": "human_review",
            "reasonCodes": ["MORE_EVIDENCE_REQUIRED"],
            "evidence": [],
            "duplicateCandidates": [],
            "missingEvidence": ["Tambahkan bukti yang dapat ditinjau."],
            "publicSummaryProposal": None,
            "publicationWarnings": [],
        },
        "usage": {"inputTokens": 500, "outputTokens": 100, "costUsd": 0.01},
    }


class HermesReviewServiceTests(unittest.TestCase):
    def test_final_response_parser_accepts_one_schema_object_only(self):
        value = response_body(request_body())
        self.assertEqual(server.parse_final_response(json.dumps(value)), value)
        self.assertEqual(server.parse_final_response("Final answer:\n```json\n" + json.dumps(value) + "\n```"), value)
        with self.assertRaisesRegex(ValueError, "HERMES_INVALID_RESPONSE"):
            server.parse_final_response(json.dumps(value) + "\n{" + json.dumps(value)[1:])
        with self.assertRaisesRegex(ValueError, "HERMES_INVALID_RESPONSE"):
            server.parse_final_response("x" * 70000)

    def test_provider_health_checks_the_configured_model(self):
        class FakeResponse:
            def __init__(self, model_id):
                self.model_id = model_id

            def __enter__(self):
                return self

            def __exit__(self, *_args):
                return None

            def read(self, _limit):
                return json.dumps({"data": [{"id": self.model_id}]}).encode()

        with patch.dict(os.environ, {
            "HERMES_PROVIDER_BASE_URL": "http://router.invalid/v1",
            "HERMES_MODEL_VERSION": "combo-hermes",
            "HERMES_PROVIDER_API_KEY": "private-test-key",
        }):
            httpd = server.ThreadingHTTPServer(("127.0.0.1", 0), server.Handler)
            thread = threading.Thread(target=httpd.serve_forever, daemon=True)
            thread.start()
            try:
                with patch.object(server.urllib.request, "urlopen", return_value=FakeResponse("combo-hermes")) as call:
                    status, payload = self._get(httpd)
                    self.assertEqual(status, 200)
                    self.assertTrue(payload["ready"])
                    self.assertEqual(payload["modelVersion"], "combo-hermes")
                    self.assertNotIn("private-test-key", json.dumps(payload))
                    self.assertEqual(call.call_args.args[0].full_url, "http://router.invalid/v1/models")
                    self.assertEqual(call.call_args.kwargs["timeout"], 4)
                with patch.object(server.urllib.request, "urlopen", return_value=FakeResponse("other-model")):
                    status, payload = self._get(httpd)
                    self.assertEqual(status, 503)
                    self.assertFalse(payload["ready"])
            finally:
                httpd.shutdown()
                thread.join(timeout=2)
                httpd.server_close()

    def test_valid_request_and_result_are_bound_to_the_same_snapshot(self):
        request = request_body()
        server.validate_request(request)
        server.validate_result(response_body(request)["result"], request)

    def test_rejects_foreign_media_and_duplicate_candidates(self):
        request = request_body()
        result = response_body(request)["result"]
        result["evidence"] = [{"mediaId": "33333333-3333-4333-8333-333333333333", "observation": "Tidak ada pada snapshot."}]
        with self.assertRaisesRegex(ValueError, "HERMES_INVALID_RESPONSE"):
            server.validate_result(result, request)

        result = response_body(request)["result"]
        result["recommendation"] = "recommend_duplicate"
        with self.assertRaisesRegex(ValueError, "HERMES_INVALID_RESPONSE"):
            server.validate_result(result, request)

    def test_http_authentication_idempotency_and_conflict(self):
        request = request_body()
        expected = response_body(request)
        with tempfile.TemporaryDirectory() as directory:
            os.environ["HERMES_REVIEW_SECRET"] = "s" * 40
            os.environ["SAP_HERMES_INTENT_DB"] = os.path.join(directory, "intents.sqlite")
            with server.sqlite3.connect(os.environ["SAP_HERMES_INTENT_DB"]) as database:
                database.execute("CREATE TABLE intents(id TEXT PRIMARY KEY,request_hash TEXT NOT NULL,status TEXT NOT NULL,response TEXT)")

            httpd = server.ThreadingHTTPServer(("127.0.0.1", 0), server.Handler)
            thread = threading.Thread(target=httpd.serve_forever, daemon=True)
            thread.start()
            try:
                fake_process = server.subprocess.CompletedProcess(
                    args=["python", "server.py", "--child"],
                    returncode=0,
                    stdout=json.dumps(expected).encode(),
                    stderr=b"",
                )
                with patch.object(server.subprocess, "run", return_value=fake_process) as run:
                    unauthenticated = self._post(httpd, request, token="wrong")
                    self.assertEqual(unauthenticated[0], 401)

                    first = self._post(httpd, request, token="s" * 40)
                    self.assertEqual(first, (200, expected))
                    replay = self._post(httpd, request, token="s" * 40)
                    self.assertEqual(replay, (200, expected))
                    self.assertEqual(run.call_count, 1, "replayed run IDs must not invoke Hermes again")

                    changed = request_body()
                    changed["snapshotHash"] = "b" * 64
                    conflict = self._post(httpd, changed, token="s" * 40)
                    self.assertEqual(conflict[0], 409, "a reused run ID with a new request must be rejected")
                    self.assertEqual(run.call_count, 1)
            finally:
                httpd.shutdown()
                thread.join(timeout=2)
                httpd.server_close()

    @staticmethod
    def _post(httpd, value, token):
        connection = http.client.HTTPConnection(*httpd.server_address, timeout=3)
        try:
            connection.request(
                "POST",
                "/review",
                body=json.dumps(value),
                headers={"Authorization": f"Bearer {token}", "Content-Type": "application/json"},
            )
            response = connection.getresponse()
            payload = json.loads(response.read())
            return response.status, payload
        finally:
            connection.close()

    @staticmethod
    def _get(httpd):
        connection = http.client.HTTPConnection(*httpd.server_address, timeout=3)
        try:
            connection.request("GET", "/health")
            response = connection.getresponse()
            return response.status, json.loads(response.read())
        finally:
            connection.close()


if __name__ == "__main__":
    unittest.main()
