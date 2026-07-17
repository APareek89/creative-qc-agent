"use client";

import Link from "next/link";
import { useMemo, useState } from "react";
import { ArrowLeft, Check, CheckCircle2, Clock3, Copy, Download, ExternalLink, FileArchive, ImageIcon, Link2, PackageCheck, ShieldCheck, Sparkles, TimerReset } from "lucide-react";
import { ErrorState, LoadingState, ProgressBar } from "@/components/ui";
import { useBatch } from "@/lib/client-api";

export function DeliveryScreen({ batchId }: { batchId: string }) {
  const { batch, error, loading, refresh } = useBatch(batchId, false);
  const [copied, setCopied] = useState(false);
  const deliverable = useMemo(() => batch?.assets.filter((asset) => asset.outputUrl && ["passed", "approved", "delivered"].includes(asset.status)) ?? [], [batch]);
  const autoPassed = batch ? batch.assets.filter((asset) => ["passed", "delivered"].includes(asset.status)).length : 0;
  const autoPassRate = batch ? Math.round((autoPassed / Math.max(1, batch.assets.filter((asset) => ["passed", "approved", "delivered", "needs_review", "failed"].includes(asset.status)).length)) * 100) : 0;
  const hoursSaved = Math.round(deliverable.length * 7 / 6) / 10;

  async function copyLinks() {
    await navigator.clipboard.writeText(deliverable.map((asset) => `${asset.sku}\t${asset.outputUrl}`).join("\n"));
    setCopied(true);
    window.setTimeout(() => setCopied(false), 1_500);
  }

  if (loading) return <div className="page-wrap"><LoadingState label="Preparing delivery room" /></div>;
  if (error || !batch) return <div className="page-wrap"><ErrorState message={error ?? "Batch unavailable."} onRetry={() => void refresh()} /></div>;

  return (
    <div className="page-wrap delivery-page">
      <header className="board-topbar delivery-topbar">
        <Link href={`/batches/${batch.id}`} className="icon-button"><ArrowLeft size={18} /></Link>
        <div className="board-title"><div><span className="eyebrow">Delivery room</span><h1>{batch.name}</h1></div><span className="delivery-ready"><CheckCircle2 size={15} /> Ready to ship</span></div>
        <div className="board-actions"><button className="button secondary" type="button" onClick={() => void copyLinks()}>{copied ? <Check size={16} /> : <Copy size={16} />} {copied ? "Copied" : "Copy CDN links"}</button><a className="button primary" href={`/api/batches/${batch.id}/delivery`}><Download size={16} /> Download ZIP</a></div>
      </header>

      <section className="delivery-hero">
        <div className="delivery-burst"><span className="burst-ring ring-a"/><span className="burst-ring ring-b"/><PackageCheck size={36} /></div>
        <p className="eyebrow">Autonomous run complete</p><h2>{deliverable.length} publish-ready assets.</h2><p>Your agents generated, judged, revised, and packaged the collection. Every file carries its source, winning prompt, QC evidence, and delivery URL.</p>
        <div className="delivery-summary-pills"><span><ShieldCheck size={15} /> {autoPassRate}% auto-pass rate</span><span><TimerReset size={15} /> {hoursSaved} human hours saved</span><span><Sparkles size={15} /> ${batch.costSpent.toFixed(2)} total model spend</span></div>
      </section>

      <section className="delivery-layout">
        <div className="delivery-gallery-panel">
          <div className="section-heading"><div><span className="section-kicker">Final selects</span><h3>Approved collection</h3></div><span className="delivery-count">{deliverable.length} files</span></div>
          <div className="delivery-grid">{deliverable.map((asset) => <article key={asset.id}><div><img src={asset.outputUrl} alt={asset.name}/><span className="delivery-check"><Check size={13} /></span><span className="delivery-score">{Math.round(asset.qcScore ?? 100)}</span></div><strong>{asset.name}</strong><span>{asset.sku} · P{asset.winningPromptRank ?? 1}</span></article>)}</div>
        </div>
        <aside className="export-panel">
          <div className="export-head"><span><FileArchive size={20} /></span><div><strong>Production package</strong><p>One ZIP, ready for handoff</p></div></div>
          <div className="package-list"><span><ImageIcon size={15} /><strong>{deliverable.length} image assets</strong><small>Original resolution</small></span><span><FileArchive size={15} /><strong>QC manifest</strong><small>Scores and attempt history</small></span><span><Link2 size={15} /><strong>CDN links CSV</strong><small>Per-SKU mapping</small></span></div>
          <a className="button primary full export-button" href={`/api/batches/${batch.id}/delivery`}><Download size={17} /> Download package</a>
          <button className="button secondary full" type="button" onClick={() => void copyLinks()}><Copy size={16} /> Copy all links</button>
          <p className="package-note"><ShieldCheck size={13} /> Archive is generated on demand and never cached.</p>
          <div className="delivery-metrics">
            <div><span>Autonomous pass</span><strong>{autoPassRate}%</strong><ProgressBar value={autoPassRate} tone="green" /></div>
            <div><span>Average QC score</span><strong>{Math.round(deliverable.reduce((sum, asset) => sum + (asset.qcScore ?? 0), 0) / Math.max(1, deliverable.length))}</strong></div>
            <div><span>Cost / delivered asset</span><strong>${(batch.costSpent / Math.max(1, deliverable.length)).toFixed(3)}</strong></div>
          </div>
        </aside>
      </section>

      <section className="next-run-card"><div><span><Sparkles size={19} /></span><div><strong>Turn this run into a reusable recipe</strong><p>Phase 1 will save the calibrated prompt stack as a named template for future collections.</p></div></div><button className="button secondary" type="button" disabled>Coming in Phase 1 <ExternalLink size={14} /></button></section>
    </div>
  );
}
