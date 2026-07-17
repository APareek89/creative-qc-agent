import { readFile } from "node:fs/promises";
import path from "node:path";
import postgres from "postgres";
import { loadLocalEnvironment } from "./load-local-env";

async function main(): Promise<void> {
  loadLocalEnvironment();
  const databaseUrl = process.env.DATABASE_URL;
  if (!databaseUrl) throw new Error("DATABASE_URL is required to run migrations.");

  const hostname = new URL(databaseUrl).hostname;
  const ssl = ["localhost", "127.0.0.1", "::1"].includes(hostname) ? false : "require";
  const sql = postgres(databaseUrl, { max: 1, prepare: false, ssl });
  try {
    const migration = await readFile(path.join(process.cwd(), "drizzle", "0000_phase0.sql"), "utf8");
    await sql.unsafe(migration);
    console.info("Phase 0 database migration complete.");
  } finally {
    await sql.end();
  }
}

void main();
