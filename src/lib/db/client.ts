import { drizzle } from "drizzle-orm/postgres-js";
import postgres from "postgres";
import { env } from "@/lib/env";
import * as schema from "@/lib/db/schema";

let database: ReturnType<typeof drizzle<typeof schema>> | undefined;

export function getDatabase(): ReturnType<typeof drizzle<typeof schema>> {
  if (!env.DATABASE_URL) {
    throw new Error("DATABASE_URL is required when demo mode is disabled.");
  }

  if (!database) {
    const hostname = new URL(env.DATABASE_URL).hostname;
    const ssl = ["localhost", "127.0.0.1", "::1"].includes(hostname) ? false : "require";
    const client = postgres(env.DATABASE_URL, {
      max: env.NODE_ENV === "production" ? 10 : 2,
      prepare: false,
      idle_timeout: 20,
      ssl,
    });
    database = drizzle(client, { schema });
  }

  return database;
}
