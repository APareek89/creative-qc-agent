import { describe, expect, it } from "vitest";
import { createDemoBatch } from "@/lib/demo-data";
import { getBatchCounts, isTerminalStatus } from "@/lib/types";

describe("batch status projection", () => {
  it("counts every asset exactly once", () => {
    const batch = createDemoBatch();
    const counts = getBatchCounts(batch);
    expect(Object.values(counts).reduce((sum, count) => sum + count, 0)).toBe(batch.assets.length);
  });

  it("keeps active worker states non-terminal", () => {
    expect(isTerminalStatus("queued")).toBe(false);
    expect(isTerminalStatus("generating")).toBe(false);
    expect(isTerminalStatus("qc")).toBe(false);
    expect(isTerminalStatus("needs_review")).toBe(true);
  });
});
