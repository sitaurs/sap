"""Private, stateless-per-task SAP evidence reviewer. No database or Meta credentials.

Run using the Python interpreter from the pinned Hermes checkout's activated environment.
The HTTP service accepts only authenticated, server-built snapshots; agents cannot mutate SAP.
"""
from __future__ import annotations

import base64
import contextlib
import hashlib
import hmac
import io
import json
import math
import os
import re
from pathlib import Path
import sqlite3
import subprocess
import sys
import tempfile
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer
from typing import Any

HERMES_COMMIT = "bd0affe5e5f723579df8902852f5d0c47795f355"
ROOT = Path(__file__).resolve().parent
REASONS = {"LOCATION_UNCONFIRMED", "TIME_UNCONFIRMED", "POSSIBLE_DUPLICATE", "MORE_EVIDENCE_REQUIRED", "EVIDENCE_CONFLICT", "IMAGE_UNCLEAR", "PUBLIC_PRIVACY_RISK", "NO_NEW_EVIDENCE", "PARTIAL_CLEANUP", "MEASUREMENT_UNCONFIRMED"}
RESULT_KEYS = {"schemaVersion", "subjectType", "subjectId", "subjectRevision", "sourceReportId", "sourceReportRevision", "snapshotHash", "recommendation", "reasonCodes", "evidence", "duplicateCandidates", "missingEvidence", "publicSummaryProposal", "publicationWarnings"}


def validate_request(request: Any) -> None:
    import uuid
    if not isinstance(request, dict) or set(request) != {"runId", "modelVersion", "policyVersion", "snapshotHash", "snapshot", "images", "limits"}:
        raise ValueError("HERMES_REQUEST_INVALID")
    uuid.UUID(request["runId"])
    checked_text(request["modelVersion"], 200)
    if request["policyVersion"] != "sap-moderation-r1" or not isinstance(request["snapshotHash"], str) or not re.fullmatch(r"[0-9a-f]{64}", request["snapshotHash"]):
        raise ValueError("HERMES_REQUEST_INVALID")
    limits = request["limits"]
    if not isinstance(limits, dict) or set(limits) != {"timeoutMs", "maxIterations", "maxInputTokens", "maxOutputTokens", "maxCostUsd"}:
        raise ValueError("HERMES_LIMIT_INVALID")
    for name, minimum, maximum in (("timeoutMs", 1000, 180000), ("maxIterations", 1, 6), ("maxInputTokens", 1, 32000), ("maxOutputTokens", 1, 4096)):
        if type(limits[name]) is not int or not minimum <= limits[name] <= maximum:
            raise ValueError("HERMES_LIMIT_INVALID")
    if type(limits["maxCostUsd"]) not in (int, float) or not math.isfinite(limits["maxCostUsd"]) or limits["maxCostUsd"] <= 0:
        raise ValueError("HERMES_LIMIT_INVALID")
    snapshot = request["snapshot"]
    if not isinstance(snapshot, dict) or set(snapshot) != {"schemaVersion", "subjectType", "subjectId", "subjectRevision", "sourceReportId", "sourceReportRevision", "source", "subject", "evidence", "scan", "duplicateCandidates"}:
        raise ValueError("HERMES_SNAPSHOT_INVALID")
    if snapshot["schemaVersion"] != "sap-evidence-snapshot-v1" or snapshot["subjectType"] not in {"report", "community_update", "activity_result"}:
        raise ValueError("HERMES_SNAPSHOT_INVALID")
    for name in ("subjectId", "sourceReportId"):
        uuid.UUID(snapshot[name])
    for name in ("subjectRevision", "sourceReportRevision"):
        if type(snapshot[name]) is not int or snapshot[name] < 1:
            raise ValueError("HERMES_SNAPSHOT_INVALID")
    if not isinstance(snapshot["source"], dict) or not isinstance(snapshot["subject"], dict):
        raise ValueError("HERMES_SNAPSHOT_INVALID")
    seen = set()
    for item in checked_array(snapshot["evidence"], 9):
        if not isinstance(item, dict) or set(item) != {"mediaId", "sha256", "mime", "width", "height"}:
            raise ValueError("HERMES_EVIDENCE_INVALID")
        uuid.UUID(item["mediaId"])
        if item["mediaId"] in seen or not isinstance(item["sha256"], str) or not re.fullmatch(r"[0-9a-f]{64}", item["sha256"]):
            raise ValueError("HERMES_EVIDENCE_INVALID")
        seen.add(item["mediaId"])
        if item["mime"] not in {"image/jpeg", "image/png", "image/webp"}:
            raise ValueError("HERMES_EVIDENCE_INVALID")
        for name in ("width", "height"):
            if item[name] is not None and (type(item[name]) is not int or not 1 <= item[name] <= 25000000):
                raise ValueError("HERMES_EVIDENCE_INVALID")
    for image in checked_array(request["images"], 9):
        if not isinstance(image, dict) or set(image) != {"mediaId", "mime", "data"} or not isinstance(image["data"], str):
            raise ValueError("HERMES_EVIDENCE_INVALID")
    checked_array(snapshot["duplicateCandidates"], 5)


