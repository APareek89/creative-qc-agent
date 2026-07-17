import { describe, expect, it } from "vitest";
import { batchCreateSchema, safeFileName, validateOutputCount, validateUploads } from "@/lib/validation";

describe("batch input guardrails", () => {
  it("counts ratios and variants while enforcing the Phase 0 output ceiling", () => {
    expect(validateOutputCount(20, 2, 4)).toBe(160);
    expect(() => validateOutputCount(50, 3, 4)).toThrow(/600 outputs/);
  });
  it("accepts the Phase 0 batch shape", () => {
    const value = batchCreateSchema.parse({
      name: "Autumn campaign",
      prompt: "Preserve every product and use warm editorial studio light.",
      assetType: "sku_lifestyle",
      aspectRatios: ["4:5", "1:1"],
      variantsPerAsset: 1,
      costCap: 5,
    });
    expect(value.costCap).toBe(5);
  });

  it("blocks more than 50 sources before storage", () => {
    const files = Array.from({ length: 51 }, (_, index) => new File(["image"], `asset-${index}.png`, { type: "image/png" }));
    expect(() => validateUploads(files, [])).toThrow("between 1 and 50");
  });

  it("caps aggregate upload data after multipart parsing", () => {
    const oversized = { name: "large.png", type: "image/png", size: 201 * 1024 * 1024 } as File;
    expect(() => validateUploads([oversized], [])).toThrow("combined upload");
  });

  it("sanitizes file names used in object-storage paths", () => {
    expect(safeFileName("../../My product (final)!!.png")).toBe("My-product-final-.png");
  });
});
