"use client";

import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import { Activity, ArrowLeft, ArrowRight, Bot, Check, CheckCircle2, ChevronRight, CircleDollarSign, Clock3, Copy, Download, Edit3, ExternalLink, Filter, Gauge, ImageIcon, Layers3, LoaderCircle, MoreHorizontal, PackageCheck, Play, RefreshCcw, RotateCcw, ScanLine, ShieldCheck, Sparkles, WandSparkles, X, Zap } from "lucide-react";
import { StatusChip } from "@/components/status-chip";
import { ErrorState, LoadingState, ProgressBar } from "@/components/ui";
import { apiRequest, useBatch } from "@/lib/client-api";
import { ASSET_STATUSES, getBatchCounts, isTerminalStatus, type Asset, type AssetStatus, type Batch, type PriorityPrompt, type QcScores } from "@/lib/types";

const statusLabels: Record<AssetStatus, string> = {
  queued: "Queued", generating: "Generating", qc: "Vision QC", passed: "Passed", failed: "Failed", needs_review: "Review", approved: "Approved", delivered: "Delivered",
};

function qualityTone(score?: number) {
  if (!score) return "muted";
  if (score >= 88) return "good";
  if (score >= 80) return "okay";
  return "bad";
}

function AssetTile({ asset, onClick }: { asset: Asset; onClick: () => void }) {
  const preview = asset.outputUrl ?? asset.sourceUrl;
  const latestAttempt = asset.attempts.at(-1);
  return (
    <button type="button" className={`asset-tile asset-${asset.status}`} onClick={onClick}>
      <div className="asset-image">
        <img src={preview} alt={asset.name} />
        {asset.status === "generating" && <div className="generation-wash"><span /><Sparkles size={21} /><small>FLUX is rendering</small></div>}
        {asset.status === "qc" && <div className="qc-scan-line"><span /></div>}
        {asset.status === "queued" && <div className="queued-wash"><Clock3 size={20} /><small>Waiting for worker</small></div>}
        <div className="tile-status"><StatusChip status={asset.status} compact /></div>
        <div className="source-mini"><img src={asset.sourceUrl} alt=""/><span>Source</span></div>
        {asset.qcScore && <span className={`score-badge ${qualityTone(asset.qcScore)}`}>{Math.round(asset.qcScore)}</span>}
      </div>
      <div className="asset-meta">
        <div><strong>{asset.name}</strong><span>{asset.sku}</span></div>
        <span className="attempt-label">{latestAttempt ? `P${latestAttempt.promptRank} · try ${latestAttempt.number}` : "Awaiting P1"}</span>
      </div>
    </button>
  );
}

function ScoreRows({ scores }: { scores: QcScores }) {
  const rows = [
    ["Product fidelity", scores.productFidelity],
    ["Composition", scores.composition],
    ["Light & shadow", scores.lighting],
    ["Brand style", scores.brandStyle],
    ["Technical quality", scores.technicalQuality],
  ] as const;
  return <div className="score-rows">{rows.map(([label, value]) => <div key={label}><span>{label}<strong>{Math.round(value)}</strong></span><ProgressBar value={value} tone={value >= 85 ? "green" : value >= 75 ? "purple" : "amber"} /></div>)}</div>;
}