def canonical(value: Any) -> str:
    return json.dumps(value, sort_keys=True, ensure_ascii=False, separators=(",", ":"))


def checked_text(value: Any, maximum: int) -> None:
    if not isinstance(value, str) or not 1 <= len(value) <= maximum:
        raise ValueError("HERMES_INVALID_RESPONSE")


def checked_array(value: Any, maximum: int) -> list:
    if not isinstance(value, list) or len(value) > maximum:
        raise ValueError("HERMES_INVALID_RESPONSE")
    return value


def validate_result(result: Any, request: dict) -> None:
    snap = request["snapshot"]
    if not isinstance(result, dict) or set(result) != RESULT_KEYS or result["schemaVersion"] != "sap-evidence-review-v1":
        raise ValueError("HERMES_INVALID_RESPONSE")
    for key in ("subjectType", "subjectId", "subjectRevision", "sourceReportId", "sourceReportRevision"):
        if result[key] != snap[key]:
            raise ValueError("HERMES_INVALID_RESPONSE")
    if result["snapshotHash"] != request["snapshotHash"]:
        raise ValueError("HERMES_INVALID_RESPONSE")
    if result["recommendation"] not in {"recommend_accept", "human_review", "recommend_reject", "recommend_duplicate"}:
        raise ValueError("HERMES_INVALID_RESPONSE")
    codes = checked_array(result["reasonCodes"], 10)
    if any(not isinstance(code, str) or code not in REASONS for code in codes) or len(set(codes)) != len(codes):
        raise ValueError("HERMES_INVALID_RESPONSE")
    allowed_media = {item["mediaId"] for item in snap["evidence"]}
    seen = set()
    for evidence in checked_array(result["evidence"], 9):
        if not isinstance(evidence, dict) or set(evidence) != {"mediaId", "observation"} or evidence["mediaId"] not in allowed_media or evidence["mediaId"] in seen:
            raise ValueError("HERMES_INVALID_RESPONSE")
        checked_text(evidence["observation"], 500)
        seen.add(evidence["mediaId"])
    candidates = checked_array(result["duplicateCandidates"], 5)
    allowed_candidates = {item["id"] for item in snap["duplicateCandidates"]}
    if any(not isinstance(candidate, str) or candidate not in allowed_candidates for candidate in candidates) or len(set(candidates)) != len(candidates):
        raise ValueError("HERMES_INVALID_RESPONSE")
    if snap["subjectType"] != "report" and (candidates or result["recommendation"] == "recommend_duplicate"):
        raise ValueError("HERMES_INVALID_RESPONSE")
    if result["recommendation"] == "recommend_duplicate" and not candidates:
        raise ValueError("HERMES_INVALID_RESPONSE")
    for key, count in (("missingEvidence", 3), ("publicationWarnings", 5)):
        for value in checked_array(result[key], count):
            checked_text(value, 300)
    if result["publicSummaryProposal"] is not None:
        checked_text(result["publicSummaryProposal"], 500)


