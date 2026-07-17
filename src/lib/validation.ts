import { z } from "zod";

export const batchCreateSchema = z.object({
  name: z.string().trim().min(3).max(80),
  prompt: z.string().trim().min(12).max(3000),
  assetType: z.enum(["multi_view", "sku_lifestyle"]),
  aspectRatios: z.array(z.enum(["1:1", "4:5", "3:4", "16:9", "9:16"])).min(1).max(3),
  variantsPerAsset: z.coerce.number().int().min(1).max(4),
  costCap: z.coerce.number().min(0.25).max(100),
});

export const approvalSchema = z.object({
  candidateId: z.string().min(1),
  decision: z.enum(["approved", "rejected"]),
  note: z.string().trim().max(500).optional(),
});

export const batchActionSchema = z.discriminatedUnion("action", [
  z.object({ action: z.literal("run") }),
  z.object({ action: z.literal("retry_calibration") }),
  z.object({ action: z.literal("resynthesize") }),
  z.object({ action: z.literal("retry_failed") }),
  z.object({ action: z.literal("approve_asset"), assetId: z.string().min(1) }),
  z.object({ action: z.literal("regenerate_asset"), assetId: z.string().min(1), prompt: z.string().trim().max(3000).optional() }),
  z.object({ action: z.literal("update_prompt"), promptId: z.string().min(1), prompt: z.string().trim().min(12).max(3000) }),
]);

const allowedImageTypes = new Set(["image/jpeg", "image/png", "image/webp"]);
export const MAX_OUTPUT_ASSETS = 200;

export function validateOutputCount(sourceCount: number, aspectRatioCount: number, variantsPerAsset: number): number {
  const count = sourceCount * aspectRatioCount * variantsPerAsset;
  if (count > MAX_OUTPUT_ASSETS) {
    throw new Error(`This setup requests ${count} outputs; the Phase 0 limit is ${MAX_OUTPUT_ASSETS}. Reduce sources, ratios, or variants.`);
  }
  return count;
}

export function validateUploads(sources: File[], references: File[]): void {
  if (sources.length < 1 || sources.length > 50) {
    throw new Error("Add between 1 and 50 source images.");
  }
  if (references.length > 10) {
    throw new Error("Reference look uploads are limited to 10 files.");
  }
  const totalBytes = [...sources, ...references].reduce((sum, file) => sum + file.size, 0);
  if (totalBytes > 200 * 1024 * 1024) {
    throw new Error("The combined upload is larger than the 200 MB batch limit.");
  }

  for (const file of sources) {
    if (!allowedImageTypes.has(file.type)) {
      throw new Error(`${file.name} is not a supported source image. Use JPG, PNG, or WebP.`);
    }
    if (file.size > 10 * 1024 * 1024) {
      throw new Error(`${file.name} is larger than the 10 MB upload limit.`);
    }
  }

  for (const file of references) {
    if (!allowedImageTypes.has(file.type)) {
      throw new Error(`${file.name} is not a supported reference image. Phase 0 accepts JPG, PNG, or WebP.`);
    }
    if (file.size > 10 * 1024 * 1024) {
      throw new Error(`${file.name} is larger than the 10 MB reference limit.`);
    }
  }
}

export function safeFileName(value: string): string {
  return value
    .normalize("NFKD")
    .replace(/[^a-zA-Z0-9._-]+/g, "-")
    .replace(/-{2,}/g, "-")
    .replace(/^[-.]+|[-.]+$/g, "")
    .slice(0, 100) || "asset";
}
