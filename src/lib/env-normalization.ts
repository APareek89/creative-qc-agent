export function normalizeRedisConnectionString(value: unknown): unknown {
  if (typeof value !== "string") return value;
  const trimmed = value.trim();
  if (!trimmed) return undefined;
  const embeddedUrl = trimmed.match(/(?:^|\s)(rediss?:\/\/[^\s'";]+)/i)?.[1];
  if (embeddedUrl && /(?:^|\s)--tls(?:\s|$)/.test(trimmed) && embeddedUrl.startsWith("redis://")) {
    return `rediss://${embeddedUrl.slice("redis://".length)}`;
  }
  return embeddedUrl ?? trimmed;
}

export function isRedisConnectionString(value: string): boolean {
  try {
    return ["redis:", "rediss:"].includes(new URL(value).protocol);
  } catch {
    return false;
  }
}

export function isPostgresConnectionString(value: string): boolean {
  try {
    return ["postgres:", "postgresql:"].includes(new URL(value).protocol);
  } catch {
    return false;
  }
}

export function isHttpsUrl(value: string): boolean {
  try {
    return new URL(value).protocol === "https:";
  } catch {
    return false;
  }
}