def verify_checkout() -> Path:
    checkout = Path(os.environ["SAP_HERMES_CHECKOUT"]).resolve()
    revision = subprocess.check_output(["git", "-C", str(checkout), "rev-parse", "HEAD"], text=True, timeout=5).strip()
    if revision != HERMES_COMMIT:
        raise RuntimeError("HERMES_PIN_MISMATCH")
    if (checkout / ".env").exists():
        raise RuntimeError("HERMES_CHECKOUT_DOTENV_FORBIDDEN")
    return checkout


def infer(request: dict) -> dict:
    validate_request(request)
    checkout = verify_checkout()
    limits = request["limits"]
    if not 1 <= limits["maxIterations"] <= 6 or not 1000 <= limits["timeoutMs"] <= 180000:
        raise ValueError("HERMES_LIMIT_INVALID")
    if request["modelVersion"] != os.environ["HERMES_MODEL_VERSION"] or request["policyVersion"] != "sap-moderation-r1":
        raise ValueError("HERMES_VERSION_MISMATCH")
    snapshot = request["snapshot"]
    if snapshot["schemaVersion"] != "sap-evidence-snapshot-v1" or snapshot["subjectType"] not in {"report", "community_update", "activity_result"}:
        raise ValueError("HERMES_SNAPSHOT_INVALID")
    # The hash is opaque from the JS canonicalizer. IDs, revisions and this hash are copied verbatim into the result.
    expected_images = {item["mediaId"]: item for item in snapshot["evidence"]}
    if len(expected_images) != len(request["images"]) or len(expected_images) > 9:
        raise ValueError("HERMES_EVIDENCE_INVALID")
    prompt = (ROOT / "policy.txt").read_text()
    text = json.dumps({"snapshotHash": request["snapshotHash"], "snapshot": snapshot}, ensure_ascii=False)
    # UTF-8 bytes form a conservative text-token upper bound; image allowance is deliberately conservative.
    estimated_input = len((prompt + text).encode("utf-8"))
    content: list[dict] = [{"type": "text", "text": text}]
    for image in request["images"]:
        reference = expected_images.pop(image["mediaId"])
        if image["mime"] not in {"image/jpeg", "image/png", "image/webp"} or image["mime"] != reference["mime"]:
            raise ValueError("HERMES_EVIDENCE_INVALID")
        raw = base64.b64decode(image["data"], validate=True)
        if len(raw) > 10 * 1024 * 1024 or hashlib.sha256(raw).hexdigest() != reference["sha256"]:
            raise ValueError("HERMES_EVIDENCE_INVALID")
        estimated_input += 4096 + math.ceil((reference["width"] or 512) / 512) * math.ceil((reference["height"] or 512) / 512) * 170
        content.append({"type": "text", "text": "Evidence mediaId=" + image["mediaId"]})
        content.append({"type": "image_url", "image_url": {"url": "data:" + image["mime"] + ";base64," + image["data"], "detail": "low"}})
    if expected_images or estimated_input > limits["maxInputTokens"]:
        raise ValueError("HERMES_TOKEN_BUDGET_EXCEEDED")
    # Rates are operator-reviewed upper bounds for this pinned model, including image/reasoning/cache charges.
    input_rate = float(os.environ["HERMES_INPUT_USD_PER_MILLION"])
    output_rate = float(os.environ["HERMES_OUTPUT_USD_PER_MILLION"])
    if not math.isfinite(input_rate + output_rate) or input_rate < 0 or output_rate < 0:
        raise ValueError("HERMES_PRICING_INVALID")
    reserved_cost = (estimated_input * input_rate + limits["maxOutputTokens"] * output_rate) / 1_000_000
    if reserved_cost > limits["maxCostUsd"]:
        raise ValueError("HERMES_COST_BUDGET_EXCEEDED")
    sys.path.insert(0, str(checkout))
    with contextlib.redirect_stdout(io.StringIO()), contextlib.redirect_stderr(io.StringIO()):
        from run_agent import AIAgent
        agent = AIAgent(model=request["modelVersion"], provider=os.environ.get("HERMES_PROVIDER", "openrouter"),
                        api_key=os.environ["HERMES_PROVIDER_API_KEY"], base_url=os.environ.get("HERMES_PROVIDER_BASE_URL"),
                        enabled_toolsets=[], max_iterations=1, max_tokens=limits["maxOutputTokens"],
                        quiet_mode=True, save_trajectories=False, verbose_logging=False, skip_memory=True,
                        skip_context_files=True, skip_background_review=True, load_soul_identity=False,
                        run_budget_seconds=limits["timeoutMs"] / 1000, fallback_model={},
                        ephemeral_system_prompt=prompt)
        # These fields are pinned source internals. They disable persistence, retries and implicit tool injection.
        agent._persist_disabled = True
        agent._api_max_retries = 1
        agent.tools = []
        try:
            outcome = agent.run_conversation(user_message=content, system_message=prompt, task_id=request["runId"])
            result = json.loads(outcome["final_response"])
            actual_input = int(getattr(agent, "session_input_tokens", 0))
            actual_output = int(getattr(agent, "session_output_tokens", 0))
            actual_cost = getattr(agent, "session_estimated_cost_usd", None)
        finally:
            agent.close()
    validate_result(result, request)
    if actual_input <= 0 or actual_output <= 0 or actual_input > limits["maxInputTokens"] or actual_output > limits["maxOutputTokens"]:
        raise ValueError("HERMES_USAGE_INVALID")
    # Preserve the conservative reservation when a provider doesn't report trustworthy cost.
    cost = max(reserved_cost, float(actual_cost or 0))
    if not math.isfinite(cost) or cost > limits["maxCostUsd"]:
        raise ValueError("HERMES_COST_BUDGET_EXCEEDED")
    return {"result": result, "usage": {"inputTokens": actual_input, "outputTokens": actual_output, "costUsd": cost}}


