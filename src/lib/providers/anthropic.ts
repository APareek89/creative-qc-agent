import { z } from "zod";
import { demoPrompts, demoSpec } from "@/lib/demo-data";
import { env, isDemoMode } from "@/lib/env";
import type {
  Approval,
  Batch,
  CalibrationCandidate,
  CreativeSpec,
  PriorityPrompt,
  QcScores,
} from "@/lib/types";
import type { VlmQcEvidence } from "@/lib/providers/vlm";

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
    params: z.object({
      guidance_scale: z.number(),
      num_inference_steps: z.number().int(),
    }),
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

const anthropicResponseSchema = z.object({
  id: z.string(),
  model: z.string(),
  content: z.array(z.object({
    type: z.string(),
    text: z.string().optional(),
  })),
  usage: z.object({
    input_tokens: z.number(),
    output_tokens: z.number(),
  }),
});

type AnthropicImageBlock =
  | { type: "image"; source: { type: "url"; url: string } }
  | { type: "image"; source: { type: "base64"; media_type: "image/jpeg" | "image/png" | "image/gif" | "image/webp"; data: string } };

export interface AnthropicQcJudgment {
  scores: QcScores;
  feedback: string;
  corrections: string[];
  confidence: number;
}

function assertTrustedImageUrl(value: string): void {
  const parsed = new URL(value);
  if (parsed.protocol !== "https:") throw new Error("The reasoning agent requires HTTPS image URLs.");
  const allowedHosts = new Set(["fal.media"]);
  if (env.SUPABASE_URL) allowedHosts.add(new URL(env.SUPABASE_URL).hostname);
  if (![...allowedHosts].some((host) => parsed.hostname === host || parsed.hostname.endsWith(`.${host}`))) {
    throw new Error("The reasoning agent refused an image from an untrusted host.");
  }
}

function imageBlock(value: string): AnthropicImageBlock {
  if (value.startsWith("data:")) {
    const match = /^data:(image\/(?:jpeg|png|gif|webp));base64,(.+)$/.exec(value);
    if (!match?.[1] || !match[2]) throw new Error("Invalid or unsupported inline image data URL.");
    return {
      type: "image",
      source: {
        type: "base64",
        media_type: match[1] as "image/jpeg" | "image/png" | "image/gif" | "image/webp",
        data: match[2],
      },
    };
  }
  assertTrustedImageUrl(value);
  return { type: "image", source: { type: "url", url: value } };
}

function imageBlocks(values: string[], maximum = 10): AnthropicImageBlock[] {
  return values.slice(0, maximum).map(imageBlock);
}

const unsupportedAnthropicSchemaKeywords = new Set([
  "$schema",
  "minimum",
  "maximum",
  "exclusiveMinimum",
  "exclusiveMaximum",
  "minLength",
  "maxLength",
  "minItems",
  "maxItems",
  "pattern",
  "format",
]);

function sanitizeAnthropicSchema(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(sanitizeAnthropicSchema);
  if (!value || typeof value !== "object") return value;
  return Object.fromEntries(
    Object.entries(value as Record<string, unknown>)
      .filter(([key]) => !unsupportedAnthropicSchemaKeywords.has(key))
      .map(([key, item]) => [key, sanitizeAnthropicSchema(item)]),
  );
}

export function toAnthropicJsonSchema<T extends z.ZodType>(schema: T): Record<string, unknown> {
  return sanitizeAnthropicSchema(z.toJSONSchema(schema)) as Record<string, unknown>;
}