function AssetDrawer({ batch, asset, onClose, onUpdate }: { batch: Batch; asset: Asset; onClose: () => void; onUpdate: (batch: Batch) => void }) {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string>();
  const latest = asset.attempts.at(-1);
  const qc = latest?.qcResult;
  const attemptBudgetRemaining = asset.attempts.length < batch.settings.maxAttempts;

  async function action(name: "approve_asset" | "regenerate_asset") {
    setBusy(true); setError(undefined);
    try {
      const updated = await apiRequest<Batch>(`/api/batches/${batch.id}/actions`, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ action: name, assetId: asset.id }) });
      onUpdate(updated);
      if (name === "approve_asset") onClose();
    } catch (requestError) {
      setError(requestError instanceof Error ? requestError.message : "Action failed.");
    } finally { setBusy(false); }
  }

  return (
    <div className="drawer-layer" role="dialog" aria-modal="true" aria-label={`${asset.name} details`}>
      <button className="drawer-backdrop" type="button" onClick={onClose} aria-label="Close drawer" />
      <aside className="asset-drawer">
        <header><div><span className="eyebrow">{asset.sku}</span><h2>{asset.name}</h2></div><button className="icon-button" type="button" onClick={onClose}><X size={18} /></button></header>
        <div className="drawer-scroll">
          <div className="compare-grid">
            <div><span>Source</span><img src={asset.sourceUrl} alt="Source" /></div>
            <div><span>Generated</span>{asset.outputUrl ? <img src={asset.outputUrl} alt="Generated" /> : <div className="no-output"><ImageIcon size={22} /> Not generated yet</div>}</div>
          </div>
          <div className="detail-summary">
            <StatusChip status={asset.status} />
            {asset.qcScore && <span className={`large-score ${qualityTone(asset.qcScore)}`}>{Math.round(asset.qcScore)}<small>/100 QC</small></span>}
            {asset.similarity && <span className="similarity-score"><Sparkles size={14} /> {Math.round(asset.similarity * 100)}% style match</span>}
          </div>
          {qc && <section className="drawer-section"><div className="drawer-section-title"><span><ShieldCheck size={16} /> Vision judge</span><small>{Math.round(qc.confidence * 100)}% confidence</small></div><ScoreRows scores={qc.scores} /><blockquote>{qc.feedback}</blockquote>{qc.corrections.length > 0 && <div className="correction-list"><strong>Next correction</strong>{qc.corrections.map((item) => <span key={item}><ChevronRight size={13} /> {item}</span>)}</div>}</section>}
          <section className="drawer-section"><div className="drawer-section-title"><span><Activity size={16} /> Attempt history</span><small>{asset.attempts.length} / {batch.settings.maxAttempts}</small></div><div className="attempt-timeline">{asset.attempts.length ? asset.attempts.map((attempt, index) => <div className="attempt-row" key={attempt.id}><span className={`attempt-dot ${attempt.status}`} />{index < asset.attempts.length - 1 && <i />}<div><strong>Attempt {attempt.number} · P{attempt.promptRank}</strong><p>{attempt.status === "passed" ? "Passed QC and accepted" : attempt.failureReason ?? attempt.qcResult?.feedback ?? "Generation completed"}</p><small>${attempt.cost.toFixed(3)} · {new Date(attempt.createdAt).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })}</small></div><span className={`attempt-result ${attempt.status}`}>{attempt.qcResult?.overallScore ? Math.round(attempt.qcResult.overallScore) : attempt.status}</span></div>) : <div className="empty-attempts">No attempts yet. The asset is waiting in the queue.</div>}</div></section>
          {asset.failureReason && <div className="failure-callout"><Clock3 size={17} /><div><strong>Why this needs attention</strong><p>{asset.failureReason}</p></div></div>}
          {error && <div className="inline-error">{error}</div>}
        </div>
        <footer><button className="button secondary" type="button" disabled={busy || !attemptBudgetRemaining || ["queued", "generating", "qc"].includes(asset.status)} onClick={() => void action("regenerate_asset")}><RotateCcw size={16} /> {attemptBudgetRemaining ? "Regenerate" : "Attempt cap reached"}</button><button className="button primary" type="button" disabled={busy || !asset.outputUrl || !["failed", "needs_review"].includes(asset.status)} onClick={() => void action("approve_asset")}>{busy ? <LoaderCircle className="spin" size={16} /> : <Check size={16} />} Approve override</button></footer>
      </aside>
    </div>
  );
}