class Handler(BaseHTTPRequestHandler):
    def log_message(self, *_args: Any) -> None:
        pass  # Never log snapshots, photos, tokens or provider response text.

    def reply(self, status: int, value: dict) -> None:
        data = json.dumps(value, ensure_ascii=False).encode()
        self.send_response(status)
        self.send_header("Content-Type", "application/json")
        self.send_header("Content-Length", str(len(data)))
        self.send_header("Cache-Control", "no-store")
        self.end_headers()
        self.wfile.write(data)

    def do_GET(self) -> None:
        if self.path != "/health":
            self.reply(404, {"error": "NOT_FOUND"})
            return
        self.reply(200, {"ready": True, "hermesCommit": HERMES_COMMIT, "policyVersion": "sap-moderation-r1", "tools": [], "canAutomate": False})

    def do_POST(self) -> None:
        secret = os.environ["HERMES_REVIEW_SECRET"]
        if self.path != "/review" or not hmac.compare_digest(self.headers.get("Authorization", ""), "Bearer " + secret):
            self.reply(401, {"error": "UNAUTHORIZED"})
            return
        try:
            size = int(self.headers.get("Content-Length", "0"))
            if not 1 <= size <= 36 * 1024 * 1024:
                raise ValueError()
            body = self.rfile.read(size)
            request = json.loads(body)
            validate_request(request)
            digest = hashlib.sha256(canonical(request).encode()).hexdigest()
        except (ValueError, KeyError, TypeError):
            self.reply(400, {"error": "INVALID_REQUEST"})
            return
        with sqlite3.connect(os.environ["SAP_HERMES_INTENT_DB"]) as database:
            database.execute("BEGIN IMMEDIATE")
            existing = database.execute("SELECT request_hash,status,response FROM intents WHERE id=?", (request["runId"],)).fetchone()
            if existing:
                if existing[0] != digest:
                    self.reply(409, {"error": "INTENT_CONFLICT"})
                elif existing[1] == "completed":
                    self.reply(200, json.loads(existing[2]))
                else:
                    self.reply(409, {"error": "INTENT_PENDING_OR_FAILED"})
                return
            database.execute("INSERT INTO intents(id,request_hash,status) VALUES(?,?,'running')", (request["runId"], digest))
        try:
            with tempfile.TemporaryDirectory(prefix="sap-hermes-review-") as directory:
                allowed_environment = {"PATH", "LANG", "LC_ALL", "LD_LIBRARY_PATH", "SSL_CERT_FILE", "SSL_CERT_DIR", "HTTPS_PROXY", "HTTP_PROXY", "NO_PROXY",
                    "SAP_HERMES_CHECKOUT", "HERMES_MODEL_VERSION", "HERMES_PROVIDER_API_KEY", "HERMES_PROVIDER", "HERMES_PROVIDER_BASE_URL", "HERMES_INPUT_USD_PER_MILLION", "HERMES_OUTPUT_USD_PER_MILLION"}
                environment = {name: value for name, value in os.environ.items() if name in allowed_environment}
                environment["HERMES_HOME"] = directory
                # User configuration, plugins, skill and memory discovery are isolated from each task.
                Path(directory, "config.yaml").write_text("agent:\n  api_max_retries: 1\n  skill_creation_enabled: false\n")
                completed = subprocess.run([sys.executable, str(Path(__file__).resolve()), "--child"], input=body,
                                           stdout=subprocess.PIPE, stderr=subprocess.DEVNULL, cwd=directory, env=environment,
                                           timeout=min(180000, max(1000, int(request["limits"]["timeoutMs"]))) / 1000, check=True)
            response = json.loads(completed.stdout)
            with sqlite3.connect(os.environ["SAP_HERMES_INTENT_DB"]) as database:
                database.execute("UPDATE intents SET status='completed',response=? WHERE id=?", (json.dumps(response), request["runId"]))
            self.reply(200, response)
        except (subprocess.SubprocessError, ValueError, KeyError, TypeError):
            with sqlite3.connect(os.environ["SAP_HERMES_INTENT_DB"]) as database:
                database.execute("UPDATE intents SET status='failed' WHERE id=?", (request["runId"],))
            self.reply(503, {"error": "HERMES_REVIEW_FAILED", "requiresHumanReview": True})


