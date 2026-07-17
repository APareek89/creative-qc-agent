# Creative QC Agent → "Media-as-a-Service by Agents" — PRD + Claude Code Build Guide

**Version:** 1.0 · **Owner:** Anand Pareek · **Status:** Ready to build · **Build scope: FOCUS ON PHASE 0 ONLY**
**One-liner:** *Upload your product images + a few reference looks, approve the first 5 samples, and a pair of vision agents generate, QC, and deliver the rest — no human in the loop after calibration.*

---

## 0. HOW CLAUDE CODE SHOULD USE THIS DOCUMENT (read first)

> **a) ALIGN THE ARCHITECTURE WITH ME BEFORE WRITING ANY CODE.**
> Read this whole PRD, then: (1) restate the architecture + the agent roles back to me in your own words; (2) confirm the tech choices (esp. the **generation model** — see §6 — and orchestration lib); (3) print the **`.env` / secrets checklist** from §10 and ask which generation provider I want for P0; (4) confirm you will **build Phase 0 only** and stub later phases. **Do not scaffold until I reply "architecture approved."**
>
> **b) EXECUTE PROMPTS ONE AT A TIME, TEACHING AS YOU GO.**
> Work through §11 one prompt at a time. **Before each step**, explain in *plain English first, then the technical terms* — what you're building, why, and how (e.g., "we're adding a visual evidence model plus a reasoning judge that grades each image against the brief"). After each step, show the diff + a one-line "what changed / how to verify," and **pause for my OK**. I want to *learn the stack* as we build.
>
> **c) COMPLETE UI/UX IS IN §9.** Build a genuinely good, modern interface to that spec — this project is a portfolio showpiece.

---

## 1. Problem & purpose

E-commerce teams need lots of near-identical, on-brand creative: **multiple catalogue views of one product**, or **50 SKUs turned into lifestyle scenes**. Doing this by hand (or one-shot AI generation + human QC of every asset) doesn't scale. The insight: a human only needs to define "good" **once** (approve ~5 samples); after that, agents can generate the rest and **QC each other's work** against that standard.

**Portfolio purpose:** proves agentic orchestration + a vision **eval/QC loop** + product taste + Anand's media-domain edge — and it's the strongest horizontal-scale story of the portfolio (50 images = 50+ parallel jobs). Differentiator is **not** the generation (commoditized) — it's the **calibrate-once, self-QC, deliver-autonomously** loop.

## 2. The core idea (the mechanic you specified)

```
        CALIBRATE (human, once)                    AUTONOMOUS (agents, the rest)
   ┌───────────────────────────────┐     ┌────────────────────────────────────────────┐
   │ system generates candidates   │     │  for each remaining asset:                  │
   │ for a few items → human        │     │   try Priority Prompt P1                     │
   │ APPROVES 5 (rejects w/ notes)  │──▶  │     → QC agent (VLM) grades vs rubric        │
   │                                │     │        ├─ PASS → accept                      │
   │ Prompt-Synthesis agent (LLM)   │     │        └─ FAIL → use QC feedback to revise   │
   │ studies the 5 approved →        │     │             (retry ≤K) → else fall to P2…Pn  │
   │ writes ranked PRIORITY PROMPTS │     │   cap total attempts N + $ per asset          │
   │ + a tightened QC rubric        │     │   still failing → flag "needs review" (batch  │
   └───────────────────────────────┘     │   continues; never blocks on one asset)       │
                                          └────────────────────────────────────────────┘
```

**A reasoning agent and visual evidence model do the work after calibration:**
- **Prompt-Synthesis Agent (Claude Sonnet 5):** looks at the 5 human-approved images (+ rejects as negatives), infers *why* they're good, and emits a **priority-ordered prompt/param list** — the "recipe" that reliably reproduces approved quality. P1 is the best bet; P2…Pn are fallbacks that vary strategy.
- **QC evidence + judge:** fal/OpenRouter runs free `nvidia/nemotron-nano-12b-v2-vl:free` first (then low-cost `qwen/qwen3-vl-8b-instruct` if needed) to extract preliminary visible facts, fidelity changes, defects, and style similarity. Claude Sonnet 5 independently cross-checks that evidence against the source and candidate pixels, then returns per-criterion scores and specific written feedback. Deterministic code makes pass/fail and retry decisions.