function RecipePanel({ batch, onClose, onUpdate }: { batch: Batch; onClose: () => void; onUpdate: (batch: Batch) => void }) {
  const [editing, setEditing] = useState<string>();
  const [draft, setDraft] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string>();

  async function request(payload: Record<string, string>) {
    setBusy(true); setError(undefined);
    try {
      const updated = await apiRequest<Batch>(`/api/batches/${batch.id}/actions`, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(payload) });
      onUpdate(updated); setEditing(undefined);
    } catch (requestError) { setError(requestError instanceof Error ? requestError.message : "Recipe update failed."); }
    finally { setBusy(false); }
  }

  function begin(prompt: PriorityPrompt) { setEditing(prompt.id); setDraft(prompt.prompt); }

  return (
    <div className="drawer-layer recipe-layer" role="dialog" aria-modal="true" aria-label="Generation recipe">
      <button className="drawer-backdrop" type="button" onClick={onClose} aria-label="Close recipe" />
      <aside className="recipe-drawer">
        <header><div><span className="eyebrow">Learned from five approvals</span><h2>Priority recipe</h2></div><button className="icon-button" type="button" onClick={onClose}><X size={18} /></button></header>
        <div className="recipe-drawer-intro"><WandSparkles size={18} /><p>The orchestrator starts at P1, uses QC feedback for bounded revisions, then advances only if the strategy keeps failing.</p></div>
        <div className="recipe-drawer-scroll">
          {batch.priorityPrompts.map((prompt) => (
            <article className="drawer-recipe-card" key={prompt.id}>
              <div className="drawer-recipe-head"><span className={`p-badge p-${prompt.rank}`}>P{prompt.rank}</span><div><strong>{prompt.rank === 1 ? "Primary strategy" : `Fallback ${prompt.rank - 1}`}</strong><small>{prompt.uses} uses · {prompt.wins} wins</small></div><span className="win-rate">{prompt.winRate.toFixed(0)}%</span></div>
              <ProgressBar value={prompt.winRate} tone={prompt.rank === 1 ? "green" : "purple"} />
              {editing === prompt.id ? <div className="prompt-editor"><textarea value={draft} rows={7} onChange={(event) => setDraft(event.target.value)} /><div><button type="button" className="button ghost small" onClick={() => setEditing(undefined)}>Cancel</button><button type="button" className="button primary small" disabled={busy || draft.trim().length < 12} onClick={() => void request({ action: "update_prompt", promptId: prompt.id, prompt: draft })}>Save prompt</button></div></div> : <><p className="prompt-copy">{prompt.prompt}</p><div className="prompt-rationale"><Sparkles size={13} /> {prompt.rationale}</div><button type="button" className="edit-prompt" onClick={() => begin(prompt)}><Edit3 size={13} /> Edit strategy</button></>}
            </article>
          ))}
          {batch.spec && <section className="drawer-rubric"><div className="drawer-section-title"><span><ShieldCheck size={16} /> Acceptance rubric</span><small>v{batch.spec.version}</small></div>{batch.spec.acceptanceRubric.map((criterion) => <div key={criterion.id}><span>{criterion.label}<strong>{criterion.minimumScore} floor</strong></span><ProgressBar value={criterion.minimumScore} /></div>)}</section>}
          {error && <div className="inline-error">{error}</div>}
        </div>
        <footer><button className="button secondary full" type="button" disabled={busy} onClick={() => void request({ action: "resynthesize" })}>{busy ? <LoaderCircle className="spin" size={16} /> : <RefreshCcw size={16} />} Re-synthesize from approvals</button></footer>
      </aside>
    </div>
  );
}

