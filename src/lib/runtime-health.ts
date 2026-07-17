import { fal } from "@fal-ai/client";
import { createClient } from "@supabase/supabase-js";
import { sql } from "drizzle-orm";
import { env, isDemoMode } from "@/lib/env";
import { getDatabase } from "@/lib/db/client";
import { getRedisConnection } from "@/lib/queue";
import { isRuntimeHealthy, type RuntimeHealth } from "@/lib/types";

type DependencyStatus = "ok" | "missing" | "error";

const LIVE_HEALTH_CACHE_MS = 30_000;
let cachedLiveHealth: { value: RuntimeHealth; expiresAt: number } | undefined;

async function within<T>(work: Promise<T>, milliseconds = 8_000): Promise<T> {
  return Promise.race([
    work,
    new Promise<never>((_, reject) => setTimeout(() => reject(new Error("Dependency check timed out.")), milliseconds)),
  ]);
}

async function checkDatabase(): Promise<DependencyStatus> {
  if (!env.DATABASE_URL) return "missing";
  try {
    await within(getDatabase().execute(sql`select 1`));
    return "ok";
  } catch {
    return "error";
  }
}

async function checkRedis(): Promise<DependencyStatus> {
  if (!env.REDIS_URL) return "missing";
  try {
    return await within(getRedisConnection().ping()) === "PONG" ? "ok" : "error";
  } catch {
    return "error";
  }
}

async function checkStorage(): Promise<DependencyStatus> {
  if (!env.SUPABASE_URL || !env.SUPABASE_SERVICE_KEY) return "missing";
  try {
    const client = createClient(env.SUPABASE_URL, env.SUPABASE_SERVICE_KEY, {
      auth: { persistSession: false, autoRefreshToken: false },
    });
    const { data, error } = await within(client.storage.getBucket(env.SUPABASE_STORAGE_BUCKET));
    return data && !error && data.public ? "ok" : "error";
  } catch {
    return "error";
  }
}

async function checkAnthropic(): Promise<DependencyStatus> {
  if (!env.ANTHROPIC_API_KEY) return "missing";
  try {
    const response = await within(fetch(
      `https://api.anthropic.com/v1/models/${encodeURIComponent(env.ANTHROPIC_MODEL)}`,
      {
        method: "GET",
        headers: {
          "anthropic-version": "2023-06-01",
          "x-api-key": env.ANTHROPIC_API_KEY,
        },
        signal: AbortSignal.timeout(8_000),
      },
    ));
    return response.ok ? "ok" : "error";
  } catch {
    return "error";
  }
}

async function checkFalEndpoint(endpoint: string): Promise<DependencyStatus> {
  if (!env.FAL_KEY) return "missing";
  fal.config({ credentials: env.FAL_KEY });
  try {
    await within(fal.queue.status(endpoint, {
      requestId: `preflight-${crypto.randomUUID()}`,
      logs: false,
    }));
    return "ok";
  } catch (error) {
    const candidate = error as { status?: number; statusCode?: number; response?: { status?: number }; message?: string };
    const status = candidate.status ?? candidate.statusCode ?? candidate.response?.status;
    const message = candidate.message?.toLowerCase() ?? "";
    return status === 404 || message.includes("not found") || message.includes("no request") ? "ok" : "error";
  }
}

export async function checkRuntimeHealth(forceDependencies = false): Promise<RuntimeHealth> {
  if (isDemoMode && !forceDependencies) {
    return {
      mode: "demo",
      web: "ok",
      database: env.DATABASE_URL ? "ok" : "missing",
      redis: env.REDIS_URL ? "ok" : "missing",
      storage: env.SUPABASE_URL && env.SUPABASE_SERVICE_KEY ? "ok" : "missing",
      anthropic: env.ANTHROPIC_API_KEY ? "ok" : "missing",
      vlm: env.FAL_KEY ? "ok" : "missing",
      fal: env.FAL_KEY ? "ok" : "missing",
    };
  }

  if (!forceDependencies && cachedLiveHealth && cachedLiveHealth.expiresAt > Date.now()) {
    return cachedLiveHealth.value;
  }

  const [database, redis, storage, anthropic, vlm, falStatus] = await Promise.all([
    checkDatabase(),
    checkRedis(),
    checkStorage(),
    checkAnthropic(),
    checkFalEndpoint("openrouter/router/vision"),
    checkFalEndpoint(env.FAL_GENERATION_MODEL),
  ]);
  const result: RuntimeHealth = { mode: "live", web: "ok", database, redis, storage, anthropic, vlm, fal: falStatus };
  cachedLiveHealth = { value: result, expiresAt: Date.now() + LIVE_HEALTH_CACHE_MS };
  return result;
}

export async function assertLiveRuntimeReady(): Promise<void> {
  const health = await checkRuntimeHealth(true);
  if (isRuntimeHealthy(health)) return;
  const failed = Object.entries(health)
    .filter(([name, status]) => !["mode", "web"].includes(name) && status !== "ok")
    .map(([name, status]) => `${name}=${status}`)
    .join(", ");
  throw new Error(`Live dependencies are not ready: ${failed}. Resolve provider access before starting paid work.`);
}
