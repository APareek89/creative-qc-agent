import { fal } from "@fal-ai/client";
import { z } from "zod";
import { demoImageSources } from "@/lib/demo-data";
import { env, isDemoMode } from "@/lib/env";

const falResponseSchema = z.object({
  data: z.object({
    images: z.array(z.object({ url: z.string().url() })).min(1),
  }),
  requestId: z.string().optional(),
});

export interface GenerateImageInput {
  sourceUrl: string;
  referenceUrls: string[];
  aspectRatio: string;
  prompt: string;
  negativePrompt: string;
  correctionFeedback?: string;
  params: Record<string, string | number | boolean>;
  attemptNumber: number;
}

export interface GenerateImageResult {
  url: string;
  requestId?: string;
  estimatedCost: number;
}

export const GENERATION_COST_ESTIMATE_USD = env.GENERATION_COST_ESTIMATE_USD;

export function estimateGenerationCost(referenceCount: number): number {
  const inputImages = 1 + Math.min(3, Math.max(0, Math.floor(referenceCount)));
  const oneMegapixelLaneCost = GENERATION_COST_ESTIMATE_USD / 2;
  return Math.round(oneMegapixelLaneCost * (inputImages + 1) * 1_000_000) / 1_000_000;
}

export function buildReferenceAwarePrompt(prompt: string, referenceCount: number, correctionFeedback?: string): string {
  const styleInstruction = referenceCount > 0
    ? ` Images 2 through ${Math.min(4, referenceCount + 1)} are style references only; never copy or substitute their product.`
    : "";
  const correction = correctionFeedback ? `\nQC correction from the previous attempt: ${correctionFeedback}` : "";
  return `Image 1 is the source product and the identity source of truth. Preserve its exact category, geometry, packaging, logo, label text, colors, material, proportions, and included parts. Do not replace it with another object.${styleInstruction}\nCreative direction: ${prompt}${correction}`;
}

export function imageSizeForAspectRatio(aspectRatio: string): string | { width: number; height: number } {
  switch (aspectRatio) {
    case "1:1": return "square_hd";
    case "4:5": return { width: 800, height: 1000 };
    case "3:4": return { width: 768, height: 1024 };
    case "16:9": return { width: 1024, height: 576 };
    case "9:16": return { width: 576, height: 1024 };
    default: return "square_hd";
  }
}

export async function generateImage(input: GenerateImageInput): Promise<GenerateImageResult> {
  const estimatedCost = estimateGenerationCost(input.referenceUrls.length);
  if (isDemoMode) {
    await new Promise((resolve) => setTimeout(resolve, 120));
    return {
      url: demoImageSources.outputs[(input.attemptNumber - 1) % demoImageSources.outputs.length]!,
      requestId: `demo_fal_${crypto.randomUUID()}`,
      estimatedCost,
    };
  }
  if (!env.FAL_KEY) throw new Error("FAL_KEY is required for live image generation.");
  fal.config({ credentials: env.FAL_KEY });
  const prompt = buildReferenceAwarePrompt(input.prompt, input.referenceUrls.length, input.correctionFeedback);
  const raw = await fal.subscribe(env.FAL_GENERATION_MODEL, {
    abortSignal: AbortSignal.timeout(env.PROVIDER_TIMEOUT_MS),
    startTimeout: Math.ceil(env.PROVIDER_TIMEOUT_MS / 1000),
    input: {
      prompt,
      negative_prompt: input.negativePrompt,
      image_urls: [input.sourceUrl, ...input.referenceUrls].slice(0, 4),
      guidance_scale: typeof input.params.guidance_scale === "number" ? input.params.guidance_scale : 5,
      num_inference_steps: typeof input.params.num_inference_steps === "number" ? input.params.num_inference_steps : 28,
      image_size: imageSizeForAspectRatio(input.aspectRatio),
      output_format: "png",
      enable_safety_checker: true,
      num_images: 1,
    },
    logs: false,
  });
  const result = falResponseSchema.parse(raw);
  return {
    url: result.data.images[0]!.url,
    requestId: result.requestId,
    estimatedCost,
  };
}
