import { describe, expect, it } from "vitest";
import { isHttpsUrl, isPostgresConnectionString, isRedisConnectionString, normalizeRedisConnectionString } from "@/lib/env-normalization";

describe("Redis environment normalization", () => {
  it("accepts a direct TLS Redis URL", () => {
    expect(normalizeRedisConnectionString("rediss://default:secret@example.com:6379")).toBe(
      "rediss://default:secret@example.com:6379",
    );
  });

  it("extracts the URL when the Upstash CLI command was pasted", () => {
    expect(normalizeRedisConnectionString("redis-cli --tls -u rediss://default:secret@example.com:6379")).toBe(
      "rediss://default:secret@example.com:6379",
    );
  });

  it("preserves the CLI TLS flag when Upstash prints a redis URL", () => {
    expect(normalizeRedisConnectionString("redis-cli --tls -u redis://default:secret@example.com:6379")).toBe(
      "rediss://default:secret@example.com:6379",
    );
  });

  it("rejects REST and malformed endpoints", () => {
    expect(isRedisConnectionString("https://example.upstash.io")).toBe(false);
    expect(isRedisConnectionString("not a URL")).toBe(false);
  });
});

describe("service URL validation", () => {
  it("accepts Postgres protocols only for the database", () => {
    expect(isPostgresConnectionString("postgresql://user:secret@example.com/database")).toBe(true);
    expect(isPostgresConnectionString("https://example.com/database")).toBe(false);
  });

  it("requires HTTPS for Supabase", () => {
    expect(isHttpsUrl("https://project.supabase.co")).toBe(true);
    expect(isHttpsUrl("http://project.supabase.co")).toBe(false);
  });
});