async function structuredResponse<T extends z.ZodType>(
  schema: T,
  prompt: string,
  images: AnthropicImageBlock[] = [],
  maxTokens = 3_000,
): Promise<z.infer<T>> {
  if (!env.ANTHROPIC_API_KEY) throw new Error("ANTHROPIC_API_KEY is required for live agent execution.");
  const response = await fetch("https://api.anthropic.com/v1/messages", {
    method: "POST",
    headers: {
      "anthropic-version": "2023-06-01",
      "content-type": "application/json",
      "x-api-key": env.ANTHROPIC_API_KEY,
    },
    body: JSON.stringify({
      model: env.ANTHROPIC_MODEL,
      max_tokens: maxTokens,
      system: "You are the reasoning layer in a production creative-QC system. Follow the supplied evidence, protect product identity, and never invent visual facts that are not visible in the inputs.",
      messages: [{ role: "user", content: [...images, { type: "text", text: prompt }] }],
      output_config: {
        format: { type: "json_schema", schema: toAnthropicJsonSchema(schema) },
      },
    }),
    signal: AbortSignal.timeout(env.PROVIDER_TIMEOUT_MS),
  });
  if (!response.ok) {
    const body = await response.text();
    let detail = `HTTP ${response.status}`;
    try {
      const parsed = JSON.parse(body) as { error?: { message?: string } };
      detail = parsed.error?.message || detail;
    } catch {
      // Keep the status-only error when the provider returns HTML or malformed JSON.
    }
    throw new Error(`Anthropic request failed: ${detail}`);
  }
  const payload = anthropicResponseSchema.parse(await response.json());
  const text = payload.content.find((block) => block.type === "text")?.text;
  if (!text) throw new Error("Anthropic returned no structured text response.");
  console.info(JSON.stringify({
    event: "anthropic_agent_completed",
    requestId: payload.id,
    model: payload.model,
    inputTokens: payload.usage.input_tokens,
    outputTokens: payload.usage.output_tokens,
  }));
  return schema.parse(JSON.parse(text));
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
  const sourceUrls = batch.assets.slice(0, 2).map((asset) => asset.sourceUrl);
  const referenceUrls = batch.references.filter((reference) => reference.type === "image").map((reference) => reference.url);
  const prompt = `Build the production Creative Spec from the user brief and attached images.
Images 1–${sourceUrls.length} are source products and are the identity source of truth. Any later images are style references only.
Explicitly protect geometry, colors, logos, label text, material, included parts, and complete framing. Extract reusable style characteristics, never reference products. Make acceptance criteria observable and weights sum to 1.

User brief: ${batch.prompt}
Asset type: ${batch.assetType}
Aspect ratios: ${batch.aspectRatios.join(", ")}
Variants per source: ${batch.variantsPerAsset}`;
  const result = await structuredResponse(creativeSpecSchema, prompt, imageBlocks([...sourceUrls, ...referenceUrls]), 3_000);
  const weightTotal = result.acceptanceRubric.reduce((sum, criterion) => sum + criterion.weight, 0) || 1;
  return {
    ...result,
    assetType: batch.assetType,
    objective: batch.prompt,
    aspectRatios: batch.aspectRatios,
    variantsPerAsset: batch.variantsPerAsset,
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
  const approvedUrls = approvedCandidates.map((item) => item.outputUrl);
  const rejectedUrls = rejectedCandidates.map((item) => item.outputUrl);
  const prompt = `Synthesize 2–5 ranked FLUX.2 Edit recipes from the calibration evidence.
Images 1–${approvedUrls.length} are positive examples. The remaining ${rejectedUrls.length} images are negative examples.
P1 must be the most repeatable strategy. Later prompts must be meaningfully different recovery strategies. Every prompt must explicitly preserve the source product. Tighten the rubric only where the approvals, rejects, or notes provide evidence.

Creative Spec: ${JSON.stringify(batch.spec)}
Human notes:\n${notes || "No written notes."}`;
  const result = await structuredResponse(synthesisSchema, prompt, imageBlocks([...approvedUrls, ...rejectedUrls]), 3_500);
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

export async function reasonAboutQc(batch: Batch, evidence: VlmQcEvidence): Promise<AnthropicQcJudgment> {
  if (isDemoMode) {
    return {
      scores: { productFidelity: 94, composition: 89, lighting: 92, brandStyle: 91, technicalQuality: 90 },
      feedback: "Product identity is intact, with convincing contact shadow and a warm editorial treatment consistent with the approved set.",
      corrections: [],
      confidence: 0.94,
    };
  }
  if (!batch.spec) throw new Error("A Creative Spec is required before QC.");
  const prompt = `Act as the final QC reasoner. The separate vision model supplied observable evidence; do not claim to have seen the images yourself.
Score the generated candidate against the Creative Spec. Product fidelity is strict: changed text/logo, missing parts, wrong color/material, or altered geometry must be penalized. Feedback must be concise and directly usable by the image-edit model. Return scores and corrections only; deterministic application code will make the pass/fail decision.

Creative Spec: ${JSON.stringify(batch.spec)}
Vision evidence: ${JSON.stringify(evidence)}`;
  return structuredResponse(qcSchema, prompt, [], 1_800);
}
