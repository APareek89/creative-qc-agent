import { describe, expect, it, vi } from "vitest";
import { parseVlmEvidence, runWithVlmFallback } from "@/lib/providers/vlm";

const validEvidence = {
  sourceProduct: { description: "Pink tube", visibleText: ["BRAND"], colors: ["pink"], geometry: ["slender tube"], materials: ["plastic"] },
  candidate: { description: "Pink tube on stone", visibleText: ["BRAND"], colors: ["pink"], geometry: ["slender tube"], materials: ["plastic"] },
  preservedDetails: ["shape", "label"],
  changedOrMissingDetails: [],
  technicalIssues: [],
  approvedStyleMatches: ["warm light"],
  productSimilarity: 0.96,
  styleSimilarity: 0.88,
  confidence: 0.91,
  summary: "Product identity is preserved.",
};

describe("visual QC provider resilience", () => {
  it("parses fenced JSON without trusting surrounding prose", () => {
    expect(parseVlmEvidence(`\n\`\`\`json\n${JSON.stringify(validEvidence)}\n\`\`\`\n`).productSimilarity).toBe(0.96);
  });

  it("uses the paid fallback when the free model is unavailable", async () => {
    const run = vi.fn(async (model: string) => {
      if (model.includes(":free")) throw new Error("free provider unavailable");
      return validEvidence;
    });
    const result = await runWithVlmFallback(["nemotron:free", "qwen"], run);
    expect(result.model).toBe("qwen");
    expect(result.usedFallback).toBe(true);
    expect(run).toHaveBeenCalledTimes(2);
  });

  it("fails visibly when every VLM is unavailable", async () => {
    await expect(runWithVlmFallback(["nemotron:free", "qwen"], async () => {
      throw new Error("provider outage");
    })).rejects.toThrow("both primary and fallback models");
  });
});
