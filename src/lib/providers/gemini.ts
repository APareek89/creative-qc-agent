import { GoogleGenAI, type Part } from "@google/genai";
import { z } from "zod";
import { demoPrompts, demoSpec } from "@/lib/demo-data";
import { env, isDemoMode } from "@/lib/env";
import type {
  Approval,
  Asset,
  Batch,
  CalibrationCandidate,
  CreativeSpec,
  PriorityPrompt,
  QcScores,
} from "@/lib/types";

const creativeSpecSchema = z.object({
  assetType: z.enum(["multi_view", "sku_lifestyle"]),
  objective: z.string(),
  aspectRatios: z.array(z.string()).min(1),
  variantsPerAsset: z.number().int().min(1).max(4),
  subjectConstraints: z.array(z.string()).min(1),
  styleTokens: z.array(z.string()).min(1),
  brandPalette: z.array(z.string()),
  negativeConstraints: z.array(z.string()),
  acceptanceRubric: z.array(z.object({
    id: z.string(),
    label: z.string(),
    description: z.string(),
    weight: z.number().min(0).max(1),
    minimumScore: z.number().min(0).max(100),
  })).min(3),
  version: z.number().int().positive(),
});

const synthesisSchema = z.object({
  prompts: z.array(z.object({
    rank: z.number().int().min(1),
    prompt: z.string().min(20),
    rationale: z.string().min(10),
    negativePrompt: z.string(),
    params: z.record(z.string(), z.union([z.string(), z.number(), z.boolean()])),
  })).min(2).max(5),
  tightenedRubric: creativeSpecSchema.shape.acceptanceRubric,
});

const qcSchema = z.object({
  scores: z.object({
    productFidelity: z.number().min(0).max(100),
    composition: z.number().min(0).max(100),
    lighting: z.number().min(0).max(100),
    brandStyle: z.number().min(0).max(100),
    technicalQuality: z.number().min(0).max(100),
  }),
  feedback: z.string().min(10),
  corrections: z.array(z.string()),
  confidence: z.number().min(0).max(1),
});

export interface GeminiQcJudgment {
  scores: QcScores;
  feedback: string;
  corrections: string[];
  confidence: number;
}

function client(): GoogleGenAI {
  if (!env.GEMINI_API_KEY) throw new Error("GEMINI_API_KEY is required for live agent execution.");
  return new GoogleGenAI({ apiKey: env.GEMINI_API_KEY, httpOptions: { timeout: env.PROVIDER_TIMEOUT_MS } });
}

async function imagePart(url: string): Promise<Part> {
  if (url.startsWith("data:")) {
    const match = /^data:([^;]+);base64,(.+)$/.exec(url);
    if (!match?.[1] || !match[2]) throw new Error("Invalid inline image data URL.");
    return { inlineData: { mimeType: match[1], data: match[2] } };
  }
  const parsedUrl = new URL(url);
  const allowedHosts = new Set(["fal.media"]);
  if (env.SUPABASE_URL) allowedHosts.add(new URL(env.SUPABASE_URL).hostname);
  if (![...allowedHosts].some((host) => parsedUrl.hostname === host || parsedUrl.hostname.endsWith(`.${host}`))) {
    throw new Error("The vision agent refused an image from an untrusted host.");
  }
  const response = await fetch(url, { signal: AbortSignal.timeout(20_000) });
  if (!response.ok) throw new Error(`Image fetch failed with HTTP ${response.status}.`);
  const declaredLength = Number(response.headers.get("content-length") ?? 0);
  if (declaredLength > 12 * 1024 * 1024) throw new Error("Image exceeds the 12 MB agent-input limit.");
  const buffer = Buffer.from(await response.arrayBuffer());
  if (buffer.byteLength > 12 * 1024 * 1024) throw new Error("Image exceeds the 12 MB agent-input limit.");
  return {
    inlineData: {
      mimeType: response.headers.get("content-type")?.split(";")[0] ?? "image/png",
      data: buffer.toString("base64"),
    },
  };
}

async function imageParts(urls: string[], maximum = 6): Promise<Part[]> {
  return Promise.all(urls.slice(0, maximum).map(imagePart));
}

async function structuredResponse<T extends z.ZodType>(schema: T, prompt: string, parts: Part[]): Promise<z.infer<T>> {
  const response = await client().models.generateContent({
    model: env.GEMINI_AGENT_MODEL,
    contents: [{ role: "user", parts: [{ text: prompt }, ...parts] }],
    config: {
      temperature: 0.2,
      responseMimeType: "application/json",
      responseJsonSchema: z.toJSONSchema(schema),
    },
  });
  const text = response.text;
  if (!text) throw new Error("Gemini returned an empty structured response.");
  let parsed: unknown;
  try {
    parsed = JSON.parse(text);
  } catch {
    throw new Error("Gemini returned invalid JSON.");
  }
  return schema.parse(parsed);
}

export async function createCreativeSpec(batch: Batch): Promise<CreativeSpec> {
  if (isDemoMode) {
    return {
      ...structuredClone(demoSpec),
      assetType: batch.assetType,
      objective: batch.prompt,
      aspectRatios: batch.aspectRatios,
      variantsPerAsset: batch.variantsPerAsset,
    };
  }
  const referenceUrls = batch.references.map((reference) => reference.url);
  const sourceUrls = batch.assets.slice(0, 2).map((asset) => asset.sourceUrl);
  const prompt = `You are the Brief/Spec vision agent for an e-commerce creative production system.
Turn this user request and the attached source/reference images into a production-safe Creative Spec.
Explicitly protect product geometry, color, logos, labels, material, included parts, and complete framing.
Make rubric criteria observable and weighted to sum to 1. Avoid subjective filler.

User brief: ${batch.prompt}
Asset type: ${batch.assetType}
Aspect ratios: ${batch.aspectRatios.join(", ")}
Variants per source: ${batch.variantsPerAsset}`;
  const result = await structuredResponse(creativeSpecSchema, prompt, await imageParts([...sourceUrls, ...referenceUrls]));
  const weightTotal = result.acceptanceRubric.reduce((sum, criterion) => sum + criterion.weight, 0) || 1;
  return {
    ...result,
    acceptanceRubric: result.acceptanceRubric.map((criterion) => ({ ...criterion, weight: criterion.weight / weightTotal })),
  };
}

