"use client";

import { useMemo, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { ArrowLeft, ArrowRight, Check, CircleDollarSign, FileImage, ImagePlus, Layers3, LoaderCircle, Plus, Sparkles, Upload, X } from "lucide-react";
import { apiRequest } from "@/lib/client-api";
import type { AssetType, Batch } from "@/lib/types";
import { MAX_OUTPUT_ASSETS } from "@/lib/validation";

type UploadPreview = { file: File; url: string };

function FileGrid({ items, onRemove }: { items: UploadPreview[]; onRemove: (index: number) => void }) {
  return (
    <div className="upload-grid">
      {items.map((item, index) => (
        <div className="upload-thumb" key={`${item.file.name}-${item.file.lastModified}`}>
          <img src={item.url} alt={item.file.name} />
          <button type="button" onClick={() => onRemove(index)} aria-label={`Remove ${item.file.name}`}><X size={13} /></button>
          <span>{item.file.name}</span>
        </div>
      ))}
    </div>
  );
}

function Dropzone({ title, description, files, setFiles, multiple = true, references = false }: {
  title: string;
  description: string;
  files: UploadPreview[];
  setFiles: (value: UploadPreview[]) => void;
  multiple?: boolean;
  references?: boolean;
}) {
  const input = useRef<HTMLInputElement>(null);
  const [dragging, setDragging] = useState(false);

  function add(fileList: FileList | File[]) {
    const incoming = [...fileList];
    const accepted = incoming.filter((file) => file.type.startsWith("image/"));
    const next = multiple ? [...files, ...accepted.map((file) => ({ file, url: URL.createObjectURL(file) }))] : accepted.slice(0, 1).map((file) => ({ file, url: URL.createObjectURL(file) }));
    setFiles(next.slice(0, references ? 10 : 50));
  }

  return (
    <>
      <button
        type="button"
        className={`dropzone ${dragging ? "dragging" : ""}`}
        onClick={() => input.current?.click()}
        onDragEnter={(event) => { event.preventDefault(); setDragging(true); }}
        onDragOver={(event) => event.preventDefault()}
        onDragLeave={() => setDragging(false)}
        onDrop={(event) => { event.preventDefault(); setDragging(false); add(event.dataTransfer.files); }}
      >
        <span className="drop-icon"><Upload size={23} /></span>
        <strong>{title}</strong>
        <p>{description}</p>
        <span className="drop-browse"><Plus size={14} /> Browse files</span>
        <small>{references ? "JPG, PNG or WebP · 10 MB each · up to 10" : "JPG, PNG or WebP · 10 MB each · up to 50"}</small>
      </button>
      <input ref={input} hidden type="file" accept="image/jpeg,image/png,image/webp" multiple={multiple} onChange={(event) => event.target.files && add(event.target.files)} />
    </>
  );
}

export default function NewBatchPage() {
  const router = useRouter();
  const [step, setStep] = useState(1);
  const [sources, setSources] = useState<UploadPreview[]>([]);
  const [references, setReferences] = useState<UploadPreview[]>([]);
  const [name, setName] = useState("Autumn product campaign");
  const [prompt, setPrompt] = useState("Place every product in a premium warm editorial studio. Preserve product geometry, color, logos, labels, and materials exactly. Use textured stone, a taupe gradient, directional window light, and deep soft shadows.");
  const [assetType, setAssetType] = useState<AssetType>("sku_lifestyle");
  const [ratios, setRatios] = useState(["4:5"]);
  const [variants, setVariants] = useState(1);
  const [costCap, setCostCap] = useState(5);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string>();
  const canContinue = step === 1 ? sources.length > 0 : step === 2 || (name.trim().length >= 3 && prompt.trim().length >= 12);
  const estimatedImages = useMemo(() => sources.length * variants * ratios.length, [sources.length, variants, ratios.length]);

  function remove(items: UploadPreview[], index: number, setter: (value: UploadPreview[]) => void) {
    URL.revokeObjectURL(items[index]!.url);
    setter(items.filter((_, itemIndex) => itemIndex !== index));
  }

  async function submit() {
    setSubmitting(true);
    setError(undefined);
    try {
      if (estimatedImages > MAX_OUTPUT_ASSETS) throw new Error(`This setup requests ${estimatedImages} outputs; reduce sources, ratios, or variants to stay within ${MAX_OUTPUT_ASSETS}.`);
      const form = new FormData();
      form.set("data", JSON.stringify({ name, prompt, assetType, aspectRatios: ratios, variantsPerAsset: variants, costCap }));
      sources.forEach((item) => form.append("sources", item.file));
      references.forEach((item) => form.append("references", item.file));
      const batch = await apiRequest<Batch>("/api/batches", { method: "POST", body: form });
      router.push(`/batches/${batch.id}/calibrate`);
    } catch (requestError) {
      setError(requestError instanceof Error ? requestError.message : "Could not create the batch.");
      setSubmitting(false);
    }
  }

  return (
    <div className="page-wrap wizard-page">
      <header className="topbar wizard-topbar">
        <div><p className="eyebrow">New production</p><h1>Build the calibration set</h1></div>
        <span className="draft-label">Draft saved locally</span>
      </header>

      <div className="wizard-layout">
        <aside className="wizard-rail">
          {[{ n: 1, title: "Source products", body: "The SKUs agents will transform" }, { n: 2, title: "Reference look", body: "Teach the visual target" }, { n: 3, title: "Brief & guardrails", body: "Define quality and spend" }].map((item) => (
            <button type="button" key={item.n} className={`wizard-step ${step === item.n ? "active" : ""} ${step > item.n ? "complete" : ""}`} onClick={() => step > item.n && setStep(item.n)}>
              <span>{step > item.n ? <Check size={15} /> : item.n}</span><div><strong>{item.title}</strong><small>{item.body}</small></div>
            </button>
          ))}
          <div className="wizard-tip"><Sparkles size={17} /><strong>Why five approvals?</strong><p>It gives the synthesis agent enough positive evidence to infer a repeatable style without slowing you down.</p></div>
        </aside>

        <section className="wizard-card">
          {step === 1 && (
            <div className="wizard-pane">
              <span className="pane-icon"><FileImage size={22} /></span>
              <p className="eyebrow">Step 1 of 3</p><h2>Upload source products</h2><p className="pane-intro">Add up to 50 clean catalogue images. Each source becomes one independent agent job, so a difficult SKU can never block the batch.</p>
              <Dropzone title="Drop product images here" description="Use clean, well-lit product photos for the strongest fidelity." files={sources} setFiles={setSources} />
              {sources.length > 0 && <><div className="upload-heading"><strong>Source products</strong><span>{sources.length} / 50</span></div><FileGrid items={sources} onRemove={(index) => remove(sources, index, setSources)} /></>}
            </div>
          )}
          {step === 2 && (
            <div className="wizard-pane">
              <span className="pane-icon"><ImagePlus size={22} /></span>
              <p className="eyebrow">Step 2 of 3 · Optional</p><h2>Show us the target look</h2><p className="pane-intro">Reference images teach the Spec and QC agents what “on-brand” means. Campaign stills and moodboards work well.</p>
              <Dropzone title="Add visual references" description="These are style evidence, never products to copy." files={references} setFiles={setReferences} references />
              {references.length > 0 && <><div className="upload-heading"><strong>Reference look</strong><span>{references.length} / 10</span></div><FileGrid items={references} onRemove={(index) => remove(references, index, setReferences)} /></>}
              <div className="reference-guidance"><Sparkles size={17} /><div><strong>Strong references share a visual grammar</strong><p>Choose examples with similar lighting, palette, composition, and background treatment. The agent extracts those patterns—not individual objects.</p></div></div>
            </div>
          )}
          {step === 3 && (
            <div className="wizard-pane settings-pane">
              <span className="pane-icon"><Layers3 size={22} /></span>
              <p className="eyebrow">Step 3 of 3</p><h2>Set the creative brief</h2><p className="pane-intro">Write the outcome in plain language. Claude will convert it into product constraints and a scored acceptance rubric.</p>
              <label className="field"><span>Batch name</span><input value={name} maxLength={80} onChange={(event) => setName(event.target.value)} /></label>
              <label className="field"><span>Creative direction</span><textarea value={prompt} maxLength={3000} rows={6} onChange={(event) => setPrompt(event.target.value)} /><small>{prompt.length} / 3000</small></label>
              <div className="field"><span>Asset type</span><div className="choice-grid"><button type="button" className={assetType === "sku_lifestyle" ? "selected" : ""} onClick={() => setAssetType("sku_lifestyle")}><ImagePlus size={19} /><strong>SKU → lifestyle</strong><small>Preserve the product, replace the scene</small></button><button type="button" className={assetType === "multi_view" ? "selected" : ""} onClick={() => setAssetType("multi_view")}><Layers3 size={19} /><strong>Multi-view catalogue</strong><small>Create consistent angles and framing</small></button></div></div>
              <div className="settings-row">
                <div className="field"><span>Aspect ratios</span><div className="ratio-pills">{["1:1", "4:5", "3:4", "16:9", "9:16"].map((ratio) => <button type="button" key={ratio} className={ratios.includes(ratio) ? "selected" : ""} onClick={() => setRatios((current) => current.includes(ratio) ? (current.length === 1 ? current : current.filter((item) => item !== ratio)) : [...current, ratio].slice(-3))}>{ratio}</button>)}</div></div>
                <label className="field compact-field"><span>Variants / source</span><select value={variants} onChange={(event) => setVariants(Number(event.target.value))}>{[1, 2, 3, 4].map((value) => <option key={value}>{value}</option>)}</select></label>
              </div>
              <div className="cost-setting"><div className="cost-icon"><CircleDollarSign size={20} /></div><div><strong>Batch cost cap</strong><p>Hard stop enforced before every generation call.</p></div><div className="cost-input"><span>$</span><input type="number" min="0.25" max="100" step="0.25" value={costCap} onChange={(event) => setCostCap(Number(event.target.value))} /></div></div>
              <div className="estimate-line"><span>Estimated delivery</span><strong>{estimatedImages || sources.length} assets · max ${costCap.toFixed(2)}</strong></div>
            </div>
          )}

          {error && <div className="inline-error">{error}</div>}
          <footer className="wizard-footer">
            <button className="button secondary" type="button" disabled={step === 1 || submitting} onClick={() => setStep((value) => value - 1)}><ArrowLeft size={16} /> Back</button>
            {step < 3 ? <button className="button primary" type="button" disabled={!canContinue} onClick={() => setStep((value) => value + 1)}>Continue <ArrowRight size={16} /></button> : <button className="button primary start-button" type="button" disabled={!canContinue || submitting} onClick={() => void submit()}>{submitting ? <LoaderCircle className="spin" size={17} /> : <Sparkles size={17} />} Start calibration</button>}
          </footer>
        </section>
      </div>
    </div>
  );
}
