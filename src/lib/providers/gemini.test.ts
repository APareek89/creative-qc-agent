import { describe, expect, it } from "vitest";
import { cosineSimilarity } from "@/lib/providers/gemini";

describe("multimodal similarity math", () => {
  it("returns one for identical normalized directions", () => {
    expect(cosineSimilarity([1, 2, 3], [2, 4, 6])).toBeCloseTo(1, 8);
  });

  it("returns zero for orthogonal vectors", () => {
    expect(cosineSimilarity([1, 0], [0, 1])).toBe(0);
  });

  it("rejects incompatible embeddings instead of returning a misleading score", () => {
    expect(() => cosineSimilarity([1], [1, 2])).toThrow("same size");
  });
});
