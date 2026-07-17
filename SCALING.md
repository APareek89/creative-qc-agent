# Scaling and reliability

## Phase 0 operating envelope

- 1–50 source images, 1–3 selected ratios, 1–4 variants per source/ratio, a hard ceiling of 200 output jobs, and up to 10 references per batch.
- 10 MB per source, 12 MB per reference, and 200 MB combined upload body.
- At most 5 generation attempts per asset, 2 feedback-guided retries per prompt, a default $0.50 asset cap, and a persisted batch cap.
- 25 MB per generated/delivery image and 250 MB total delivery input to keep in-memory ZIP creation bounded.
- One BullMQ job per asset run; four concurrent jobs per worker by default.

## Horizontal path

The web tier is stateless in live mode. Postgres is authoritative, Supabase owns files, and Redis owns work. Additional web instances can be added without sticky sessions. Worker instances can be added independently; with `W` workers, effective generation concurrency is approximately `W × WORKER_CONCURRENCY`, bounded by fal.ai and Gemini quotas.

Start at one worker with concurrency 4. Raise concurrency only after observing provider 429s, job latency, Node heap, Postgres connection count, and queue depth. Render autoscaling responds to CPU/memory rather than BullMQ depth, so queue-depth alerts remain the meaningful capacity signal.

## Recovery and idempotency

- Batch spend reservation is an atomic conditional Postgres update; a call cannot start after the cap would be exceeded.
- Asset run IDs include a run token so explicit retries are not blocked by retained failed jobs, while the API rejects a second active run.
- Attempt writes and QC evidence are transactional and upserted on `(asset_id, attempt_number)` / `attempt_id`.
- A worker retry resumes an output already in `qc` instead of regenerating it.
- Calibration candidates persist after every successful render, so a provider failure resumes from durable progress.
- Exhausted jobs enter `creative-qc-dlq`; failed assets become visible and do not block sibling assets.
- The last terminal asset reconciles its batch to `done`, including after worker-level failure or manual approval.

## Backpressure and provider limits

BullMQ owns backpressure. Keep `noeviction` and persistence enabled for Redis because queue state is not a cache. Configure fal.ai and Gemini account quotas above total worker concurrency, or reduce `WORKER_CONCURRENCY`. Exponential BullMQ retries are limited to three. LangGraph retries are a separate, quality-driven budget and remain bounded by attempts and cost.

## Storage and memory

Uploads and provider downloads are validated by declared and actual size. Remote image fetches use fixed timeouts and trusted-host allowlists. Delivery ZIPs are intentionally created in memory for Phase 0; above 250 MB, move export construction to a streaming worker that writes the archive to object storage and returns a signed URL.

## Database

The app uses a small connection pool per process. At several web/worker instances, put PgBouncer in front of Postgres and size `max connections` for the total process count. Dashboard hydration currently favors clarity over maximum query efficiency; if batch history grows past the Phase 0 portfolio workload, replace per-batch hydration with aggregate SQL projections and cursor pagination.

## Alerts to add for a public production launch

- Oldest waiting BullMQ job and DLQ count.
- Batch stuck in `calibrating`, `synthesizing`, or `autonomous_running` beyond an expected duration.
- fal.ai/Gemini latency, 429/5xx rate, schema failures, and cost per accepted asset.
- Postgres connection saturation and Redis memory/persistence health.
- Auto-pass rate drift, prompt win-rate drift, and QC-vs-human holdout agreement.

Structured worker logs are already emitted. Sentry/OTel exporters are deliberately not advertised as environment variables until they are wired in a later operational pass.
