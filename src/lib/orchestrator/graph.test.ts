import { describe, expect, it } from "vitest";
import { runAssetWorkflow } from "@/lib/orchestrator/graph";
import { getRepository } from "@/lib/repository";

describe("bounded autonomous workflow", () => {
  it("expands every requested source variant into an independent asset job", async () => {
    const repository = getRepository();
    const batch = await repository.createBatch(
      crypto.randomUUID(),
      {
        name: "Variant test",
        prompt: "Preserve the product and create two consistent catalogue-ready views.",
        assetType: "multi_view",
        aspectRatios: ["1:1"],
        variantsPerAsset: 2,
        costCap: 2,
      },
      [{ name: "watch.png", type: "image/png", url: "/demo/source-watch.svg" }],
      [],
    );
    expect(batch.assets).toHaveLength(2);
    expect(new Set(batch.assets.map((asset) => asset.sku)).size).toBe(2);
  });

  it("moves a calibrated asset through generation and QC without keys in review mode", async () => {
    const repository = getRepository();
    const batchId = crypto.randomUUID();
    const batch = await repository.createBatch(
      batchId,
      {
        name: "Workflow test",
        prompt: "Preserve the product exactly and place it in a warm premium editorial studio.",
        assetType: "sku_lifestyle",
        aspectRatios: ["4:5"],
        variantsPerAsset: 1,
        costCap: 2,
      },
      [{ name: "test.png", type: "image/png", url: "/demo/source-sneaker.svg" }],
      [],
    );
    for (const candidate of batch.calibrationCandidates.slice(0, 5)) {
      await repository.addApproval(batchId, { candidateId: candidate.id, decision: "approved" });
    }
    const calibrated = await repository.getBatch(batchId);
    expect(calibrated?.priorityPrompts.length).toBeGreaterThanOrEqual(2);
    const result = await runAssetWorkflow(batchId, batch.assets[0]!.id);
    expect(result.status).toBe("passed");
    expect(result.attempts).toHaveLength(1);
    expect(result.attempts[0]?.qcResult?.passed).toBe(true);
    const completed = await repository.getBatch(batchId);
    expect(completed?.status).toBe("done");
    expect(completed?.priorityPrompts[0]?.uses).toBeGreaterThan(0);
    expect(completed?.priorityPrompts[0]?.wins).toBeGreaterThan(0);
  });
});
