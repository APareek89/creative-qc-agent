import { Queue, Worker } from "bullmq";
import { env } from "../src/lib/env";
import { prepareCalibration, reconcileBatchCompletion, runAssetWorkflow, synthesizeRecipe } from "../src/lib/orchestrator/graph";
import { DLQ_NAME, QUEUE_NAME, getRedisConnection, type CreativeJob } from "../src/lib/queue";
import { getRepository } from "../src/lib/repository";

if (!env.REDIS_URL) {
  throw new Error("REDIS_URL is required to start the Creative QC worker.");
}

const connection = getRedisConnection();
const deadLetterQueue = new Queue<CreativeJob & { failure: string }>(DLQ_NAME, { connection });

const worker = new Worker<CreativeJob>(
  QUEUE_NAME,
  async (job) => {
    switch (job.data.kind) {
      case "prepare_calibration":
        await prepareCalibration(job.data.batchId);
        return;
      case "synthesize_recipe":
      case "resynthesize_recipe":
        await synthesizeRecipe(job.data.batchId);
        return;
      case "run_asset":
        await runAssetWorkflow(job.data.batchId, job.data.assetId);
        return;
    }
  },
  { connection, concurrency: env.WORKER_CONCURRENCY, lockDuration: 120_000 },
);

worker.on("completed", (job) => {
  console.info(JSON.stringify({ event: "job_completed", jobId: job.id, kind: job.data.kind }));
});

async function handleExhaustedJob(job: CreativeJob, jobId: string, error: Error): Promise<void> {
  try {
    await deadLetterQueue.add("dead_letter", { ...job, failure: error.message }, { jobId: `dlq-${jobId}` });
  } catch (deadLetterError) {
    console.error(JSON.stringify({
      event: "dead_letter_write_failed",
      jobId,
      error: deadLetterError instanceof Error ? deadLetterError.message : "Unknown dead-letter error",
    }));
  }

  if (job.kind === "run_asset") {
    const batch = await getRepository().getBatch(job.batchId);
    const asset = batch?.assets.find((item) => item.id === job.assetId);
    if (asset) {
      await getRepository().saveAsset({
        ...asset,
        status: "failed",
        failureReason: `Worker retries exhausted: ${error.message}`,
        updatedAt: new Date().toISOString(),
      });
      await reconcileBatchCompletion(job.batchId);
    }
    return;
  }

  await getRepository().setBatchStatus(job.batchId, "failed", {
    error: { provider: "worker", message: error.message, retryable: true },
  });
}

worker.on("failed", (job, error) => {
  console.error(JSON.stringify({ event: "job_failed", jobId: job?.id, kind: job?.data.kind, error: error.message }));
  if (!job || job.attemptsMade < (job.opts.attempts ?? 1)) return;
  void handleExhaustedJob(job.data, String(job.id), error).catch((handlerError) => {
    console.error(JSON.stringify({
      event: "failed_job_terminalization_failed",
      jobId: job.id,
      error: handlerError instanceof Error ? handlerError.message : "Unknown terminalization error",
    }));
  });
});

async function shutdown(signal: string) {
  console.info(JSON.stringify({ event: "worker_shutdown", signal }));
  await worker.close();
  await deadLetterQueue.close();
  await connection.quit();
  process.exit(0);
}

process.on("SIGTERM", () => void shutdown("SIGTERM"));
process.on("SIGINT", () => void shutdown("SIGINT"));

console.info(JSON.stringify({ event: "worker_started", queue: QUEUE_NAME, concurrency: env.WORKER_CONCURRENCY }));
