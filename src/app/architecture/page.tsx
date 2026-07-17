import Link from "next/link";
import { ArrowRight, Bot, Boxes, CircleDollarSign, Database, GitBranch, HardDrive, ImageIcon, Network, ScanLine, ShieldCheck, Sparkles, UserCheck, WandSparkles, Zap } from "lucide-react";

export default function ArchitecturePage() {
  return (
    <div className="page-wrap architecture-page">
      <header className="topbar"><div><p className="eyebrow">System transparency</p><h1>Agent workflow</h1></div><Link href="/" className="button primary">Open workspace <ArrowRight size={16} /></Link></header>
      <section className="architecture-hero"><span className="agent-label"><Network size={14} /> Bounded, inspectable autonomy</span><h2>Agents make quality decisions.<br/><em>Code controls the risk.</em></h2><p>Gemini interprets visual quality, FLUX renders, and deterministic LangGraph gates control spend, retries, and terminal state.</p></section>
      <section className="architecture-flow">
        <div className="flow-lane">
          <article className="flow-node function"><span><ImageIcon size={20} /></span><small>FUNCTION</small><strong>Upload & validate</strong><p>1–50 sources, references, brief, spend cap</p></article><i><ArrowRight size={17} /></i>
          <article className="flow-node data"><span><HardDrive size={20} /></span><small>DATA</small><strong>Storage + Postgres</strong><p>Durable URLs and normalized batch state</p></article><i><ArrowRight size={17} /></i>
          <article className="flow-node agent"><span><Bot size={20} /></span><small>AGENT · GEMINI</small><strong>Creative Spec</strong><p>Constraints, style tokens, weighted rubric</p></article>
        </div>
        <div className="flow-down"><ArrowRight size={17} /></div>
        <div className="flow-lane reverse">
          <article className="flow-node agent"><span><WandSparkles size={20} /></span><small>AGENT · GEMINI</small><strong>Prompt synthesis</strong><p>Ranked P1…Pn recipe from positives and negatives</p></article><i><ArrowRight size={17} /></i>
          <article className="flow-node human"><span><UserCheck size={20} /></span><small>HUMAN · ONCE</small><strong>Approve five</strong><p>Quick decisions plus optional reject notes</p></article><i><ArrowRight size={17} /></i>
          <article className="flow-node library"><span><Sparkles size={20} /></span><small>LIBRARY · FLUX.2</small><strong>Calibration</strong><p>Source-faithful candidate images</p></article>
        </div>
        <div className="flow-down"><ArrowRight size={17} /></div>
        <div className="autonomy-loop">
          <div className="loop-title"><GitBranch size={18} /><div><strong>Per-asset LangGraph loop</strong><span>Runs independently in BullMQ workers</span></div></div>
          <div className="loop-nodes"><article className="flow-node library"><span><Zap size={20} /></span><small>LIBRARY · FLUX.2</small><strong>Generate / revise</strong><p>Source + prompt + QC correction</p></article><i><ArrowRight size={17} /></i><article className="flow-node agent"><span><ScanLine size={20} /></span><small>AGENT · GEMINI</small><strong>Vision QC</strong><p>Rubric scores and actionable feedback</p></article><i><ArrowRight size={17} /></i><article className="flow-node data"><span><Boxes size={20} /></span><small>MODEL · EMBEDDING 2</small><strong>Similarity</strong><p>Cosine match to approved references</p></article><i><ArrowRight size={17} /></i><article className="flow-node decision"><span><ShieldCheck size={20} /></span><small>FUNCTION · POLICY</small><strong>Pass / retry / fallback</strong><p>80 score · 85 fidelity · 5 attempts</p></article></div>
          <div className="loop-return"><span>QC correction ≤ 2</span><i /><span>next prompt P2…Pn</span></div>
        </div>
      </section>
      <section className="guardrail-grid"><article><span><CircleDollarSign size={19} /></span><strong>Cost reserved atomically</strong><p>The database checks remaining budget before any generation call can start.</p></article><article><span><ShieldCheck size={19} /></span><strong>No silent dead ends</strong><p>Failed jobs retry with backoff, then enter a visible dead-letter and review path.</p></article><article><span><Database size={19} /></span><strong>Every decision persists</strong><p>Attempts, prompts, model feedback, similarity, cost, and human overrides remain inspectable.</p></article></section>
    </div>
  );
}