## 3. Users & use cases (Phase 0 = e-commerce images only)

- **Multi-view catalogue:** 1 product photo → N standardized views/angles/backgrounds.
- **SKU → lifestyle:** 50 plain product shots → 50 lifestyle scenes in a consistent style.
- **Users:** e-com catalogue managers, D2C founders, agencies, marketplace ops.

## 4. Agent architecture (LangGraph orchestrator)

| Agent / component | Model | Job |
|---|---|---|
| **Brief/Spec Agent** | Claude Sonnet 5 | Turn the user prompt + reference outputs into a structured **Creative Spec** (asset type, # variants, aspect ratios, subject constraints, style tokens, brand palette, and the **acceptance rubric**). Reference images are analysed to extract style tokens. |
| **Generation Worker** | cheap/free gen (see §6) | Produce an asset from a given prompt/params (text-to-image or, for SKU→lifestyle, **image-to-image / inpainting** on the source). |
| **Prompt-Synthesis Agent** | Claude Sonnet 5 | From the 5 approved (+ rejected) samples → a ranked **priority prompt list** + tightened rubric. Re-runnable if quality drifts mid-batch. |
| **Visual Evidence Model** | fal/OpenRouter Nemotron; Qwen fallback | Compare source, candidate, and approved references → visible product differences, technical issues, and 0–1 similarity evidence. Never makes the final workflow decision. |
| **QC Reasoning Agent** | Claude Sonnet 5 | Cross-check source and candidate pixels against preliminary VLM evidence + rubric, then return per-criterion scores and written correction feedback. Deterministic policy code makes pass/fail. |
| **Orchestrator** | LangGraph state machine | Runs the per-asset loop: P1 → QC → (feedback-revise ≤K \| next priority prompt) → cap attempts/$ → accept or flag. Manages calibration → autonomous transition, batching, cost caps, retries, escalation. |

**Similarity check (technical):** the VLM reports separate product-identity and approved-style similarity estimates alongside concrete differences. Claude verifies the evidence against the source and candidate images, while deterministic threshold code enforces the fidelity floor and blended pass score.

**Per-asset decision policy (default, tunable):** try P1 → QC. On fail: feedback-guided retry of the current prompt up to **K=2**; if still failing, advance to the next priority prompt; **total cap N=5 attempts** and a **$-cap per asset**; exhausting caps → `needs_review` (never blocks the batch).

## 5. Pipeline / scale architecture

```
Upload (≤50 imgs + optional refs + prompt)
      ▼
Object storage (Supabase / R2)  ──  Postgres (batch · asset · attempt · qc_result state)
      ▼
Queue (Redis + BullMQ/Celery)
      ▼
Generation workers (M, scale by count) ──▶ QC workers (VLM grade) ──▶ Orchestrator (LangGraph)
      ▼                                                                   │ accept / retry / escalate
Delivery: zip + CDN links + per-SKU                                       ▼
                                                                   Approval UI (calibration + review)
```
Stateless web tier; workers scale independently; idempotent jobs; **dead-letter queue**; **per-batch cost cap**; `render.yaml` with autoscaling. (Generation is the only real cost → cost caps are first-class.)

## 6. Models — good QC, cheap generation (your constraint)

**Reasoning:** Claude Sonnet 5 for Spec, Prompt-Synthesis, and final visual QC grading, using image inputs plus schema-constrained JSON outputs.

**Visual QC:** `nvidia/nemotron-nano-12b-v2-vl:free` through fal/OpenRouter is the zero-token-cost primary visual evidence model. `qwen/qwen3-vl-8b-instruct` is the automatic low-cost fallback when the free route is unavailable or malformed. The free route may log inputs, so it is a Phase 0 cost choice rather than the future private-enterprise default.

**Generation (free / very cheap — pick ONE for P0 in the alignment step):**
- **Flux-schnell on fal.ai** — ~$0.003/img + ~$20 free signup credits (~6,000 imgs). Best default: fast, cheap, good, supports img2img.
- **SDXL / SDXL-Lightning** via fal/Replicate/HF Inference — cheap, open.
- **HuggingFace Inference API** open image models — free tier for demos.
- **Local ComfyUI/SD** — $0 if run on own hardware (best for a zero-cost demo, more setup).
> For **SKU→lifestyle** you need **image-to-image / inpainting / background-replace**, not pure text-to-image — confirm the provider supports it. Flux img2img or an open bg-replace model both work.

## 7. Data model (Postgres)
`batches(id, user, prompt, spec_json, status, cost_cap, cost_spent, created_at)` · `references(id, batch_id, type[image|video], url, style_tokens)` · `assets(id, batch_id, source_url, status[queued|generating|qc|passed|failed|needs_review|approved|delivered])` · `attempts(id, asset_id, prompt_id, params, output_url, cost)` · `qc_results(id, attempt_id, pass, scores_json, similarity, feedback)` · `priority_prompts(id, batch_id, rank, prompt, rationale, win_rate)` · `approvals(id, batch_id, asset_id, approved, note)`.

## 8. Tech stack (proposed — confirm in alignment)
Next.js (dashboard) · Node worker service · **LangGraph** orchestrator · BullMQ + Redis · Postgres · Supabase Storage · Anthropic Messages API (reasoning) · fal.ai FLUX.2 Edit (generation) · fal/OpenRouter (visual QC) · deploy on Render.

## 9. COMPLETE UI/UX (make this genuinely good)

**Design language:** clean, gallery-forward, light-on-dark option; big image tiles, calm typography, status as colour chips. Tokens: bg `#0B0D10`, card `#14171C`, accent `#635BFF`, pass `#2FBF71`, fail `#E5484D`, review `#E0A32E`.

**Screen 1 — New Batch (wizard, 3 steps)**
1. **Upload sources** — drag-drop grid of up to 50 images (thumbnails, remove, count "34/50").
2. **Reference look (optional)** — upload target images; label "this is the look to match." Video references remain Phase 3.
3. **Brief + settings** — the prompt, asset type (multi-view | SKU→lifestyle), aspect ratios, #variants/asset, **cost cap**. → "Start calibration."

**Screen 2 — Calibration (the human's only touchpoint)**
- The system generates a handful of candidates. A focused **approve/reject** UI: large image, ✓ Approve / ✕ Reject, an optional feedback field on reject.
- Progress: **"3 / 5 approved."** On the 5th approval → an animated **"Synthesizing recipe…"** → reveals the **priority prompts** (P1…Pn with rationale) and the tightened rubric. Button: "Run the rest autonomously."

**Screen 3 — Batch Board (the main view, live)**
- Top bar: counts (Queued · Generating · QC · Passed · Needs-review · Delivered), **cost used vs cap** bar, ETA.
- A responsive grid of asset tiles, each showing source→output, a **status chip**, QC score, and the attempt # / which priority prompt won. Filter by status.
- Live updates as workers finish (websocket/poll). A calm "watch the agents work" feel.

**Screen 4 — Asset Detail (drawer)**
- Source vs generated output(s); **QC panel**: per-criterion scores, similarity %, the VLM's written feedback; **attempt history** (P1 → feedback → retry → P2…); manual override (Approve / Regenerate / Edit prompt).

**Screen 5 — Recipe Panel**
- The synthesized **priority prompts** with live **win-rate** per prompt; editable; "re-synthesize from approvals."

**Screen 6 — Delivery**
- Download zip / copy CDN links / per-SKU export; a summary: assets delivered, auto-pass rate, human-QC-hours saved, cost.

**States to design:** empty · calibrating · synthesizing · autonomous-running · needs-review queue · done. Plus error (a generation/QC provider failed → which, retry).

## 10. `.env` / SECRETS CHECKLIST (Claude Code: print & confirm before building)
**Required (P0):**
- `ANTHROPIC_API_KEY` — Spec + Prompt-Synthesis + final QC reasoning.
- `FAL_KEY` — FLUX.2 image generation plus fal/OpenRouter visual QC.
- `DATABASE_URL` — Postgres. · `REDIS_URL` — queue + cache.
- Object storage: `SUPABASE_URL` + `SUPABASE_SERVICE_KEY` *(or `R2_ACCOUNT_ID`/`R2_ACCESS_KEY_ID`/`R2_SECRET_ACCESS_KEY`/`R2_BUCKET`)*.

**Guardrails / ops:**
- `COST_CAP_USD_PER_BATCH` (default e.g. 5) · `MAX_ATTEMPTS_PER_ASSET` (default 5) · `FEEDBACK_RETRIES` (default 2).
- Optional: `SENTRY_DSN`, `OTEL_EXPORTER_OTLP_ENDPOINT`.
> Claude Code: never print secret values; provide a `.env.example` with blank keys.

## 11. BUILD SEQUENCE — **PHASE 0 ONLY** (Claude Code: one prompt at a time, teach-as-you-go per §0b)

- **P0 — Align & scaffold.** Restate architecture + agent roles; print `.env` checklist; confirm generation provider; wait for "architecture approved." Then scaffold: Next.js app + worker service + Postgres schema (§7) + object storage + queue, with a health check.
- **P1 — Upload & batch.** Build Screen 1 (upload ≤50 + refs + brief) → create a batch, store sources in object storage, persist the batch/asset rows. *Teach: object storage vs local disk; why the web tier stays stateless.*
- **P2 — Spec Agent.** Claude Sonnet 5 turns prompt + references → structured Creative Spec + acceptance rubric (+ extract style tokens from refs). Show the JSON.
- **P3 — Generation worker.** One provider (e.g., Flux-schnell img2img). A worker consumes the queue, generates a candidate for an asset, stores output. *Teach: queue/worker, idempotency, cost tracking.*
- **P4 — Calibration UI.** Screen 2: generate candidates for a few items, human approves 5 (reject w/ notes), persist approvals.
- **P5 — Prompt-Synthesis Agent.** Claude Sonnet 5: 5 approved (+ rejects) → ranked priority prompts + tightened rubric; store in `priority_prompts`. Reveal them in the Recipe panel.
- **P6 — QC agents.** fal/OpenRouter VLM extracts source/candidate/reference evidence; Claude verifies it against source/candidate pixels and grades the rubric; deterministic code applies pass/fail thresholds. Show the QC panel.
- **P7 — Orchestrator (LangGraph).** The autonomous per-asset loop: P1 → QC → feedback-revise ≤K → next priority prompt → caps → accept/needs_review. Wire calibration→autonomous transition + per-batch cost cap + DLQ.
- **P8 — Batch Board + Asset Detail.** Screens 3 & 4 with live status; Screen 5 recipe win-rates.
- **P9 — Delivery + scale.** Screen 6 (zip/CDN); `render.yaml` (web+worker+redis+db autoscaling), rate limits, idempotency, `SCALING.md`.
- **P10 — Meta-eval + polish.** A small eval that checks **the QC agent agrees with human approvals** (does the judge match the 5 approvals + a holdout?) — the "who QCs the QC" signal. README + Loom demo.

## 12. All phases (build P0 now; later phases are roadmap, stub only)
- **Phase 0 (BUILD):** e-com images only · calibrate-5 → autonomous · fal VLM evidence + Claude QC reasoning · cheap generation · Screens 1–6.
- **Phase 1:** reusable **recipes/templates** (save a batch's priority prompts as a named recipe) + a REST API.
- **Phase 2 — "Media-as-a-Service by agents":** expose the whole pipeline as an **MCP tool / API** so *other* agents request creatives programmatically. Usage-based billing.
- **Phase 3:** **video** support (reference-video path), brand-kit memory, A/B variant generation, team workflows.

## 13. Success metrics
**Portfolio:** a live demo where 5 approvals → dozens delivered autonomously; auto-pass rate; "human-QC hours saved"; cost/asset. **Product:** assets/batch, autonomous completion rate, QC-vs-human agreement, $ per delivered asset.

## 14. Out of scope (P0)
Video, complex/artful creative, human editing tools, integrations/marketplaces, auth/multi-tenant billing. (All are later phases.)

---
*Definition of done for P0: upload → approve 5 → the agent workflow generates + QCs + delivers the remaining assets with no further human input, on a live Render deployment, with the batch board showing it happen. Start at §11 P0 — but only after the §0a architecture alignment.*
