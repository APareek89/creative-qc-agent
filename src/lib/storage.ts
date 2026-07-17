import { createClient } from "@supabase/supabase-js";
import { env, isDemoMode } from "@/lib/env";
import { safeFileName } from "@/lib/validation";

export interface StoredUpload {
  name: string;
  url: string;
  type: string;
}

async function assertImageSignature(file: File): Promise<void> {
  const bytes = new Uint8Array(await file.slice(0, 16).arrayBuffer());
  if (file.type.startsWith("video/")) {
    const hasIsoMediaHeader = String.fromCharCode(...bytes.slice(4, 8)) === "ftyp";
    if (!hasIsoMediaHeader) throw new Error(`${file.name} does not contain valid MP4 or MOV video data.`);
    return;
  }
  const isJpeg = bytes[0] === 0xff && bytes[1] === 0xd8 && bytes[2] === 0xff;
  const isPng = bytes[0] === 0x89 && bytes[1] === 0x50 && bytes[2] === 0x4e && bytes[3] === 0x47;
  const isWebp = String.fromCharCode(...bytes.slice(0, 4)) === "RIFF" && String.fromCharCode(...bytes.slice(8, 12)) === "WEBP";
  if (!isJpeg && !isPng && !isWebp) {
    throw new Error(`${file.name} does not contain valid JPG, PNG, or WebP image data.`);
  }
}

async function toDataUrl(file: File): Promise<string> {
  const buffer = Buffer.from(await file.arrayBuffer());
  return `data:${file.type};base64,${buffer.toString("base64")}`;
}

export async function storeUploads(batchId: string, files: File[], lane: "sources" | "references"): Promise<StoredUpload[]> {
  const results: StoredUpload[] = [];

  for (const [index, file] of files.entries()) {
    await assertImageSignature(file);
    if (isDemoMode) {
      results.push({ name: file.name, type: file.type, url: await toDataUrl(file) });
      continue;
    }

    if (!env.SUPABASE_URL || !env.SUPABASE_SERVICE_KEY) {
      throw new Error("Supabase storage is not configured.");
    }

    const supabase = createClient(env.SUPABASE_URL, env.SUPABASE_SERVICE_KEY, {
      auth: { persistSession: false, autoRefreshToken: false },
    });
    const path = `${batchId}/${lane}/${String(index + 1).padStart(2, "0")}-${safeFileName(file.name)}`;
    const { error } = await supabase.storage.from(env.SUPABASE_STORAGE_BUCKET).upload(path, await file.arrayBuffer(), {
      contentType: file.type,
      upsert: false,
      cacheControl: "31536000",
    });
    if (error) throw new Error(`Storage upload failed for ${file.name}: ${error.message}`);
    const { data } = supabase.storage.from(env.SUPABASE_STORAGE_BUCKET).getPublicUrl(path);
    results.push({ name: file.name, type: file.type, url: data.publicUrl });
  }

  return results;
}

export async function storeGeneratedImage(batchId: string, assetId: string, imageUrl: string): Promise<string> {
  if (isDemoMode || !env.SUPABASE_URL || !env.SUPABASE_SERVICE_KEY) return imageUrl;
  const parsedUrl = new URL(imageUrl);
  if (!(parsedUrl.hostname === "fal.media" || parsedUrl.hostname.endsWith(".fal.media"))) {
    throw new Error("Generated image storage refused an untrusted provider host.");
  }
  const response = await fetch(imageUrl, { signal: AbortSignal.timeout(30_000) });
  if (!response.ok) throw new Error(`Could not download generated image: HTTP ${response.status}`);
  const declaredLength = Number(response.headers.get("content-length") ?? 0);
  if (declaredLength > 25 * 1024 * 1024) throw new Error("Generated image exceeds the 25 MB storage limit.");
  const contentType = response.headers.get("content-type") ?? "image/png";
  const extension = contentType.includes("jpeg") ? "jpg" : contentType.includes("webp") ? "webp" : "png";
  const path = `${batchId}/outputs/${assetId}-${crypto.randomUUID()}.${extension}`;
  const supabase = createClient(env.SUPABASE_URL, env.SUPABASE_SERVICE_KEY, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
  const imageBytes = await response.arrayBuffer();
  if (imageBytes.byteLength > 25 * 1024 * 1024) throw new Error("Generated image exceeds the 25 MB storage limit.");
  const { error } = await supabase.storage.from(env.SUPABASE_STORAGE_BUCKET).upload(path, imageBytes, {
    contentType,
    upsert: false,
    cacheControl: "31536000",
  });
  if (error) throw new Error(`Generated image storage failed: ${error.message}`);
  return supabase.storage.from(env.SUPABASE_STORAGE_BUCKET).getPublicUrl(path).data.publicUrl;
}

export async function cleanupBatchUploads(batchId: string): Promise<void> {
  if (isDemoMode || !env.SUPABASE_URL || !env.SUPABASE_SERVICE_KEY) return;
  const supabase = createClient(env.SUPABASE_URL, env.SUPABASE_SERVICE_KEY, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
  for (const lane of ["sources", "references", "outputs"] as const) {
    const { data, error } = await supabase.storage.from(env.SUPABASE_STORAGE_BUCKET).list(`${batchId}/${lane}`, { limit: 100 });
    if (error || !data?.length) continue;
    await supabase.storage.from(env.SUPABASE_STORAGE_BUCKET).remove(data.map((item) => `${batchId}/${lane}/${item.name}`));
  }
}