export async function synthesizePriorityPrompts(
  batch: Batch,
  approvedCandidates: CalibrationCandidate[],
  rejectedCandidates: CalibrationCandidate[],
  approvals: Approval[],
): Promise<{ prompts: PriorityPrompt[]; tightenedRubric: CreativeSpec["acceptanceRubric"] }> {
  if (isDemoMode) {
    return {
      prompts: demoPrompts.map((prompt) => ({ ...structuredClone(prompt), id: crypto.randomUUID(), batchId: batch.id })),
      tightenedRubric: structuredClone(demoSpec.acceptanceRubric),
    };
  }
  if (!batch.spec) throw new Error("A Creative Spec is required before prompt synthesis.");
  const notes = approvals.filter((approval) => approval.note).map((approval) => `${approval.approved ? "approved" : "rejected"}: ${approval.note}`).join("\n");
  const prompt = `You are the Prompt-Synthesis vision agent. Study the approved images as positive examples and rejected images as negatives.
Produce 2–5 ranked FLUX.2 Edit prompts. P1 must be the most repeatable recipe; later prompts must be meaningfully different recovery strategies.
Every prompt must say to preserve the source product exactly. Tighten the rubric only where calibration gives evidence.

Creative Spec: ${JSON.stringify(batch.spec)}
Human notes:\n${notes || "No written notes."}
Images are ordered: ${approvedCandidates.length} approved, then ${rejectedCandidates.length} rejected.`;
  const result = await structuredResponse(
    synthesisSchema,
    prompt,
    await imageParts([...approvedCandidates.map((item) => item.outputUrl), ...rejectedCandidates.map((item) => item.outputUrl)]),
  );
  return {
    prompts: result.prompts.sort((a, b) => a.rank - b.rank).map((item, index) => ({
      id: crypto.randomUUID(),
      batchId: batch.id,
      rank: index + 1,
      prompt: item.prompt,
      rationale: item.rationale,
      negativePrompt: item.negativePrompt,
      params: item.params,
      wins: 0,
      uses: 0,
      winRate: 0,
    })),
    tightenedRubric: result.tightenedRubric,
  };
}

export async function judgeAsset(batch: Batch, asset: Asset, outputUrl: string): Promise<GeminiQcJudgment> {
  if (isDemoMode) {
    return {
      scores: { productFidelity: 94, composition: 89, lighting: 92, brandStyle: 91, technicalQuality: 90 },
      feedback: "Product identity is intact, with convincing contact shadow and a warm editorial treatment consistent with the approved set.",
      corrections: [],
      confidence: 0.94,
    };
  }
  if (!batch.spec) throw new Error("A Creative Spec is required before QC.");
  const approvedUrls = batch.calibrationCandidates.filter((candidate) => candidate.decision === "approved").map((candidate) => candidate.outputUrl);
  const prompt = `You are an exacting e-commerce QC judge. Compare image 1 (source product) to image 2 (generated result), then use remaining images as approved style references.
Score each criterion independently. Product fidelity is strict: warped text, changed logos, missing components, wrong color/material, or altered geometry must be penalized.
Write feedback that a generation model can act on. Do not pass/fail; return evidence-based scores only.

Creative Spec: ${JSON.stringify(batch.spec)}`;
  return structuredResponse(qcSchema, prompt, await imageParts([asset.sourceUrl, outputUrl, ...approvedUrls]));
}

async function embedImage(url: string): Promise<number[]> {
  const part = await imagePart(url);
  const response = await client().models.embedContent({
    model: env.GEMINI_EMBEDDING_MODEL,
    contents: [{ role: "user", parts: [part] }],
    config: { outputDimensionality: 768 },
  });
  const values = response.embeddings?.[0]?.values;
  if (!values?.length) throw new Error("Gemini embedding response was empty.");
  return values;
}

export function cosineSimilarity(left: number[], right: number[]): number {
  if (left.length !== right.length || left.length === 0) throw new Error("Embedding vectors must be non-empty and have the same size.");
  let dot = 0;
  let leftNorm = 0;
  let rightNorm = 0;
  for (let index = 0; index < left.length; index += 1) {
    const a = left[index] ?? 0;
    const b = right[index] ?? 0;
    dot += a * b;
    leftNorm += a * a;
    rightNorm += b * b;
  }
  const denominator = Math.sqrt(leftNorm) * Math.sqrt(rightNorm);
  return denominator === 0 ? 0 : Math.max(-1, Math.min(1, dot / denominator));
}

export async function compareToApproved(batch: Batch, outputUrl: string): Promise<number> {
  if (isDemoMode) return 0.91;
  const approvedUrls = batch.calibrationCandidates.filter((candidate) => candidate.decision === "approved").map((candidate) => candidate.outputUrl).slice(0, 5);
  if (!approvedUrls.length) return 0;
  const outputEmbedding = await embedImage(outputUrl);
  const approvedEmbeddings = await Promise.all(approvedUrls.map(embedImage));
  return Math.max(...approvedEmbeddings.map((embedding) => cosineSimilarity(outputEmbedding, embedding)));
}
