import { createHash } from "node:crypto";
import { env, isDemoMode } from "@/lib/env";
import { getRedisConnection } from "@/lib/queue";

export async function enforceBatchCreationRateLimit(request: Request): Promise<void> {
  if (isDemoMode) return;
  const forwarded = request.headers.get("x-forwarded-for")?.split(",")[0]?.trim();
  const identity = forwarded || request.headers.get("x-real-ip") || "unknown";
  const fingerprint = createHash("sha256").update(identity).digest("hex").slice(0, 24);
  const key = `rate:batch-create:${fingerprint}`;
  const count = await getRedisConnection().eval(
    "local n=redis.call('INCR',KEYS[1]); if n==1 then redis.call('EXPIRE',KEYS[1],ARGV[1]); end; return n",
    1,
    key,
    3600,
  );
  if (Number(count) > env.BATCH_CREATION_LIMIT_PER_HOUR) {
    throw new Error(`Batch creation rate limit reached. Try again after the hourly window resets.`);
  }
}
