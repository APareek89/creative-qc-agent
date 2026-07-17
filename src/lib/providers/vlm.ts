import { fal } from "@fal-ai/client";
import { z } from "zod";
import { env, isDemoMode } from "@/lib/env";
import type { Asset, Batch } from "@/lib/types";

const stringArraySchema = z.preprocess(
  (value) => typeof value === "string" ? (value.trim() ? [value] : []) : value,
  z.array(z.string()),
);

const evidenceSchema = z.object({
  sourceProduct: z.object({
    description: z.string().min(3),
    visibleText: stringArraySchema,
    colors: stringArraySchema,
    geometry: stringArraySchema,
    materials: stringArraySchema,
  }),
  candidate: z.object({
    description: z.string().min(3),
    visibleText: stringArraySchema,
    colors: stringArraySchema,
    geometry: stringArraySchema,
    materials: stringArraySchema,
  }),
  preservedDetails: stringArraySchema,
  changedOrMissingDetails: stringArraySchema,
  technicalIssues: stringArraySchema,
  approvedStyleMatches: stringArraySchema,
  productSimilarity: z.coerce.number().min(0).max(1),
  styleSimilarity: z.coerce.number().min(0).max(1),
  confidence: z.coerce.number().min(0).max(1),
  summary: z.string().min(10),
});

const falVisionResponseSchema = z.object({
  data: z.object({
    output: z.string(),
    usage: z.object({
      cost: z.number(),
      prompt_tokens: z.number().optional(),
      completion_tokens: z.number().optional(),
      total_tokens: z.number().optional(),
    }),
  }),
  requestId: z.string().optional(),
});

const VLM_CIRCUIT_OPEN_MS = 15 * 60 * 1_000;
let unavailablePrimary: { model: string; until: number } | undefined;

export type VlmQcEvidence = z.infer<typeof evidenceSchema> & {
  model: string;
  usedFallback: boolean;
};

export async function runWithVlmFallback<T>(
  models: string[],
  run: (model: string) => Promise<T>,
  onFailure?: (model: string, error: unknown) => void,
): Promise<{ result: T; model: string; usedFallback: boolean }> {
  let primaryError: unknown;
  for (let index = 0; index < models.length; index += 1) {
    const model = models[index]!;
    try {
      return { result: await run(model), model, usedFallback: index > 0 };
    } catch (error) {
      primaryError ??= error;
      onFailure?.(model, error);
      console.warn(JSON.stringify({
        event: "vlm_qc_model_failed",
        model,
        fallbackAvailable: index + 1 < models.length,
        error: error instanceof Error ? error.message : "Unknown VLM provider error",
      }));
    }
  }
  const detail = primaryError instanceof Error ? primaryError.message : "Unknown VLM provider error";
  throw new Error(`Visual QC failed on both primary and fallback models. First failure: ${detail}`);
}

export function parseVlmEvidence(raw: string): z.infer<typeof evidenceSchema> {
  const withoutFence = raw.trim().replace(/^```(?:json)?\s*/i, "").replace(/\s*```$/i, "");
  const start = withoutFence.indexOf("{");
  const end = withoutFence.lastIndexOf("}");
  if (start < 0 || end <= start) throw new Error("The vision model did not return a JSON object.");
  return evidenceSchema.parse(JSON.parse(withoutFence.slice(start, end + 1)));
}

async function runVisionModel(model: string, imageUrls: string[], prompt: string): Promise<z.infer<typeof evidenceSchema>> {
  if (!env.FAL_KEY) throw new Error("FAL_KEY is required for live visual QC.");
  fal.config({ credentials: env.FAL_KEY });
  for (let attempt = 1; attempt <= 2; attempt += 1) {
    try {
      const raw = await fal.subscribe("openrouter/router/vision", {
        abortSignal: AbortSignal.timeout(env.PROVIDER_TIMEOUT_MS),
        startTimeout: Math.ceil(env.PROVIDER_TIMEOUT_MS / 1000),
        input: {
          image_urls: imageUrls,
          prompt,
          system_prompt: "You are a visual evidence extractor, not the final decision maker. Report only visible facts. Return one JSON object with no markdown or commentary.",
          model,
          reasoning: false,
          temperature: 0,
          max_tokens: 1_800,
        },
        logs: false,
      });
      const parsed = falVisionResponseSchema.parse(raw);
      console.info(JSON.stringify({
        event: "vlm_qc_completed",
        model,
        requestId: parsed.requestId,
        cost: parsed.data.usage.cost,
        providerAttempt: attempt,
      }));
      return parseVlmEvidence(parsed.data.output);
    } catch (error) {
      const candidate = error as { status?: number; statusCode?: number; response?: { status?: number }; name?: string };
      const status = candidate.status ?? candidate.statusCode ?? candidate.response?.status;
      const retryable = status === 429 || (typeof status === "number" && status >= 500) || candidate.name === "AbortError";
      if (!retryable || attempt === 2) throw error;
      await new Promise((resolve) => setTimeout(resolve, 750 * attempt));
    }
  }
  throw new Error("Visual QC provider retries were exhausted.");
}

