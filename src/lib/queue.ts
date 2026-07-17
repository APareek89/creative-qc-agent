import { Queue } from "bullmq";
import IORedis from "ioredis";
import { env, isDemoMode } from "@/lib/env";

export type CreativeJob =
  | { kind: "prepare_calibration"; batchId: string }
  | { kind: "synthesize_recipe"; batchId: string }
  | { kind: "run_asset"; batchId: string; assetId: string }
  | { kind: "resynthesize_recipe"; batchId: string };

export const QUEUE_NAME = "creative-qc";
export const DLQ_NAME = "creative-qc-dlq";

let connection: IORedis | undefined;
let queue: Queue<CreativeJob> | undefined;
let lastRedisErrorAt = 0;

export function getRedisConnection(): IORedis {
  if (!env.REDIS_URL) throw new Error("REDIS_URL is required for live queue execution.");
  if (!connection) {
    connection = new IORedis(env.REDIS_URL, { maxRetriesPerRequest: null, enableReadyCheck: true });
    connection.on("error", (error) => {
      const now = Date.now();
      if (now - lastRedisErrorAt < 30_000) return;
      lastRedisErrorAt = now;
      console.error(JSON.stringify({ event: "redis_connection_error", message: error.message }));
    });
  }
  return connection;
}

export function getCreativeQueue(): Queue<CreativeJob> {
  if (isDemoMode) throw new Error("The live queue is disabled in demo mode.");
  if (!queue) {
    queue = new Queue<CreativeJob>(QUEUE_NAME, {
      connection: getRedisConnection(),
      defaultJobOptions: {
        attempts: 3,
        backoff: { type: "exponential", delay: 2_000 },
        removeOnComplete: { age: 86_400, count: 2_000 },
        removeOnFail: false,
      },
    });
  }
  return queue;
}

export async function enqueueJob(job: CreativeJob, jobId: string): Promise<void> {
  if (isDemoMode) return;
  await getCreativeQueue().add(job.kind, job, { jobId });
}

export async function enqueueBatchAssets(batchId: string, assetIds: string[], runToken = crypto.randomUUID()): Promise<void> {
  if (isDemoMode) return;
  const jobs = assetIds.map((assetId) => ({
    name: "run_asset",
    data: { kind: "run_asset", batchId, assetId } as CreativeJob,
    opts: { jobId: `asset-${assetId}-${runToken}` },
  }));
  await getCreativeQueue().addBulk(jobs);
}