export function BatchBoard({ batchId }: { batchId: string }) {
  const { batch, setBatch, error, loading, refresh } = useBatch(batchId, true);
  const [filter, setFilter] = useState<"all" | AssetStatus>("all");
  const [selectedId, setSelectedId] = useState<string>();
  const [recipeOpen, setRecipeOpen] = useState(false);
  const [actionError, setActionError] = useState<string>();
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    if (typeof window !== "undefined" && new URLSearchParams(window.location.search).has("recipe")) setRecipeOpen(true);
  }, []);

  const counts = batch ? getBatchCounts(batch) : undefined;
  const visible = useMemo(() => batch?.assets.filter((asset) => filter === "all" || asset.status === filter) ?? [], [batch?.assets, filter]);
  const selected = batch?.assets.find((asset) => asset.id === selectedId);
  const terminal = batch?.assets.filter((asset) => isTerminalStatus(asset.status)).length ?? 0;
  const progress = batch ? (terminal / Math.max(1, batch.assets.length)) * 100 : 0;

  async function runAction(action: "run" | "retry_failed") {
    setBusy(true); setActionError(undefined);
    try {
      const updated = await apiRequest<Batch>(`/api/batches/${batchId}/actions`, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ action }) });
      setBatch(updated);
    } catch (requestError) { setActionError(requestError instanceof Error ? requestError.message : "Action failed."); }
    finally { setBusy(false); }
  }

  if (loading) return <div className="page-wrap"><LoadingState label="Connecting to production board" /></div>;
  if (error || !batch || !counts) return <div className="page-wrap"><ErrorState message={error ?? "Batch unavailable."} onRetry={() => void refresh()} /></div>;

  return (
    <div className="page-wrap board-page">
      <header className="board-topbar">
        <Link href="/" className="icon-button"><ArrowLeft size={18} /></Link>
        <div className="board-title"><div><span className="eyebrow">Production batch</span><h1>{batch.name}</h1></div><StatusChip status={batch.status} /></div>
        <div className="board-actions">
          <button className="button secondary" type="button" onClick={() => setRecipeOpen(true)}><WandSparkles size={16} /> Recipe <span className="button-count">{batch.priorityPrompts.length}</span></button>
          {batch.status === "ready" && <button className="button primary" type="button" disabled={busy} onClick={() => void runAction("run")}><Play size={15} fill="currentColor" /> Run agents</button>}
          {batch.status === "done" && <Link className="button primary" href={`/batches/${batch.id}/delivery`}><PackageCheck size={16} /> Delivery</Link>}
          <button className="icon-button" type="button"><MoreHorizontal size={18} /></button>
        </div>
      </header>

      {batch.error && <div className="provider-error"><Zap size={18} /><div><strong>{batch.error.provider} needs attention</strong><p>{batch.error.message}</p></div><button className="button secondary small" type="button" onClick={() => void refresh()}>Retry connection</button></div>}
      {actionError && <div className="inline-error board-error">{actionError}</div>}

      <section className="board-overview">
        <div className="overview-progress"><div className="progress-ring" style={{ "--progress": `${progress * 3.6}deg` } as React.CSSProperties}><span><strong>{Math.round(progress)}%</strong><small>reviewed</small></span></div><div><span>Batch progress</span><strong>{terminal} of {batch.assets.length} assets</strong><p>{batch.status === "autonomous_running" ? "Agents are generating and judging in parallel." : batch.status === "done" ? "Autonomous production is complete." : "Ready for the next workflow step."}</p></div></div>
        <div className="overview-stat"><span className="stat-top"><CheckCircle2 size={16} /> Auto-passed</span><strong>{counts.passed + counts.approved + counts.delivered}</strong><small>{terminal ? Math.round(((counts.passed + counts.approved + counts.delivered) / terminal) * 100) : 0}% of reviewed</small></div>
        <div className="overview-stat"><span className="stat-top amber"><Clock3 size={16} /> Needs review</span><strong>{counts.needs_review}</strong><small>{counts.needs_review ? "Human decision useful" : "Nothing waiting"}</small></div>
        <div className="overview-stat"><span className="stat-top purple"><Gauge size={16} /> Active workers</span><strong>{counts.generating + counts.qc}</strong><small>{counts.generating} generate · {counts.qc} QC</small></div>
        <div className="overview-cost"><div><span><CircleDollarSign size={16} /> Generation guardrail</span><strong>${batch.costSpent.toFixed(2)} <small>/ ${batch.settings.costCap.toFixed(2)}</small></strong></div><ProgressBar value={(batch.costSpent / batch.settings.costCap) * 100} tone="green" /><p><ShieldCheck size={13} /> Hard cap enforced before image calls</p></div>
      </section>

      <section className="agent-strip"><span className="agent-strip-label"><Bot size={16} /> Live agent activity</span><div className="activity-event active"><i /><span>FLUX worker</span><strong>{counts.generating ? `Rendering ${counts.generating} asset${counts.generating === 1 ? "" : "s"}` : "Queue clear"}</strong></div><ChevronRight size={14} /><div className="activity-event"><i /><span>VLM + Claude QC</span><strong>{counts.qc ? `Grading ${counts.qc} candidate${counts.qc === 1 ? "" : "s"}` : "Standing by"}</strong></div><ChevronRight size={14} /><div className="activity-event"><i /><span>Orchestrator</span><strong>P1 · {batch.priorityPrompts[0]?.winRate.toFixed(0) ?? 0}% win rate</strong></div><span className="eta"><Clock3 size={14} /> ETA {batch.status === "done" ? "complete" : "~2 min"}</span></section>

      <section className="asset-board">
        <div className="asset-toolbar"><div className="filter-tabs"><button type="button" className={filter === "all" ? "active" : ""} onClick={() => setFilter("all")}>All <span>{batch.assets.length}</span></button>{ASSET_STATUSES.filter((status) => counts[status] > 0).map((status) => <button type="button" key={status} className={filter === status ? "active" : ""} onClick={() => setFilter(status)}>{statusLabels[status]} <span>{counts[status]}</span></button>)}</div><button className="filter-control" type="button"><Filter size={15} /> Filter</button></div>
        {visible.length ? <div className="asset-grid">{visible.map((asset) => <AssetTile key={asset.id} asset={asset} onClick={() => setSelectedId(asset.id)} />)}</div> : <div className="empty-filter"><Filter size={22} /><strong>No assets in this state</strong><p>Choose another filter to see the rest of the batch.</p></div>}
      </section>

      {counts.needs_review > 0 && <div className="review-dock"><div><span><Clock3 size={17} /></span><div><strong>{counts.needs_review} asset{counts.needs_review === 1 ? "" : "s"} need a decision</strong><p>The batch kept moving; review when you are ready.</p></div></div><button className="button secondary small" type="button" onClick={() => setFilter("needs_review")}>Open review queue <ArrowRight size={14} /></button><button className="button ghost small" type="button" disabled={busy} onClick={() => void runAction("retry_failed")}><RefreshCcw size={14} /> Retry all</button></div>}

      {selected && <AssetDrawer batch={batch} asset={selected} onClose={() => setSelectedId(undefined)} onUpdate={setBatch} />}
      {recipeOpen && <RecipePanel batch={batch} onClose={() => setRecipeOpen(false)} onUpdate={setBatch} />}
    </div>
  );
}
