import { z } from "zod";
import { isHttpsUrl, isPostgresConnectionString, isRedisConnectionString, normalizeRedisConnectionString } from "@/lib/env-normalization";

const optionalString = z.preprocess(
  (value) => (typeof value === "string" && value.trim() === "" ? undefined : value),
  z.string().optional(),
);

const optionalRedisConnectionString = z.preprocess(
  normalizeRedisConnectionString,
  z.string().refine(isRedisConnectionString, "REDIS_URL must contain a redis:// or rediss:// connection URL.").optional(),
);

const optionalDatabaseConnectionString = z.preprocess(
  (value) => (typeof value === "string" && value.trim() === "" ? undefined : value),
  z.string().refine(isPostgresConnectionString, "DATABASE_URL must use the postgres:// or postgresql:// protocol.").optional(),
);

const optionalHttpsUrl = z.preprocess(
  (value) => (typeof value === "string" && value.trim() === "" ? undefined : value),
  z.string().refine(isHttpsUrl, "SUPABASE_URL must be a valid HTTPS URL.").optional(),
);

const envSchema = z.object({
  NODE_ENV: z.enum(["development", "test", "production"]).default("development"),
  DEMO_MODE: z.enum(["true", "false"]).optional(),
  GEMINI_API_KEY: optionalString,
  GEMINI_AGENT_MODEL: z.string().default("gemini-3.5-flash"),
  GEMINI_EMBEDDING_MODEL: z.string().default("gemini-embedding-2"),
  FAL_KEY: optionalString,
  FAL_GENERATION_MODEL: z.string().default("fal-ai/flux-2/klein/4b/base/edit"),
  GENERATION_COST_ESTIMATE_USD: z.coerce.number().positive().max(10).default(0.018),
  DATABASE_URL: optionalDatabaseConnectionString,
  REDIS_URL: optionalRedisConnectionString,
  SUPABASE_URL: optionalHttpsUrl,
  SUPABASE_SERVICE_KEY: optionalString,
  SUPABASE_STORAGE_BUCKET: z.string().default("creative-qc"),
  NEXT_PUBLIC_APP_URL: z.string().url().default("http://localhost:3000"),
  COST_CAP_USD_PER_BATCH: z.coerce.number().positive().default(5),
  COST_CAP_USD_PER_ASSET: z.coerce.number().positive().default(0.5),
  MAX_ATTEMPTS_PER_ASSET: z.coerce.number().int().min(1).max(12).default(5),
  FEEDBACK_RETRIES: z.coerce.number().int().min(0).max(5).default(2),
  QC_PASS_SCORE: z.coerce.number().min(0).max(100).default(80),
  WORKER_CONCURRENCY: z.coerce.number().int().min(1).max(24).default(4),
  BATCH_CREATION_LIMIT_PER_HOUR: z.coerce.number().int().min(1).max(100).default(5),
  PROVIDER_TIMEOUT_MS: z.coerce.number().int().min(10_000).max(600_000).default(180_000),
  LOG_LEVEL: z.enum(["debug", "info", "warn", "error"]).default("info"),
});

const parsed = envSchema.safeParse(process.env);

if (!parsed.success) {
  throw new Error(`Invalid environment configuration: ${parsed.error.message}`);
}

export const env = parsed.data;

const liveConfiguration = [
  env.GEMINI_API_KEY,
  env.FAL_KEY,
  env.DATABASE_URL,
  env.REDIS_URL,
  env.SUPABASE_URL,
  env.SUPABASE_SERVICE_KEY,
];

export const isDemoMode =
  env.DEMO_MODE === "true" ||
  (env.DEMO_MODE !== "false" && !liveConfiguration.every(Boolean));

export function assertLiveEnvironment(): void {
  const missing = [
    ["GEMINI_API_KEY", env.GEMINI_API_KEY],
    ["FAL_KEY", env.FAL_KEY],
    ["DATABASE_URL", env.DATABASE_URL],
    ["REDIS_URL", env.REDIS_URL],
    ["SUPABASE_URL", env.SUPABASE_URL],
    ["SUPABASE_SERVICE_KEY", env.SUPABASE_SERVICE_KEY],
  ]
    .filter(([, value]) => !value)
    .map(([key]) => key);

  if (missing.length > 0) {
    throw new Error(`Live mode is missing required environment variables: ${missing.join(", ")}`);
  }
}

if (!isDemoMode) assertLiveEnvironment();
