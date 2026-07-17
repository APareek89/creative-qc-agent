import { describe, expect, it } from "vitest";
import { buildReferenceAwarePrompt, estimateGenerationCost, imageSizeForAspectRatio } from "@/lib/providers/fal";

describe("fal generation cost reservation", () => {
  it("prices one source plus one output at the configured base estimate", () => {
    expect(estimateGenerationCost(0)).toBe(0.018);
  });

  it("adds one megapixel lane for every style reference sent", () => {
    expect(estimateGenerationCost(1)).toBe(0.027);
    expect(estimateGenerationCost(3)).toBe(0.045);
  });

  it("caps pricing at the provider request's three-reference limit", () => {
    expect(estimateGenerationCost(10)).toBe(0.045);
  });
});

describe("fal source conditioning", () => {
  it("makes the source-product/reference roles explicit", () => {
    const prompt = buildReferenceAwarePrompt("Place it in a warm studio.", 2, "Keep the label sharp.");
    expect(prompt).toContain("Image 1 is the source product");
    expect(prompt).toContain("Images 2 through 3 are style references only");
    expect(prompt).toContain("never copy or substitute their product");
    expect(prompt).toContain("QC correction from the previous attempt");
  });
});

describe("fal output dimensions", () => {
  it("maps every supported product ratio to exact generation dimensions", () => {
    expect(imageSizeForAspectRatio("1:1")).toBe("square_hd");
    expect(imageSizeForAspectRatio("4:5")).toEqual({ width: 800, height: 1000 });
    expect(imageSizeForAspectRatio("3:4")).toEqual({ width: 768, height: 1024 });
    expect(imageSizeForAspectRatio("16:9")).toEqual({ width: 1024, height: 576 });
    expect(imageSizeForAspectRatio("9:16")).toEqual({ width: 576, height: 1024 });
  });
});
