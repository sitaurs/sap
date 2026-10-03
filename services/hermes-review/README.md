# SAP private Hermes reviewer

Implements the private worker transport for `sap-evidence-review-v1`. The service never changes report status or publishes content. All results require human review. A failed provider, invalid result, exhausted budget or stale revision retains the manual admin queue.

## Runtime preparation

Use [the official source environment workflow](https://hermes-agent.nousresearch.com/docs/guides/python-library). Clone the official repository into a dedicated service checkout and check out **`bd0affe5e5f723579df8902852f5d0c47795f355`**. Prepare its source environment according to that pinned checkout's instructions. The service refuses a checkout containing `.env`, because the SDK loads that file implicitly; supply the documented model settings through the isolated service environment. No provider call or installation was performed as part of implementing this service.

Required service environment:

| Name | Purpose |
| --- | --- |
| `SAP_HERMES_CHECKOUT` | Absolute path to the pinned source checkout |
| `SAP_HERMES_INTENT_DB` | Persistent writable SQLite path for inference intent replay; private volume, never an ephemeral temp path |
| `HERMES_REVIEW_SECRET` | Server/worker shared random secret, at least 32 characters |
| `HERMES_MODEL_VERSION` | Exact provider model identifier, matching SAP worker config |
| `HERMES_PROVIDER_API_KEY` | Provider credential, available only to the reviewer service |
| `HERMES_PROVIDER` | Provider name; default `openrouter` |
| `HERMES_PROVIDER_BASE_URL` | Optional explicitly configured provider base URL |
| `HERMES_INPUT_USD_PER_MILLION` | Operator-reviewed upper bound on this model's input/image/cache/reasoning cost |
| `HERMES_OUTPUT_USD_PER_MILLION` | Operator-reviewed upper bound on output cost |
| `SAP_HERMES_BIND`, `SAP_HERMES_PORT` | Default `127.0.0.1:8092`; private network only |

Run `python /absolute/path/to/sap-run/services/hermes-review/server.py` using the activated Hermes interpreter. `/health` reports pin/policy/tool configuration; it does not prove provider readiness. Connect worker `HERMES_REVIEW_URL` to the private origin and configure the same secret/model/policy. Enable the SAP master and Hermes flags only after provider/model, pricing bounds, data handling and evidence pilot have been reviewed. There is no browser-facing Hermes endpoint.

## Resource and privacy rules

- A fresh isolated process and temporary Hermes profile are created for each inference. Context files, memory, background review, trajectories, checkpoints and tools are disabled. Child process environment uses a whitelist for interpreter/network/model settings; SAP database, Meta credentials and the transport secret are not forwarded.
- One model completion per review is sufficient with no tools. The SAP limit of six iterations is a ceiling; this wrapper uses one. The process is terminated at the request deadline and internal provider retries are disabled.
- Server snapshots contain coarse area IDs and evidence references, not account identity or exact GPS. Normalized photo bytes are transported privately; requests never expose storage keys or signed URLs to the model. Snapshot text and text in images are treated as untrusted evidence.
- Input, output, media and conservative price limits fail to human review. Daily PostgreSQL reservations retain the full run cap rather than refunding unknown/billed requests. Model/provider tokenization, image pricing and reasoning charges must be included in operator-reviewed upper bounds before production; this is a conservative admission guard, not an assertion of exact provider billing.
- The service persists only intent hashes/status and the validated structured result. It never persists request snapshots/photos or agent conversation history. Restrict access to SQLite and establish retention for structured results.
- Duplicate worker transport with the same intent returns the persisted response. Pending/failed intent is not inferred again. A crash of unknown inference fails safely; admin rerun creates a new intent.
- Python and worker validate IDs, revisions, snapshot hash, enum values, maximum text lengths, foreign evidence and duplicate IDs. Completion is still a recommendation.

## Integration limitations

The checked-in Python source has been syntax reviewed, but the pinned Hermes environment/provider has not been installed or invoked. The runtime requires an operator-provided credential and measured model/pricing setup. Images exceeding conservative admission limits deliberately fall back to humans. Updating Hermes requires explicitly reviewing internal persistence/retry fields and updating the pin; startup refuses a different checkout revision.
