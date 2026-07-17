# FMEA — Live Source-Conditioned Creative QC

## 🔍 FMEA Analysis — live-mode verification and source-fidelity repair

**Analyzed at**: unborn `HEAD` · scanned-source SHA-256 `34549737ed4e3c746c5d85dee812ed05c13a787e12da803850336df559d0ce61` (Power Coding is configured to propose checkpoint commits, so no commit exists yet; this deterministic hash covers the source/worker/infra/architecture files listed by the scan)
**Scan scope**: 67 files, 10,734 lines · **Product context**: approve five source-faithful e-commerce examples, then generate, QC, revise, and deliver up to 200 ratio-specific outputs autonomously (`Creative-QC-Agent-PRD.md`)
**Failure modes found**: 13 open (0 P0, 0 P1, 13 P2); 9 higher-risk modes were closed during this scan

| # | Component | Failure Mode | Effect | Root Cause | Recommended action | S | O | D | RPN | Priority |
|---|---|---|---|---|---|---:|---:|---:|---:|---|
| 1 | `src/lib/storage.ts` | Source and output objects share one required public bucket | A leaked object URL exposes an unpublished source product | Phase 0 uses public URLs so fal and Gemini can fetch inputs and delivery links remain copyable | Split private source/reference storage from public approved outputs; issue short-lived signed input URLs | 7 | 2 | 6 | 84 | 🟢 P2 |
| 2 | `render.yaml`, `worker/index.ts` | CPU/memory autoscaling can lag a deep provider-bound queue | A traffic spike completes slowly while workers appear CPU-idle | Render has no BullMQ-depth scaling target | Alert on oldest-job age/queue depth and scale worker count from queue telemetry | 5 | 3 | 5 | 75 | 🟢 P2 |
| 3 | `src/app/api/batches/[id]/delivery/route.ts` | A near-limit archive holds input images plus compressed ZIP in web memory | Export can exhaust an undersized web instance | Phase 0 uses in-memory JSZip | Move archives above 100 MB to a streaming export worker and object-storage URL | 6 | 2 | 6 | 72 | 🟢 P2 |
| 4 | `src/lib/storage.ts` | Failed/rejected attempt outputs remain indefinitely | Storage use and cost grow across repeated production runs | Attempt evidence is durable but has no retention policy | Add lifecycle rules and retain only manifests plus accepted outputs after an audit window | 4 | 4 | 4 | 64 | 🟢 P2 |
| 5 | `src/app/api/batches/route.ts` | A chunked request without `Content-Length` is buffered before the 200 MB file-total check | A hostile upload can pressure web memory | The early 205 MB guard depends on the transport header; `request.formData()` buffers multipart data | Add proxy-level request-size enforcement or a streaming multipart parser before public launch | 6 | 2 | 5 | 60 | 🟢 P2 |
| 6 | `src/lib/rate-limit.ts` | A distributed caller can bypass the per-IP creation limit | Public live provider keys can receive several capped batches | Authentication is outside Phase 0 and throttling is IP-only | Add portfolio authentication and per-account quotas before exposing the deployment publicly | 5 | 2 | 6 | 60 | 🟢 P2 |
| 7 | `src/app/api/batches/[id]/delivery/route.ts` | Assets are marked delivered when the ZIP is generated, not when the client receives it | An interrupted download can still show delivered state | HTTP response completion is not acknowledged by the client | Track `package_generated` separately; confirm delivery with a client callback or signed-download event | 4 | 3 | 5 | 60 | 🟢 P2 |
| 8 | `src/lib/providers/gemini.ts`, `src/lib/repository.ts` | The batch spend cap records fal generation but not Gemini reasoning/embedding spend | Displayed spend can understate the provider invoice | The PRD treats generation as the only material cost | Persist Gemini usage metadata and show generation spend separately from total model spend | 4 | 3 | 5 | 60 | 🟢 P2 |
| 9 | `src/lib/providers/fal.ts` | A timed-out fal request may finish remotely before BullMQ retries | The external invoice can include an orphaned render | Cancellation after provider processing begins is best-effort | Persist provider request IDs at submit time and reconcile timed-out requests before retrying | 5 | 2 | 5 | 50 | 🟢 P2 |
| 10 | `src/lib/repository.ts` | Dashboard hydration performs several queries per recent batch | Portfolio history slows as batch count grows | Repository returns inspectable aggregate objects instead of SQL projections | Add aggregate dashboard SQL and cursor pagination beyond the Phase 0 portfolio | 4 | 4 | 3 | 48 | 🟢 P2 |
| 11 | `src/lib/repository.ts` | Prompt win counters update after the QC evidence transaction | A narrow DB failure can undercount one prompt use | Asset/QC persistence and prompt analytics are separate calls | Update prompt counters in the same transaction as the terminal QC result | 3 | 2 | 6 | 36 | 🟢 P2 |
| 12 | `src/lib/runtime-health.ts` | Simultaneous cold health checks can each probe external providers | A health-check burst can consume provider quota and add latency | The 30-second cache has no shared in-flight promise and is process-local | Deduplicate the in-flight probe and use a scheduled readiness canary in production | 3 | 3 | 4 | 36 | 🟢 P2 |
| 13 | `src/lib/orchestrator/graph.ts`, `worker/index.ts` | Exhausted calibration/synthesis jobs expose an error but no one-click workflow restart | A user must re-enter the flow or use a different action after repeated provider failure | BullMQ retries are automatic, but post-DLQ recovery has no dedicated UI control | Add `retry_calibration` / `retry_synthesis` actions that resume durable progress | 3 | 3 | 4 | 36 | 🟢 P2 |

### 🔴 P0 — Fix before merge

None open.

### 🟡 P1 — Fix this sprint

None open. The scan closed the live/demo deception, source/reference ambiguity, ignored aspect-ratio settings, reference-cost under-reservation, candidate-decision overwrite race, duplicate batch-run race, partial intake cleanup, worker terminalization coupling, and superficial configuration-only health checks.

### 🟢 P2 — Track / next sprint

The concrete actions are ordered by RPN in the table. Prioritize private input storage, queue-depth operations, and streaming delivery before making this portfolio deployment broadly public.

**Coverage**: 12/12 categories checked. No open failures found in `unhandled_error_paths` or `config_feature_flag_drift` after the live preflight/startup and state-transition fixes. Open findings cover external dependency failures, race/state, resource exhaustion, security/access, partial writes, observability, scale/load, billing mismatch, retry/idempotency, and PRD edge cases.
