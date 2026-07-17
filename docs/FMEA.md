# FMEA — Claude + fal Visual QC Production Flow

## 🔍 FMEA Analysis — provider migration and live agent workflow

**Analyzed at**: `b1c49bc` plus the live-workflow score-scale fix pending checkpoint
**Scan scope**: provider migration plus one complete live Render batch · **Product context**: approve five source-faithful e-commerce examples, then generate, visually inspect, reason, revise, and deliver up to 200 ratio-specific outputs autonomously (`Creative-QC-Agent-PRD.md`)
**Failure modes found**: 17 open (0 P0, 0 P1, 17 P2); 9 provider/live-workflow modes are closed

| # | Component | Failure Mode | Effect | Root Cause | Recommended action | S | O | D | RPN | Priority |
|---|---|---|---|---|---|---:|---:|---:|---:|---|
| 1 | `src/lib/storage.ts` | Source, reference, and output objects share one public bucket | Anyone holding a leaked URL can view an unpublished product image | Phase 0 uses public URLs so Anthropic, fal, and delivery clients can fetch inputs | Split private inputs from public approved outputs and issue short-lived signed input URLs | 7 | 2 | 6 | 84 | 🟢 P2 |
| 2 | `render.yaml`, `worker/index.ts` | CPU/memory autoscaling can lag a deep provider-bound queue | A traffic spike completes slowly while workers appear CPU-idle | Render has no BullMQ-depth scaling target | Alert on oldest-job age and queue depth; scale worker count from queue telemetry | 5 | 3 | 5 | 75 | 🟢 P2 |
| 3 | `src/app/api/batches/[id]/delivery/route.ts` | A near-limit archive holds fetched images plus the compressed ZIP in web memory | Export can exhaust the free web instance | Phase 0 uses in-memory JSZip | Move archives above 100 MB to a streaming export worker and signed object URL | 6 | 2 | 6 | 72 | 🟢 P2 |
| 4 | `src/lib/runtime-health.ts` | fal readiness proves credentials and endpoint access, not selected VLM inference/data-policy access | Health can be green while Nemotron is blocked and the first QC must fall back | A non-billable queue probe cannot fully exercise a model route | Add a scheduled canary that runs one known image through the configured primary and fallback outside request health checks | 5 | 2 | 7 | 70 | 🟢 P2 |
| 5 | `src/lib/storage.ts` | Failed and rejected attempt outputs remain indefinitely | Storage use and cost grow across repeated runs | Attempt evidence has no retention policy | Add lifecycle rules and retain only manifests plus accepted outputs after an audit window | 4 | 4 | 4 | 64 | 🟢 P2 |
| 6 | `src/app/api/batches/route.ts` | A chunked request without `Content-Length` is buffered before the 200 MB file-total check | A hostile upload can pressure web memory | The early transport guard depends on a header; `request.formData()` buffers multipart data | Add proxy-level request-size enforcement or a streaming multipart parser before public launch | 6 | 2 | 5 | 60 | 🟢 P2 |
| 7 | `src/lib/rate-limit.ts` | A distributed caller can bypass the per-IP creation limit | Public provider keys can receive several capped batches | Authentication is outside Phase 0 and throttling is IP-only | Add portfolio authentication and per-account quotas before broad public exposure | 5 | 2 | 6 | 60 | 🟢 P2 |
| 8 | `src/app/api/batches/[id]/delivery/route.ts` | Assets are marked delivered when the ZIP is generated, not when the client receives it | An interrupted download still shows delivered | HTTP response completion is not acknowledged by the client | Track `package_generated` separately and confirm delivery from a signed-download event | 4 | 3 | 5 | 60 | 🟢 P2 |
| 9 | `src/lib/providers/anthropic.ts`, `src/lib/providers/vlm.ts`, `src/lib/repository.ts` | The persisted hard cap includes generation but not Claude/VLM token spend | Total provider invoice can exceed the displayed generation cap | Agent usage is logged but not stored in the batch ledger | Persist provider usage/cost and add a separate total-model budget before production billing | 4 | 3 | 5 | 60 | 🟢 P2 |
| 10 | `src/lib/orchestrator/graph.ts`, `src/lib/db/schema.ts` | The final QC row omits which VLM/fallback produced the evidence | A disputed decision cannot be reproduced from database state alone | Model and fallback metadata are logged but not part of `qc_results` | Persist `evidence_model`, fallback flag, and a compact evidence JSON snapshot per QC result | 4 | 3 | 5 | 60 | 🟢 P2 |
| 11 | `src/lib/providers/fal.ts` | A timed-out fal generation may finish remotely before BullMQ retries | The invoice can include an orphaned render | Cancellation after provider processing begins is best-effort | Persist provider request IDs at submit time and reconcile timed-out requests before retrying | 5 | 2 | 5 | 50 | 🟢 P2 |
| 12 | `src/lib/providers/vlm.ts` | The primary-model circuit breaker is process-local | Multiple worker instances each rediscover the same blocked primary | The 15-minute circuit is in module memory | Store provider-circuit state in Redis when adding a second worker instance | 3 | 4 | 4 | 48 | 🟢 P2 |
| 13 | `src/lib/repository.ts` | Dashboard hydration performs several queries per recent batch | Portfolio history slows as batch count grows | Repository returns full inspectable aggregates instead of SQL projections | Add aggregate dashboard SQL and cursor pagination beyond Phase 0 | 4 | 4 | 3 | 48 | 🟢 P2 |
| 14 | `src/lib/storage.ts`, `src/lib/orchestrator/graph.ts` | A generated image above 10 MB is rejected after a paid render | The attempt consumes budget but produces no QC-able candidate | Downstream Claude image limits are stricter than the generation endpoint | Request compressed WebP where quality permits or add a trusted resize/compression step before storage | 4 | 2 | 5 | 40 | 🟢 P2 |
| 15 | `src/lib/repository.ts` | Prompt win counters update after the QC evidence transaction | A narrow DB failure can undercount one prompt use | Asset/QC persistence and prompt analytics are separate calls | Update prompt counters in the same transaction as the terminal QC result | 3 | 2 | 6 | 36 | 🟢 P2 |
| 16 | `src/lib/runtime-health.ts` | Simultaneous cold health checks can each probe external providers | A health-check burst adds provider latency and rate-limit pressure | The 30-second cache has no shared in-flight promise and is process-local | Deduplicate the in-flight probe and use a scheduled readiness canary | 3 | 3 | 4 | 36 | 🟢 P2 |
| 17 | `src/lib/providers/vlm.ts`, `README.md` | Enabling the free Nemotron route can permit provider-side input logging | Confidential product images can be retained under the route's data policy | The zero-cost provider trades privacy for access | Keep Qwen primary for confidential workloads; require an explicit deployment decision before relaxing OpenRouter privacy controls | 6 | 1 | 6 | 36 | 🟢 P2 |

### 🔴 P0 — Fix before merge

None open.

### 🟡 P1 — Fix this sprint

None open. The migration closed quota-bound Gemini startup, schema-incompatible Anthropic output contracts, malformed Qwen evidence, repeated primary VLM failures, silent video-reference acceptance, non-HTTPS Anthropic images, and oversized downstream agent inputs before deployment. The live batch then exposed and closed one additional P1: semantically valid 0–1 Claude QC subscores could pass 0–100 range validation and force false retries. The provider now normalizes a complete 0–1 score vector, explicitly prompts the 0–100 unit, logs normalization, and has two scale-regression tests.

### 🟢 P2 — Track / next sprint

The table is sorted by RPN. Prioritize private input storage, queue-depth operations, provider canaries, full model-cost accounting, and persisted VLM provenance before production or multi-tenant use.

**Coverage**: 12/12 categories checked. No open failure was found in `unhandled_error_paths`, `race_conditions_and_state`, `config_feature_flag_drift`, or Phase 0 reference-format edge cases after the retry/DLQ, deterministic policy, strict environment, and image-only validation fixes. Open findings cover external dependency failure, resource exhaustion, security/access, partial writes, observability, scale/load, billing mismatch, retry/idempotency, and remaining PRD deployment edges.
