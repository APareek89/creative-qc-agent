"use client";

import { useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { ArrowLeft, ArrowRight, Check, ChevronRight, LoaderCircle, MessageSquareText, ShieldCheck, Sparkles, ThumbsDown, ThumbsUp, WandSparkles, X } from "lucide-react";
import { apiRequest, useBatch } from "@/lib/client-api";
import { ErrorState, LoadingState, ProgressBar } from "@/components/ui";
import type { Batch } from "@/lib/types";

function readableProviderError(batch: Batch): string {
  const message = batch.error?.message ?? "Calibration stopped before candidates were generated.";
  try {
    const parsed = JSON.parse(message) as { error?: { message?: string } };
    return parsed.error?.message ?? message;
  } catch {
    return message;
  }
}

export function CalibrationScreen({ batchId }: { batchId: string }) {
  const router = useRouter();
  const { batch, setBatch, error, loading, refresh } = useBatch(batchId, true);
  const [note, setNote] = useState("");
  const [showNote, setShowNote] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [localSynth, setLocalSynth] = useState(false);
  const [actionError, setActionError] = useState<string>();
  const approvals = batch?.approvals.filter((approval) => approval.approved).length ?? 0;
  const decidedIds = useMemo(() => new Set(batch?.approvals.map((approval) => approval.candidateId) ?? []), [batch?.approvals]);
  const candidate = batch?.calibrationCandidates.find((item) => !decidedIds.has(item.id));
  const rejected = batch?.approvals.filter((approval) => !approval.approved).length ?? 0;
  const remainingApprovals = Math.max(0, 5 - approvals);
  const recipeReady = Boolean(batch?.priorityPrompts.length && approvals >= 5);

  async function decide(decision: "approved" | "rejected") {
    if (!candidate) return;
    setSubmitting(true);
    setActionError(undefined);
    if (decision === "approved" && approvals === 4) setLocalSynth(true);
    try {
      const result = await apiRequest<{ batch: Batch }>(`/api/batches/${batchId}/approve`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ candidateId: candidate.id, decision, note: note.trim() || undefined }),
      });
      if (localSynth || (decision === "approved" && approvals === 4)) await new Promise((resolve) => setTimeout(resolve, 900));
      if (result.batch) setBatch(result.batch);
      setNote("");
      setShowNote(false);
    } catch (requestError) {
      setActionError(requestError instanceof Error ? requestError.message : "Could not record your decision.");
    } finally {
      setSubmitting(false);
      setLocalSynth(false);
    }
  }

  async function startRun() {
    setSubmitting(true);
    setActionError(undefined);
    try {
      await apiRequest<Batch>(`/api/batches/${batchId}/actions`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ action: "run" }),
      });
      router.push(`/batches/${batchId}`);
    } catch (requestError) {
      setActionError(requestError instanceof Error ? requestError.message : "Could not start autonomous production.");
      setSubmitting(false);
    }
  }

  async function retryCalibration() {
    setSubmitting(true);
    setActionError(undefined);
    try {
      const updated = await apiRequest<Batch>(`/api/batches/${batchId}/actions`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ action: "retry_calibration" }),
      });
      if (updated) setBatch(updated);
    } catch (requestError) {
      setActionError(requestError instanceof Error ? requestError.message : "Could not retry calibration.");
    } finally {
      setSubmitting(false);
    }
  }

  if (loading) return <div className="page-wrap"><LoadingState label="Preparing calibration studio" /></div>;
  if (error || !batch) return <div className="page-wrap"><ErrorState message={error ?? "Batch unavailable."} onRetry={() => void refresh()} /></div>;

  if (batch.status === "failed") {
    return (
      <div className="page-wrap calibration-error-page">
        <header className="topbar"><div><p className="eyebrow">Calibration stopped</p><h1>{batch.name}</h1></div></header>
        <ErrorState message={readableProviderError(batch)} onRetry={submitting ? undefined : () => void retryCalibration()} />
        <p className="calibration-error-note">Five approvals are the minimum quality gate, not a candidate ceiling. The worker normally creates up to ten samples.</p>
        {actionError && <div className="inline-error">{actionError}</div>}
      </div>
    );
  }

  if (localSynth || batch.status === "synthesizing") {
    return (
      <div className="calibration-focus synth-focus">
        <div className="synth-orb"><span /><WandSparkles size={36} /></div>
        <p className="eyebrow">Five approvals captured</p>
        <h1>Synthesizing your recipe<span>…</span></h1>
        <p>Claude is comparing positive and negative evidence, tightening the QC rubric, and ranking the most repeatable FLUX strategies.</p>
        <div className="synth-steps"><span className="done"><Check size={14} /> Style tokens extracted</span><span className="active"><LoaderCircle className="spin" size={14} /> Ranking priority prompts</span><span>Calibrating acceptance thresholds</span></div>
      </div>
    );
  }

  if (recipeReady) {
    return (
      <div className="page-wrap recipe-reveal-page">
        <header className="topbar">
          <div><p className="eyebrow">Calibration complete</p><h1>Your agents learned the look.</h1></div>
          <button className="button primary" type="button" disabled={submitting} onClick={() => void startRun()}>{submitting ? <LoaderCircle className="spin" size={16} /> : <Sparkles size={16} />} Run the rest autonomously</button>
        </header>
        <div className="recipe-success"><span><ShieldCheck size={22} /></span><div><strong>Recipe locked from {approvals} approvals</strong><p>Future assets will be judged against this exact visual standard. You can edit or re-synthesize it at any time.</p></div><small>{rejected} negative example{rejected === 1 ? "" : "s"} learned</small></div>
        <div className="reveal-layout">
          <section className="recipe-stack">
            <div className="section-heading"><div><span className="section-kicker">Priority order</span><h3>Generation recipe</h3></div><span className="recipe-count">{batch.priorityPrompts.length} strategies</span></div>
            {batch.priorityPrompts.map((prompt) => (
              <article className={`recipe-card rank-${prompt.rank}`} key={prompt.id}>
                <div className="recipe-rank"><span>P{prompt.rank}</span><small>{prompt.rank === 1 ? "Primary" : "Fallback"}</small></div>
                <div className="recipe-copy"><p>{prompt.prompt}</p><div className="rationale"><Sparkles size={14} /><span>{prompt.rationale}</span></div><div className="recipe-tags"><span>Guidance {String(prompt.params.guidance_scale ?? "auto")}</span><span>{String(prompt.params.image_size ?? "4:5")}</span><span>{String(prompt.params.num_inference_steps ?? 28)} steps</span></div></div>
              </article>
            ))}
          </section>
          <aside className="rubric-panel">
            <div className="panel-heading"><div><span className="panel-icon"><ShieldCheck size={17} /></span><div><strong>Tightened QC rubric</strong><small>Version {batch.spec?.version ?? 1}</small></div></div></div>
            {batch.spec?.acceptanceRubric.map((criterion) => (
              <div className="rubric-row" key={criterion.id}><div><strong>{criterion.label}</strong><span>{Math.round(criterion.weight * 100)}% weight</span></div><p>{criterion.description}</p><div className="threshold"><ProgressBar value={criterion.minimumScore} /><small>Pass floor {criterion.minimumScore}</small></div></div>
            ))}
            <div className="rubric-note"><MessageSquareText size={16} /><p>The judge combines this rubric with visual similarity to your approvals. Product fidelity has a non-negotiable floor.</p></div>
          </aside>
        </div>
        {actionError && <div className="inline-error floating-error">{actionError}</div>}
      </div>
    );
  }

  return (
    <div className="calibration-page">
      <header className="calibration-header">
        <button className="icon-button" type="button" onClick={() => router.push("/")}><ArrowLeft size={18} /></button>
        <div><span className="eyebrow">Calibration studio</span><strong>{batch.name}</strong></div>
        <div className="approval-progress"><span><strong>{approvals}</strong> approved · 5 minimum</span><ProgressBar value={(approvals / 5) * 100} tone="green" /></div>
        <span className="calibration-help">This is your only required touchpoint <ChevronRight size={14} /></span>
      </header>
      {candidate ? (
        <div className="calibration-workspace">
          <section className="candidate-stage">
            <div className="candidate-image-wrap">
              <img className="candidate-image" src={candidate.outputUrl} alt="Generated calibration candidate" />
              <div className="source-peek"><span>Source</span><img src={candidate.sourceUrl} alt="Source product" /></div>
              <div className="candidate-counter">Sample {decidedIds.size + 1} / {batch.calibrationCandidates.length}</div>
            </div>
          </section>
          <aside className="decision-panel">
            <div><p className="eyebrow">Teach the agents</p><h2>Does this feel right?</h2><p>Judge the look, product fidelity, and whether you would confidently publish it.</p></div>
            <div className="decision-signals"><span><Check size={14} /> Product geometry intact</span><span><Sparkles size={14} /> Warm studio recipe</span></div>
            <div className="decision-actions">
              <button className="approve-button" type="button" disabled={submitting} onClick={() => void decide("approved")}><ThumbsUp size={20} /><span><strong>Approve</strong><small>Add to the positive set</small></span><ArrowRight size={17} /></button>
              <button className="reject-button" type="button" disabled={submitting} onClick={() => setShowNote(true)}><ThumbsDown size={20} /><span><strong>Reject</strong><small>Teach what to avoid</small></span></button>
            </div>
            {showNote && <div className="reject-note"><div><strong>What should change?</strong><button type="button" onClick={() => setShowNote(false)}><X size={14} /></button></div><textarea autoFocus rows={4} placeholder="e.g. Background is too cool; keep the shadow softer…" value={note} maxLength={500} onChange={(event) => setNote(event.target.value)} /><button className="button danger full" type="button" disabled={submitting} onClick={() => void decide("rejected")}>{submitting ? <LoaderCircle className="spin" size={16} /> : <ThumbsDown size={16} />} Reject with feedback</button></div>}
            {actionError && <div className="inline-error">{actionError}</div>}
            <p className="keyboard-hint"><kbd>A</kbd> approve <kbd>R</kbd> reject</p>
          </aside>
        </div>
      ) : batch.status === "calibrating" ? (
        <div className="empty-calibration"><LoaderCircle className="spin" size={27} /><h2>Generating calibration samples</h2><p>The Creative Spec and up to ten source-conditioned candidates are being prepared. This screen updates automatically.</p></div>
      ) : (
        <div className="empty-calibration"><Sparkles size={27} /><h2>{remainingApprovals} more approval{remainingApprovals === 1 ? "" : "s"} required</h2><p>Five approvals are the minimum quality gate, not a ceiling. Review or revise the available calibration samples before autonomous production.</p></div>
      )}
    </div>
  );
}
