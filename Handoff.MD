# Handoff.MD — Creative QC Agent
last-synced: `unborn · initial Render deployment checkpoint in progress`
> AGENT: read fully at session start; reconcile commits after `last-synced`.
> Update before checkpoint commits or phase end; keep this current snapshot under ~40 lines.

## Current state
- ✅ Phase 0 app is feature-complete and production-build clean: 7 test files / 25 tests, TypeScript, Next build, 3 valid Mermaid diagrams, 0 npm vulnerabilities, clean 70-file secret scan.
- ✅ Screenshot root cause proven: the batch was created in deterministic demo mode, whose canned SVG gallery does not use uploaded product pixels.
- ✅ Live mode no longer exposes fake demo links or silently falls back; dashboard and worker use actual DB, Redis, Storage, Gemini, and fal readiness probes.
- ✅ fal uses the cheapest selected edit endpoint (`flux-2/klein/4b/base/edit`), pins image 1 as product identity, treats images 2–4 as style-only, and reserves $0.018–$0.045 by input count.
- ✅ Every source × selected ratio × variant is persisted and generated at the requested dimensions, with a 200-output ceiling.
- ✅ Run claiming, enqueue rollback, calibration decision preservation, terminal worker state, retry budgets, and delivery guards hardened.
- ✅ Render services created; web builds explicitly include TypeScript tooling, Node is pinned to verified 22.x, and the worker's `tsx` launcher is a production dependency.
- ✅ Full 12-category FMEA: 0 P0, 0 P1, 13 tracked P2s at `docs/FMEA.md`, source snapshot `34549737ed4e`.

## Live dependency status
- ✅ Postgres, Redis, public Supabase Storage, and fal pass real live probes; the schema is migrated.
- ⛔ Gemini returns `429 RESOURCE_EXHAUSTED` because the linked project's prepaid credits are depleted; paid workflow calls remain fail-closed.
- 🚀 Render deployment uses a free web service plus one Starter worker and reuses the external DB/Redis/Storage rather than provisioning duplicate Pro infrastructure.

## Decisions
- 2026-07-17 — Build Phase 0 only; auth, teams, reusable recipes, public API/MCP, production video, and private/public split storage remain later phases.
- 2026-07-17 — Strict live readiness is behavioral: credentials must pass actual probes; no demo substitution when `DEMO_MODE=false`.
- 2026-07-17 — FLUX.2 Klein 4B Base Edit remains the cheapest selected fal editor; explicit reference roles and exact ratio mapping protect fidelity.
- 2026-07-17 — Power Coding remains `git_checkpoints: propose`; no commit created without user approval.
- 2026-07-17 — Trial hosting uses Render free web + Starter worker with external data services to minimize hosting cost; paid actions stay blocked until every provider passes preflight.

## Pending
- 🤖 AGENT: Finish the initial private GitHub/Render deployment and verify the public web health endpoint.
- 🧑 USER: Replenish the Gemini project's credits, then run one low-cap live batch.
- 🧑 USER: Decide whether to turn on the free Loop; paid golden-image evals remain approval-only.

**Session efficiency:** 🎯 ~25% deployment · 🔧 ~70% Render/Git/provider setup · 🔁 ~5% rework