export async function extractQcEvidence(batch: Batch, asset: Asset, outputUrl: string): Promise<VlmQcEvidence> {
  if (isDemoMode) {
    return {
      sourceProduct: { description: "White low-top sneaker", visibleText: [], colors: ["white", "black"], geometry: ["low-top silhouette"], materials: ["canvas", "rubber"] },
      candidate: { description: "The same sneaker in a warm studio", visibleText: [], colors: ["white", "black"], geometry: ["low-top silhouette"], materials: ["canvas", "rubber"] },
      preservedDetails: ["silhouette", "sole", "color blocking"],
      changedOrMissingDetails: [],
      technicalIssues: [],
      approvedStyleMatches: ["warm palette", "directional light", "soft contact shadow"],
      productSimilarity: 0.96,
      styleSimilarity: 0.91,
      confidence: 0.94,
      summary: "The source product remains intact and the approved studio treatment is matched.",
      model: "demo-vlm",
      usedFallback: false,
    };
  }
  const approvedUrls = batch.calibrationCandidates
    .filter((candidate) => candidate.decision === "approved")
    .map((candidate) => candidate.outputUrl)
    .slice(0, 4);
  const imageUrls = [asset.sourceUrl, outputUrl, ...approvedUrls];
  const prompt = `Inspect the images in this exact order:
1. Source product — identity source of truth.
2. Generated candidate to audit.
3 onward. Human-approved style examples; use them for style only, never product identity.

Compare source versus candidate for geometry, parts, logo and label text, colors, material, proportions, and completeness. Transcribe candidate text independently, character for character; mark unclear text as illegible and never fill it from the source. Distorted or nonsensical candidate lettering must appear in changedOrMissingDetails and technicalIssues. Compare the candidate against approved examples for composition, lighting, palette, background treatment, and shadow. List only visible evidence. Product and style similarity are independent 0–1 estimates.

Creative acceptance rubric: ${JSON.stringify(batch.spec?.acceptanceRubric ?? [])}
Return one JSON object with exactly these camelCase keys. Fill every value from the images; do not return a schema or empty template.
- sourceProduct: object with description string plus visibleText, colors, geometry, and materials string arrays.
- candidate: object with the same five fields, describing image 2.
- preservedDetails: string array.
- changedOrMissingDetails: string array.
- technicalIssues: string array.
- approvedStyleMatches: string array.
- productSimilarity: number from 0 to 1.
- styleSimilarity: number from 0 to 1.
- confidence: number from 0 to 1.
- summary: non-empty evidence summary string.
For similarity, 1.0 means visually identical on that dimension, 0.0 means completely unrelated, and matching the same image must score near 1. Confidence must reflect how clearly the comparison can be made.`;

  const configuredModels = [...new Set([env.FAL_VLM_MODEL, env.FAL_VLM_FALLBACK_MODEL])];
  const primaryModel = configuredModels[0]!;
  const primaryCircuitOpen = unavailablePrimary?.model === primaryModel && unavailablePrimary.until > Date.now();
  const models = primaryCircuitOpen ? configuredModels.filter((model) => model !== primaryModel) : configuredModels;
  const selected = await runWithVlmFallback(
    models.length ? models : configuredModels,
    (model) => runVisionModel(model, imageUrls, prompt),
    (model) => {
      if (model !== primaryModel || configuredModels.length < 2) return;
      unavailablePrimary = { model, until: Date.now() + VLM_CIRCUIT_OPEN_MS };
      console.warn(JSON.stringify({ event: "vlm_primary_circuit_opened", model, retryAfterMs: VLM_CIRCUIT_OPEN_MS }));
    },
  );
  return { ...selected.result, model: selected.model, usedFallback: selected.model !== primaryModel };
}
