# Learning.MD — Creative QC Agent
> AGENT: add an entry whenever the main flow changes, the user reports a bug/correction,
> or a fix was hard-won. Check here before debugging. Keep entries in 5-whys format.

### 2026-07-17 — Valid QC JSON used the wrong numerical scale

**Symptom:** A live candidate with excellent Claude subscores received an overall score of 20.8 and retried instead of passing.
**Why 1:** Claude returned score values such as `0.98` and `0.95`, while deterministic application math expects 0–100 values.
**Why 2:** The 0–100 Zod bounds also accept every 0–1 value, so schema validation could not distinguish the semantic scale.
**Why 3:** Provider contract tests covered JSON shape and bounds but not numerical scale interpretation.
**Deepest why type:** `architecture`
**Action taken:** Made the prompt state the scale with a concrete example, normalized an entirely 0–1 QC score vector at the Anthropic boundary, emitted an observability event when normalization occurs, and added regression tests for both 0–1 and native 0–100 responses.
**Preventive action:** Every bounded LLM number must define its unit and scale in prompt, adapter normalization, and tests; syntactic range validation alone is not a semantic contract.

### 2026-07-17 — Credential checks passed while real agent inference still failed

**Symptom:** Provider metadata/queue probes were green, but the first real fal VLM call was blocked by OpenRouter privacy policy and the first Claude structured calls rejected unsupported schema keywords.
**Why 1:** Readiness proved credentials and endpoint access, not model-specific inference and output-contract compatibility.
**Why 2:** The free Nemotron route requires a data policy the account currently disallows; raw Zod JSON Schema contains constraints Anthropic direct structured outputs do not accept.
**Why 3:** The provider adapters had not been smoke-tested with their exact production model IDs, images, and schemas.
**Deepest why type:** `process`
**Action taken:** Ran real minimal model calls; added Nemotron→Qwen fallback with retry and a 15-minute primary circuit, normalized Qwen evidence, sanitized Anthropic schemas while retaining Zod validation, fixed recipe params to the two FLUX settings actually consumed, and rejected Phase 0 video references that no active agent could use.
**Preventive action:** A provider is deployment-ready only after one minimal live inference exercises the exact model, media type, and structured output used in production; non-billable health probes remain necessary but insufficient.

### 2026-07-17 — Demo output was presented beside a real upload

**Symptom:** A lipstick source upload appeared beside a canned sneaker output, making the app look like a broken live generator.
**Why 1:** The in-memory demo repository deliberately cycles through bundled scene SVGs instead of calling fal.
**Why 2:** The batch was created while `DEMO_MODE=true`; switching the environment later could not convert that in-memory demo batch into a live Postgres batch.
**Why 3:** Demo-only routes remained visible and readiness only checked whether keys existed, not whether providers worked.
**Deepest why type:** `design`
**Action taken:** Isolated demo navigation, removed hard-coded demo links in live mode, added real DB/Redis/Storage/Gemini/fal probes and strict worker startup, made source image 1 the explicit product identity, and added a live dependency screen.
**Preventive action:** Never call a flow live until provider preflight passes and a source→output provenance check proves the generation request used the uploaded product.

### 2026-07-17 — Aspect-ratio controls did not reach generation

**Symptom:** Users could select several aspect ratios, but every fal request used the same portrait size and asset counts ignored ratios.
**Why 1:** Assets persisted only a variant number, not an output ratio.
**Why 2:** The provider adapter read an LLM prompt parameter with a portrait fallback instead of the deterministic user setting.
**Why 3:** No eval asserted source × ratio × variant expansion.
**Deepest why type:** `architecture`
**Action taken:** Added a durable `aspect_ratio`, expanded each source across selected ratios and variants, mapped every supported ratio to exact fal dimensions, capped the expansion at 200, and added tests.
**Preventive action:** Every user-visible generation setting must have a persisted field, a deterministic provider mapping, and a regression assertion.

### 2026-07-17 — Durable jobs did not guarantee a terminal batch

