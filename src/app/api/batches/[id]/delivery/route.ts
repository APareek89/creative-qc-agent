import { readFile } from "node:fs/promises";
import path from "node:path";
import JSZip from "jszip";
import { apiError } from "@/lib/api";
import { env } from "@/lib/env";
import { getRepository } from "@/lib/repository";

const MAX_DELIVERY_IMAGE_BYTES = 25 * 1024 * 1024;
const MAX_DELIVERY_TOTAL_BYTES = 250 * 1024 * 1024;

function assertDeliverySize(size: number): void {
  if (size > MAX_DELIVERY_IMAGE_BYTES) throw new Error("A delivery image exceeds the 25 MB archive limit.");
}

function csvCell(value: string | number): string {
  const raw = String(value);
  const formulaSafe = /^[=+\-@]/.test(raw) ? `'${raw}` : raw;
  return `"${formulaSafe.replaceAll('"', '""')}"`;
}

function extensionFor(type: string | null): string {
  if (type?.includes("svg")) return "svg";
  if (type?.includes("jpeg")) return "jpg";
  if (type?.includes("webp")) return "webp";
  return "png";
}

async function imageBytes(url: string): Promise<{ bytes: Uint8Array; type: string | null }> {
  if (url.startsWith("data:")) {
    const match = /^data:([^;]+);base64,(.+)$/.exec(url);
    if (!match?.[1] || !match[2]) throw new Error("Invalid inline delivery image.");
    const bytes = Buffer.from(match[2], "base64");
    assertDeliverySize(bytes.byteLength);
    return { bytes, type: match[1] };
  }
  if (url.startsWith("/demo/")) {
    const safePath = path.resolve(process.cwd(), "public", url.slice(1));
    const demoRoot = path.resolve(process.cwd(), "public", "demo");
    if (!safePath.startsWith(`${demoRoot}${path.sep}`)) throw new Error("Unsafe demo asset path.");
    const bytes = await readFile(safePath);
    assertDeliverySize(bytes.byteLength);
    return { bytes, type: "image/svg+xml" };
  }
  const parsed = new URL(url);
  const allowedHosts = new Set<string>(["fal.media"]);
  if (env.SUPABASE_URL) allowedHosts.add(new URL(env.SUPABASE_URL).hostname);
  if (![...allowedHosts].some((host) => parsed.hostname === host || parsed.hostname.endsWith(`.${host}`))) {
    throw new Error("Delivery refused an image from an untrusted host.");
  }
  const response = await fetch(parsed, { signal: AbortSignal.timeout(30_000) });
  if (!response.ok) throw new Error(`Delivery image fetch failed with HTTP ${response.status}.`);
  const declaredLength = Number(response.headers.get("content-length") ?? 0);
  assertDeliverySize(declaredLength);
  const bytes = new Uint8Array(await response.arrayBuffer());
  assertDeliverySize(bytes.byteLength);
  return { bytes, type: response.headers.get("content-type") };
}

export async function GET(_: Request, context: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await context.params;
    const batch = await getRepository().getBatch(id);
    if (!batch) throw new Error("Batch not found.");
    if (batch.status !== "done") throw new Error("Delivery is available only after the batch finishes.");
    const deliverable = batch.assets.filter((asset) => asset.outputUrl && ["passed", "approved", "delivered"].includes(asset.status));
    if (!deliverable.length) throw new Error("No passed assets are ready for delivery.");
    const zip = new JSZip();
    const folder = zip.folder("assets");
    if (!folder) throw new Error("Could not initialize the delivery archive.");
    let totalBytes = 0;
    for (const asset of deliverable) {
      const file = await imageBytes(asset.outputUrl!);
      totalBytes += file.bytes.byteLength;
      if (totalBytes > MAX_DELIVERY_TOTAL_BYTES) throw new Error("Delivery assets exceed the 250 MB archive limit.");
      folder.file(`${asset.sku}-${asset.name.replace(/[^a-z0-9]+/gi, "-").toLowerCase()}.${extensionFor(file.type)}`, file.bytes);
    }
    zip.file("manifest.json", JSON.stringify({ batch: { id: batch.id, name: batch.name }, assets: deliverable }, null, 2));
    zip.file("cdn-links.csv", `sku,name,url,qc_score,similarity\n${deliverable.map((asset) => [asset.sku, asset.name, asset.outputUrl!, asset.qcScore ?? "", asset.similarity ?? ""].map(csvCell).join(",")).join("\n")}`);
    const archive = await zip.generateAsync({ type: "uint8array", compression: "DEFLATE", compressionOptions: { level: 6 } });
    await getRepository().markDelivered(batch.id, deliverable.map((asset) => asset.id));
    const body = new Uint8Array(archive.byteLength);
    body.set(archive);
    return new Response(body.buffer, {
      headers: {
        "content-type": "application/zip",
        "content-disposition": `attachment; filename="${batch.name.replace(/[^a-z0-9]+/gi, "-").toLowerCase()}-delivery.zip"`,
        "cache-control": "no-store",
      },
    });
  } catch (error) {
    return apiError(error, "Could not build the delivery archive.");
  }
}
