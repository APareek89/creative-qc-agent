# framewise — Creative QC Agent

Framewise turns a product-image brief into a calibrated, self-QCing production run. A human approves five examples once; Claude Sonnet 5 builds the recipe and visually cross-checks the final rubric judgment, fal/OpenRouter VLMs extract preliminary evidence, and a bounded LangGraph workflow uses fal.ai FLUX.2 Edit to generate, revise, accept, or visibly escalate each asset.

The app is Phase 0 of the supplied PRD: e-commerce images only. It includes all six product screens, a deterministic no-key demo, live providers, durable state, a queue worker, delivery exports, and deployment infrastructure.

## What is built

- Three-step batch wizard for 1–50 source images, reference looks, a brief, ratios, variants, and a spend cap; every selected source × ratio × variant becomes an explicit output, bounded at 200.
- Human calibration UI with approve/reject notes and an enforced five-approval gate.
- Claude Sonnet 5 Brief/Spec, Prompt-Synthesis, and final visual QC reasoning agents with schema-constrained outputs; final QC receives source and candidate pixels so weak VLM evidence cannot silently become a pass.
- fal/OpenRouter visual QC using free Nemotron Nano 12B VL first and Qwen3-VL 8B as the automatic low-cost fallback.
- fal.ai `fal-ai/flux-2/klein/4b/base/edit` generation with the source pinned as image 1, references explicitly style-only, exact requested output ratios, and QC correction feedback.
- A LangGraph.js loop with two feedback retries, ranked prompt fallbacks, five total attempts, per-asset and per-batch cost caps, and `needs_review` escalation.
- BullMQ retries, stable job boundaries, a dead-letter queue, graceful worker shutdown, and terminal batch reconciliation.
- Live batch board, asset evidence drawer, editable recipe panel with real win rates, manual overrides, and delivery ZIP/manifest/CDN CSV.
- Postgres/Drizzle persistence and Supabase Storage with file-signature, size, host, and cleanup guardrails.
- QC-vs-human agreement evaluator, unit/integration tests, deployment blueprint, and scaling/FMEA documentation.

See [the architecture flow](docs/ARCHITECTURE_FLOW.md) for the complete agent and data path.

## Run the review demo

Requires Node.js 22+.

```bash
npm install
npm run dev
```

Open `http://localhost:3000`. With no live configuration, the app deliberately enters deterministic demo mode. You can create a batch, approve five candidates, inspect the synthesized recipe, run every asset through the simulated agent loop, and download a real delivery archive without making paid calls.

## Run live

1. Copy `.env.example` to `.env.local` and set every required secret listed below.
2. Create a **public** Supabase Storage bucket matching `SUPABASE_STORAGE_BUCKET` (default `creative-qc`). The service-role key remains server-only.
3. Apply the idempotent Postgres migration with `npm run db:migrate`.
4. Run `npm run preflight`, then start the web app with `npm run dev:live` and the worker in another terminal with `npm run worker`.
5. Check `http://localhost:3000/api/health`, create a small batch, and keep the first live cost cap low.

`DEMO_MODE=false` is strict: startup fails if the LLM, image provider, database, queue, or storage configuration is missing or fails a live probe. The dashboard shows per-dependency readiness rather than silently substituting canned demo output. The LLM key is not optional in the agentic path.

## Environment variables

Core live variables:

| Variable | Responsibility |
|---|---|
| `ANTHROPIC_API_KEY` | **Required reasoning LLM** for spec creation, prompt synthesis, and final QC judgment |
| `FAL_KEY` | **Required generation + VLM provider** credential |
| `DATABASE_URL` | Postgres state for batches, attempts, QC, approvals, and prompts |
| `REDIS_URL` | BullMQ jobs, retries, and dead-letter queue |
| `SUPABASE_URL` | Object-storage project URL |
| `SUPABASE_SERVICE_KEY` | Server-only object-storage service credential |
| `SUPABASE_STORAGE_BUCKET` | Public output/source bucket; defaults to `creative-qc` |
| `DEMO_MODE` | Set `false` for live; `true` for deterministic review mode |

Model and guardrail tuning:

| Variable | Default |
|---|---:|
| `ANTHROPIC_MODEL` | `claude-sonnet-5` |
| `FAL_GENERATION_MODEL` | `fal-ai/flux-2/klein/4b/base/edit` |
| `FAL_VLM_MODEL` | `nvidia/nemotron-nano-12b-v2-vl:free` |
| `FAL_VLM_FALLBACK_MODEL` | `qwen/qwen3-vl-8b-instruct` |
| `GENERATION_COST_ESTIMATE_USD` | `0.018` base for one 1 MP source + one 1 MP output; each supplied reference adds `0.009` |
| `COST_CAP_USD_PER_BATCH` | `5` |
| `COST_CAP_USD_PER_ASSET` | `0.5` |
| `MAX_ATTEMPTS_PER_ASSET` | `5` |
| `FEEDBACK_RETRIES` | `2` |
| `QC_PASS_SCORE` | `80` |
| `WORKER_CONCURRENCY` | `4` |
| `BATCH_CREATION_LIMIT_PER_HOUR` | `5` |
| `PROVIDER_TIMEOUT_MS` | `180000` |
| `NEXT_PUBLIC_APP_URL` | `http://localhost:3000` |
| `LOG_LEVEL` | `info` |

The batch cap entered in the UI is persisted per batch. The environment defaults set server-side ceilings and per-asset behavior.

The displayed hard cap currently covers fal image-generation calls, which are the dominant variable cost. Anthropic token usage and fal/OpenRouter VLM token cost are logged per request but are not yet included in the generation-spend meter. The free Nemotron route can require provider-side input logging; accounts with stricter OpenRouter privacy guardrails automatically use the configured Qwen fallback instead.

## Quality commands

```bash
npm run typecheck
npm test
npm run build
npm run check
npm run eval:qc
```

`npm run eval:qc path/to/labels.json` accepts an array of `{ id, humanApproved, qcPassed }` records and reports agreement, precision, recall, and explicit false positives/negatives. The bundled fixture is free and deterministic; live golden-image evaluation is intentionally not run until provider keys and spend approval exist.

## Deployment

`render.yaml` deploys a free Next.js web service plus one Starter BullMQ worker in Singapore. The trial deployment reuses the externally managed Postgres, Redis, and Supabase resources configured in the environment, so it does not provision duplicate paid data services. All provider and data credentials are Render environment variables and are never committed. The configuration follows the current [Render Blueprint specification](https://render.com/docs/blueprint-spec).

## Phase boundary

Authentication, multi-tenant billing, reusable cross-batch recipes, public APIs/MCP, video production, and team workflows are intentionally later phases. The data model and queue boundaries leave room for them without pretending they are part of Phase 0.
