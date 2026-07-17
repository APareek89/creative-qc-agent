# Handoff.MD — Creative QC Agent
last-synced: `25c94af · Render provider migration live`
> AGENT: read fully at session start; reconcile commits after `last-synced`.
> Update before checkpoint commits or phase end; keep this current snapshot under ~40 lines.

## Current state
- ✅ Shipped: Phase 0 source-conditioned calibration, bounded autonomous QC/delivery, live dependencies, Render services, and provider hardening (see git log and Learning.MD).
- ✅ Gemini is removed from the runtime. Claude Sonnet 5 owns spec, recipe, and final QC reasoning; fal/OpenRouter owns visual evidence; FLUX.2 Klein 4B Edit owns generation.
- ✅ Structured outputs are validated twice: Anthropic-compatible constrained JSON first, then strict Zod business validation.
- ✅ Visual QC tries free Nemotron, retries retryable failures, falls back to Qwen, and opens a 15-minute primary circuit after failure so one unavailable model does not stall every asset.
- ✅ Phase 0 accepts image references only; every generated image is capped at 10 MB so Claude and VLM downstream steps can consume it.
- ✅ Verification: 8 test files / 27 tests, TypeScript, production build, 3 valid Mermaid diagrams, and 0 npm vulnerabilities.
- ✅ Full FMEA at `a6aa51e`: 0 P0, 0 P1, 17 tracked P2 findings in `docs/FMEA.md`.
- ✅ Render web and Starter worker are live on `25c94af`; public health reports DB, Redis, Storage, Anthropic, VLM, and fal all `ok`.

## Live dependency status
- ✅ Postgres, Redis, public Supabase Storage, Anthropic, fal generation, and fal VLM endpoint pass live preflight; Claude real inference and all three structured agent contracts passed smoke tests.
- ⚠️ The free Nemotron route is blocked by the account's current OpenRouter privacy guardrail; the tested Qwen fallback works and cost $0.0005–$0.0007 per smoke call.
- 🚀 Render deployment uses a free web service plus one Starter worker and reuses the external DB/Redis/Storage rather than provisioning duplicate Pro infrastructure.

## Decisions
- 2026-07-17 — Build Phase 0 only; auth, teams, reusable recipes, public API/MCP, production video, and private/public split storage remain later phases.
- 2026-07-17 — Strict live readiness is behavioral: credentials must pass actual probes; no demo substitution when `DEMO_MODE=false`.
- 2026-07-17 — FLUX.2 Klein 4B Base Edit remains the cheapest selected fal editor; explicit reference roles and exact ratio mapping protect fidelity.
- 2026-07-17 — Power Coding remains `git_checkpoints: propose`; no commit created without user approval.
- 2026-07-17 — Trial hosting uses Render free web + Starter worker with external data services to minimize hosting cost; paid actions stay blocked until every provider passes preflight.
- 2026-07-17 — Replace Gemini with Claude Sonnet 5 reasoning plus fal/OpenRouter Nemotron visual evidence and Qwen fallback; deterministic code remains the only pass/fail and spend authority.
- 2026-07-17 — Phase 0 reference uploads are images only; accepting unusable video references would create a silent-quality failure.

## Pending
- ✅ AGENT: Provider migration is pushed, Render environments are synced, both services are live, and `/`, `/new`, `/architecture`, and `/api/health` return 200/healthy.
- 🧑 USER: If the zero-cost Nemotron route is required, allow its provider data policy in OpenRouter; until then Qwen is the working automatic fallback.
- 🧑 USER: Run one low-cap real batch in the live UI and judge product fidelity; paid golden-image evals remain approval-only.
- 🧑 USER: Decide whether to turn on the free Loop; paid golden-image evals remain approval-only.

**Session efficiency:** 🎯 ~50% provider architecture · 🔧 ~30% Render/provider validation · 🔁 ~20% schema/fallback hardening
