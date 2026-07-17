import { describe, expect, it } from "vitest";
import { z } from "zod";
import { toAnthropicJsonSchema } from "@/lib/providers/anthropic";

describe("Anthropic structured-output schema", () => {
  it("removes unsupported validation keywords while retaining shape constraints", () => {
    const schema = toAnthropicJsonSchema(z.object({
      score: z.number().min(0).max(100),
      label: z.string().min(3),
      items: z.array(z.string()).min(1),
    }));
    const serialized = JSON.stringify(schema);
    expect(serialized).not.toContain("minimum");
    expect(serialized).not.toContain("maximum");
    expect(serialized).not.toContain("minLength");
    expect(serialized).not.toContain("minItems");
    expect(serialized).toContain("score");
    expect(serialized).toContain("required");
  });
});
