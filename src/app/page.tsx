"use client";

import Link from "next/link";
import { ArrowRight, Check, Clock3, Coins, Images, Play, Plus, ScanLine, Sparkles, TrendingUp, WandSparkles, Zap } from "lucide-react";
import { StatusChip } from "@/components/status-chip";
import { LoadingState, ProgressBar } from "@/components/ui";
import { useDashboard } from "@/lib/client-api";
import { isRuntimeHealthy } from "@/lib/types";

function formatDate(value: string) {
  return new Intl.DateTimeFormat("en", { month: "short", day: "numeric", hour: "numeric", minute: "2-digit" }).format(new Date(value));
}

export default function DashboardPage() {
  const { data, health, error, loading, refresh } = useDashboard();
  if (loading) return <div className="page-wrap"><LoadingState /></div>;
  if (error || !data) {
    const dependencies = health ? Object.entries(health).filter(([name]) => !["mode", "web"].includes(name)) : [];
    return (
      <div className="page-wrap setup-blocked-page">
        <header className="topbar"><div><p className="eyebrow">Live environment</p><h1>Provider preflight</h1></div><Link href="/new" className="button secondary"><Plus size={17} /> New batch</Link></header>
        <section className="setup-blocked-card">
          <span className="runtime-pill error"><span />Live setup blocked</span>
          <h2>The app is real. One or more live dependencies are not ready.</h2>
          <p>{error ?? "Dashboard data is unavailable."}</p>
          {dependencies.length > 0 && <div className="dependency-grid">{dependencies.map(([name, status]) => <div key={name}><span className={`dependency-dot ${status}`} /><strong>{name}</strong><small>{status}</small></div>)}</div>}
          <div className="setup-actions"><button className="button primary" type="button" onClick={() => void refresh()}>Run checks again</button><a className="button secondary" href="/api/health" target="_blank" rel="noreferrer">Open health JSON</a></div>
        </section>
      </div>
    );
  }
  const active = data.batches.find((batch) => batch.status === "autonomous_running") ?? data.batches[0];
  const liveHealthy = health ? isRuntimeHealthy(health) : false;

  return (
    <div className="page-wrap dashboard-page">
      <header className="topbar">
        <div><p className="eyebrow">Creative operations</p><h1>Good morning, Anand.</h1></div>
        <div className="topbar-actions">
          <span className={`runtime-pill ${health?.mode === "demo" ? "demo" : liveHealthy ? "live" : "error"}`}><span />{health?.mode === "demo" ? "Review mode" : liveHealthy ? "Live providers" : "Live setup blocked"}</span>
          <Link href="/new" className="button primary"><Plus size={17} /> New batch</Link>
        </div>
      </header>

      <section className="hero-panel">
        <div className="hero-copy">
          <span className="agent-label"><Sparkles size={14} /> Agentic creative production</span>
          <h2>Calibrate once.<br/><em>Ship the whole collection.</em></h2>
          <p>Approve five examples, then watch vision agents generate, judge, revise, and deliver every remaining SKU.</p>
          <div className="hero-actions">
            <Link href="/new" className="button light"><WandSparkles size={17} /> Start a production run</Link>
            <Link href={active ? `/batches/${active.id}` : "/new"} className="text-link"><Play size={14} fill="currentColor" /> {active ? "Watch the agents work" : "Create the first batch"}</Link>
          </div>
        </div>
        <div className="hero-visual" aria-hidden="true">
          <div className="hero-orbit orbit-one" />
          <div className="hero-orbit orbit-two" />
          <div className="agent-core"><Sparkles size={30} /><span>QC</span></div>
          <div className="floating-card card-generate"><Zap size={16} /><div><strong>Generation</strong><span>FLUX.2 · attempt 2</span></div><i /></div>
          <div className="floating-card card-judge"><ScanLine size={16} /><div><strong>Vision judge</strong><span>Nemotron + Claude · 92/100</span></div><Check size={14} /></div>
          <div className="floating-card card-recipe"><WandSparkles size={16} /><div><strong>Recipe P1</strong><span>78% win rate</span></div></div>
        </div>
      </section>

      <section className="stat-grid" aria-label="Workspace metrics">
        <article className="stat-card"><div className="stat-icon purple"><Images size={19} /></div><div><span>Assets in motion</span><strong>{data.totalAssets}</strong><small><TrendingUp size={12} /> 18 this week</small></div></article>
        <article className="stat-card"><div className="stat-icon green"><Check size={19} /></div><div><span>Autonomous pass rate</span><strong>{data.autoPassRate}%</strong><small><TrendingUp size={12} /> Quality holding</small></div></article>
        <article className="stat-card"><div className="stat-icon amber"><Clock3 size={19} /></div><div><span>Human hours saved</span><strong>{data.estimatedHoursSaved}</strong><small>At 7 min / asset</small></div></article>
        <article className="stat-card"><div className="stat-icon blue"><Coins size={19} /></div><div><span>Generation spend</span><strong>${data.totalSpend.toFixed(2)}</strong><small>Across active batches</small></div></article>
      </section>

      {active && (
        <section className="active-production section-block">
          <div className="section-heading"><div><span className="section-kicker"><i /> Live production</span><h3>Watch the agents work</h3></div><Link href={`/batches/${active.id}`} className="text-link">Open batch <ArrowRight size={14} /></Link></div>
          <div className="production-card">
            <div className="production-cover"><img src={active.coverUrl} alt="Featured batch output"/><div className="cover-overlay"><StatusChip status={active.status} /><strong>{active.name}</strong><span>{active.assetType === "sku_lifestyle" ? "SKU → lifestyle" : "Multi-view catalogue"}</span></div></div>
            <div className="production-detail">
              <div className="production-title"><div><p>Batch progress</p><h4>{active.passedAssets + active.reviewAssets} of {active.totalAssets} reviewed</h4></div><span>{Math.round(((active.passedAssets + active.reviewAssets) / Math.max(1, active.totalAssets)) * 100)}%</span></div>
              <ProgressBar value={((active.passedAssets + active.reviewAssets) / Math.max(1, active.totalAssets)) * 100} />
              <div className="mini-metrics"><span><i className="dot green" /> {active.passedAssets} passed</span><span><i className="dot amber" /> {active.reviewAssets} review</span><span><i className="dot gray" /> {Math.max(0, active.totalAssets - active.passedAssets - active.reviewAssets)} active</span></div>
              <div className="cost-line"><span>Spend <strong>${active.costSpent.toFixed(2)}</strong> of ${active.costCap.toFixed(2)}</span><span>ETA · 2 min</span></div>
              <ProgressBar value={(active.costSpent / active.costCap) * 100} tone="green" />
              <Link className="button secondary full" href={`/batches/${active.id}`}>Enter production board <ArrowRight size={16} /></Link>
            </div>
          </div>
        </section>
      )}

      <section className="section-block recent-section">
        <div className="section-heading"><div><span className="section-kicker">Workspace</span><h3>Recent batches</h3></div><button className="filter-button" type="button">All production</button></div>
        <div className="batch-list">
          {data.batches.map((batch) => (
            <Link href={`/batches/${batch.id}`} className="batch-row" key={batch.id}>
              <img src={batch.coverUrl} alt="" />
              <div className="batch-row-title"><strong>{batch.name}</strong><span>{batch.assetType === "sku_lifestyle" ? "SKU → lifestyle" : "Multi-view catalogue"} · {formatDate(batch.updatedAt)}</span></div>
              <StatusChip status={batch.status} compact />
              <div className="batch-row-number"><strong>{batch.passedAssets}/{batch.totalAssets}</strong><span>passed</span></div>
              <div className="batch-row-number"><strong>${batch.costSpent.toFixed(2)}</strong><span>spent</span></div>
              <ArrowRight size={17} className="row-arrow" />
            </Link>
          ))}
        </div>
      </section>
    </div>
  );
}
