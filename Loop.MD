# Loop.MD — Creative QC Agent
status: offered

> AGENT INSTRUCTION — read every session and obey:
> - When the first demo-able end-to-end draft works, ask whether to turn on the Loop and
>   disclose that free checks cost nothing while the golden set makes paid API calls.
> - While `status: on`, run Rung 1 and every free eval after meaningful changes.
> - Never run the golden set without `consent.paid_evals`; write a hypothesis first.
> - Offer to graduate an eval into a test after three consecutive passes.

## Goal
Upload product images and reference looks, approve five calibration candidates, and let
bounded agents generate, judge, revise, and deliver the rest without blocking the batch.

## Rung 1 — the project's own tests
Rung 1 (existing tests): `npm run check` (to be added with the application scaffold)
CI: `none yet`

## Free evals — run after every change while the loop is on

| # | Input (question / action / call) | Expected (answer / behavior / output) |
|---|---|---|
| 1 | Start without provider keys | Premium demo opens, never exposes a secret, and the full workflow remains reviewable with simulated results. |
| 2 | Upload 51 sources or a non-image | Validation blocks the request with a useful error before storage or spend. |
| 3 | Approve the fifth calibration image | Recipe synthesis completes once and reveals ranked prompts plus a tightened rubric. |
| 4 | QC repeatedly fails one asset | Attempts and cost caps stop retries, mark only that asset needs-review, and let the batch continue. |
| 5 | Open a completed batch | Board counts, attempt history, QC evidence, recipe win rates, and delivery export agree with persisted state. |
| 6 | An external provider returns malformed data or times out | The job retries safely, records the failure, and becomes visible instead of silently disappearing. |

## Golden set — paid/graded evals

| # | Input | Reference output / must-haves | Check |
|---|---|---|---|
| G1 | White sneaker to warm editorial loft | Product geometry/logo/color preserved; scene and shadows match references. | rubric: fidelity ≥ 85 and visual criteria coherent |
| G2 | Skincare bottle on clean bathroom stone | Label remains legible; reflections natural; palette on-brand. | rubric: no product mutation and plausible lighting |
| G3 | Five approved images plus cool-background rejects | P1 captures approved look and explicitly avoids the rejected temperature. | rubric: priorities explain positive and negative evidence |
| G4 | Source with transparent background | Generated lifestyle scene has clean edges without halos or missing parts. | rubric: edge fidelity and completeness |
| G5 | Product with small typography | QC penalizes distorted text and gives an actionable correction. | contains: text/label correction feedback |
| G6 | Reference style conflicts with brief | Spec calls out the conflict and prioritizes explicit user constraints. | rubric: transparent, deterministic conflict handling |
| G7 | P1 fails twice; P2 passes | History shows feedback retries, fallback transition, and P2 win rate update. | exact: bounded transition sequence |
| G8 | Cost cap would be exceeded by next generation | No paid call occurs and asset becomes needs-review with a cost-cap reason. | exact: zero call after cap |
| G9 | Unsafe or unsupported source | Provider refusal is recorded and no bypass prompt is attempted. | contains: safe terminal failure |
| G10 | Holdout human approval set | QC agreement metric is computed and disagreements are visible. | rubric: honest agreement calculation, no hidden cases |

## Run journal (paid/slow checks only)
| Date | Hypothesis | Result | Cost note |
|---|---|---|---|
| 2026-07-17 | A one-source, one-ratio live Render batch will create at least five durable source-conditioned calibration candidates, accept five approvals, synthesize a recipe, and finish one autonomous asset without demo substitution. | PASS for orchestration; batch `cacd5657-d1e6-444a-812a-09f15bb58059` persisted 10 candidates, 5 approvals, 4 prompts, and 1 terminal needs-review asset after 3 real generation/QC attempts. The run exposed a Claude score-scale ambiguity and an optimistic Qwen label-fidelity judgment. Score normalization plus direct Claude source/candidate visual cross-checking were added; an adversarial replay correctly scored the corrupt label at 35/100 fidelity. | $0.234 generation spend against a $0.25 hard cap; the next paid call was correctly blocked. Claude/VLM token spend is logged separately, as documented. |
