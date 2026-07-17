import { NextResponse } from "next/server";
import { apiError } from "@/lib/api";
import { env, isDemoMode } from "@/lib/env";
import { enqueueJob } from "@/lib/queue";
import { enforceBatchCreationRateLimit } from "@/lib/rate-limit";
import { getRepository } from "@/lib/repository";
import { assertLiveRuntimeReady } from "@/lib/runtime-health";
import { cleanupBatchUploads, storeUploads } from "@/lib/storage";
import { batchCreateSchema, validateOutputCount, validateUploads } from "@/lib/validation";

export const dynamic = "force-dynamic";
const MAX_MULTIPART_BODY_BYTES = 205 * 1024 * 1024;

export async function GET() {
  try {
    return NextResponse.json(await getRepository().dashboard());
  } catch (error) {
    return apiError(error, "Could not load batches.");
  }
}

export async function POST(request: Request) {
  const batchId = crypto.randomUUID();
  try {
    await enforceBatchCreationRateLimit(request);
    if (!isDemoMode) await assertLiveRuntimeReady();
    const contentLength = Number(request.headers.get("content-length") ?? 0);
    if (Number.isFinite(contentLength) && contentLength > MAX_MULTIPART_BODY_BYTES) {
      throw new Error("The upload request is larger than the 205 MB transport limit.");
    }
    const form = await request.formData();
    const rawData = form.get("data");
    if (typeof rawData !== "string") throw new Error("Batch settings are required.");
    const input = batchCreateSchema.parse(JSON.parse(rawData));
    if (input.costCap > env.COST_CAP_USD_PER_BATCH) {
      throw new Error(`Batch cost cap cannot exceed the server maximum of $${env.COST_CAP_USD_PER_BATCH.toFixed(2)}.`);
    }
    const sourceFiles = form.getAll("sources").filter((item): item is File => item instanceof File);
    const referenceFiles = form.getAll("references").filter((item): item is File => item instanceof File);
    validateUploads(sourceFiles, referenceFiles);
    validateOutputCount(sourceFiles.length, input.aspectRatios.length, input.variantsPerAsset);
    const uploadResults = await Promise.allSettled([
      storeUploads(batchId, sourceFiles, "sources"),
      storeUploads(batchId, referenceFiles, "references"),
    ]);
    const failedUpload = uploadResults.find((result): result is PromiseRejectedResult => result.status === "rejected");
    if (failedUpload) throw failedUpload.reason;
    const storedSources = (uploadResults[0] as PromiseFulfilledResult<Awaited<ReturnType<typeof storeUploads>>>).value;
    const storedReferences = (uploadResults[1] as PromiseFulfilledResult<Awaited<ReturnType<typeof storeUploads>>>).value;
    const batch = await getRepository().createBatch(batchId, input, storedSources, storedReferences);
    if (!isDemoMode) await enqueueJob({ kind: "prepare_calibration", batchId }, `calibration-${batchId}`);
    return NextResponse.json(batch, { status: 201 });
  } catch (error) {
    await Promise.allSettled([
      cleanupBatchUploads(batchId),
      getRepository().deleteBatch(batchId),
    ]);
    return apiError(error, "Could not create the batch.");
  }
}
