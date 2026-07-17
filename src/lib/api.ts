import { NextResponse } from "next/server";
import { ZodError } from "zod";

export function apiError(error: unknown, fallback = "The request could not be completed."): NextResponse {
  if (error instanceof ZodError) {
    return NextResponse.json(
      { error: "Validation failed.", details: error.issues.map((issue) => ({ path: issue.path.join("."), message: issue.message })) },
      { status: 400 },
    );
  }
  const message = error instanceof Error ? error.message : fallback;
  const status = /rate limit/i.test(message)
    ? 429
    : /dependencies are not ready|provider access|temporarily unavailable/i.test(message)
      ? 503
    : /not found/i.test(message)
    ? 404
    : /already running|current run|only after|wait for/i.test(message)
      ? 409
      : /required|invalid|limit|between|supported|larger|missing|no failed|no passed|only failed|can be manually|attempt cap|cost cap|remaining attempt/i.test(message)
        ? 400
        : 500;
  if (status >= 500) console.error(JSON.stringify({ event: "api_error", message }));
  return NextResponse.json({ error: message || fallback }, { status });
}
