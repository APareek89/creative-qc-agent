import { describe, expect, it } from "vitest";
import { z } from "zod";
import { normalizeQcJudgmentScale, toAnthropicJsonSchema } from "@/lib/providers/anthropic";

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

describe("Anthropic QC score normalization", () => {
  it("converts a complete 0–1 score vector to the application's 0–100 contract", () => {
    const judgment = normalizeQcJudgmentScale({
      scores: {
        productFidelity: 0.98,
        composition: 0.95,
        lighting: 0.9,
        brandStyle: 0.85,
        technicalQuality: 1,
      },
      feedback: "The product and scene satisfy the supplied evidence.",
      corrections: [],
      confidence: 0.9,
    });

    expect(judgment.scores).toEqual({
      productFidelity: 98,
      composition: 95,
      lighting: 90,
      brandStyle: 85,
      technicalQuality: 100,
    });
    expect(judgment.confidence).toBe(0.9);
  });

  it("leaves an existing 0–100 score vector unchanged", () => {
    const judgment = {
      scores: {
        productFidelity: 98,
        composition: 95,
        lighting: 90,
        brandStyle: 85,
        technicalQuality: 100,
      },
      feedback: "The product and scene satisfy the supplied evidence.",
      corrections: [],
      confidence: 0.9,
    };

    expect(normalizeQcJudgmentScale(judgment)).toBe(judgment);
  });
});