def main() -> None:
    if len(sys.argv) > 1 and sys.argv[1] == "--child":
        value = infer(json.loads(sys.stdin.buffer.read()))
        sys.stdout.write(json.dumps(value, ensure_ascii=False))
        return
    verify_checkout()
    if len(os.environ["HERMES_REVIEW_SECRET"]) < 32:
        raise RuntimeError("HERMES_REVIEW_SECRET_TOO_SHORT")
    for variable in ("HERMES_MODEL_VERSION", "HERMES_PROVIDER_API_KEY", "HERMES_INPUT_USD_PER_MILLION", "HERMES_OUTPUT_USD_PER_MILLION", "SAP_HERMES_INTENT_DB"):
        if not os.environ.get(variable):
            raise RuntimeError("Missing configuration: " + variable)
    path = Path(os.environ["SAP_HERMES_INTENT_DB"]).resolve()
    path.parent.mkdir(parents=True, exist_ok=True)
    with sqlite3.connect(path) as database:
        database.execute("CREATE TABLE IF NOT EXISTS intents(id TEXT PRIMARY KEY,request_hash TEXT NOT NULL,status TEXT NOT NULL,response TEXT)")
    os.chmod(path, 0o600)
    ThreadingHTTPServer((os.environ.get("SAP_HERMES_BIND", "127.0.0.1"), int(os.environ.get("SAP_HERMES_PORT", "8092"))), Handler).serve_forever()


if __name__ == "__main__":
    main()
