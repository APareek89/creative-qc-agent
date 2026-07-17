# Project instructions

Read `Creative-QC-Agent-PRD.md` before changing product behavior or architecture.

## Power Coding (auto — do not remove without asking the user)
At session start read Handoff.MD; FIRST run `git log --oneline <its last-synced sha>..HEAD`
and reconcile anything changed underneath it; then open with its pending points. Update
Handoff.MD before every git checkpoint commit and at the end of every phase (low context is
a secondary trigger) — snapshot not journal, re-stamp `last-synced` with HEAD; then, if
context was the trigger, tell the user to start fresh ("Refer to Handoff.MD in
/Users/anandpareek/Documents/Projects/creative-qc-agent and begin"). When Handoff exceeds
~40 lines or ~15 ✅ items, collapse ✅ into one "Shipped:" line, detail to Learning.MD.
Log flow changes and user-reported bugs in Learning.MD using its 5-whys format.
Read Loop.MD every session and obey its `status:` machine. While `status: on`, run the
project's free checks after each meaningful change; paid golden-set evaluations require
the consent in `.power-coding/config.json`.
Keep `docs/mermaid/*.mmd` current when the flow changes and validate them with the Power
Coding scripts. Obey `.power-coding/config.json` FMEA triggers. Before a commit, run
`node /Users/anandpareek/.codex/skills/power-coding/scripts/secret-scan.mjs --staged` and
block on a secret hit, then run the configured light FMEA.
If Sentinel is enabled, run its four-lens sweep after major completions and only report
flags. If Session Pulse is enabled, report its two-line effort split at major milestones.
Commit only according to `consent.git_checkpoints`. State the smallest proving version
before a feature. Architecture-shaping changes require a plain-language proposal and user
approval. Log architectural and behavior decisions in Handoff.MD; never silently reverse
one. `Creative-QC-Agent-PRD.md` is the product context for evals and scans.