**Symptom:** Live asset workers could all finish while the parent batch remained `autonomous_running`, and a retained failed BullMQ job ID could block an explicit retry.
**Why 1:** Asset state and batch state were persisted by different worker boundaries.
**Why 2:** No final-worker reconciliation checked whether every sibling was terminal.
**Why 3:** The original job ID represented the asset forever instead of one deliberate run.
**Deepest why type:** `architecture`
**Action taken:** Reconcile after every terminal asset/worker failure and include a run token in explicit retry job IDs while rejecting duplicate active runs.
**Preventive action:** Every fan-out workflow must define both its idempotency scope and its fan-in terminal transition before implementation.

### 2026-07-17 — UI cost input was not the server's true spending ceiling

**Symptom:** A caller could request a cap above the configured server default and create unlimited anonymous batches against live provider keys.
**Why 1:** The environment cap was used as a default, not enforced as a maximum.
**Why 2:** Per-batch atomic reservation protected one batch but not batch creation volume.
**Why 3:** Authentication is intentionally outside Phase 0, leaving a public cost surface.
**Deepest why type:** `design`
**Action taken:** Enforce the server maximum before storage, add an atomic Redis per-IP hourly limit, and keep all spend reservations server-side.
**Preventive action:** Treat request frequency and request magnitude as separate cost controls at every paid boundary.

### 2026-07-17 — Latest TypeScript exceeded Next.js supported range

**Symptom:** The optimized build compiled, then Next.js tried to reinstall TypeScript and its worker exited.
**Why 1:** `typescript: latest` resolved to 7.0.2.
**Why 2:** Next.js 16.2.10 currently recognizes the stable TypeScript 5.x toolchain.
**Why 3:** Unpinned dependencies let a newly published major version change the build underneath the app.
**Deepest why type:** `process`
**Action taken:** Pin TypeScript 5.9.3 and every direct runtime/development dependency to the versions under verification.
**Preventive action:** Never use `latest` in a deployment project; update dependencies deliberately behind the full check ladder.

### 2026-07-17 — In-app browser bootstrap failed before localhost attachment

**Symptom:** The bundled in-app browser runtime failed with `Cannot redefine property: process` before selecting a tab.
**Why 1:** The packaged browser client assigns a process shim during module initialization.
**Why 2:** The persistent JavaScript host protects that global property and rejects the assignment.
**Why 3:** The plugin bundle and the current host runtime disagree about global initialization ownership.
**Deepest why type:** `process`
**Action taken:** Retried from a fresh browser-control session, confirmed the failure occurs before app navigation, and continued with HTTP/build checks plus an isolated visual fallback.
**Preventive action:** Treat browser bootstrap as a separate verification dependency and never misreport its failure as an application failure.

### 2026-07-17 — Required LLM key was labeled ambiguously

**Symptom:** The environment checklist made it look as if the agentic workflow's LLM key was optional.
**Why 1:** `OPENAI_API_KEY` appeared under an “optional” heading without clearly separating it from the required Gemini key.
**Why 2:** Provider fallback configuration and primary model configuration were presented in the same visual hierarchy.
**Why 3:** The checklist emphasized vendor variable names rather than model responsibilities.
**Deepest why type:** `design`
**Action taken:** Make `GEMINI_API_KEY` explicitly required for all reasoning/vision agents and label OpenAI only as an optional fallback.
**Preventive action:** Group every environment variable by runtime responsibility and whether the core path can start without it.

### 2026-07-17 — Render production install omitted the web build toolchain

**Symptom:** Render compiled the Next.js bundle, then failed type checking because TypeScript and React type packages were absent.
**Why 1:** The service environment sets `NODE_ENV=production`, so plain `npm ci` omitted development dependencies.
**Why 2:** Next.js needs TypeScript and type declarations during its production build even though they are not application runtime dependencies.
**Why 3:** The deployment command was only verified in a local environment that already contained development dependencies.
**Deepest why type:** `process`
**Action taken:** Make the web build run `npm ci --include=dev`, keep the worker launcher in production dependencies, and pin Render to the locally verified Node 22 line.
**Preventive action:** Verify deployment install semantics separately from local builds whenever production environment flags can change dependency selection.
