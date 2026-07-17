import { NextResponse } from "next/server";
import { apiError } from "@/lib/api";
import { isDemoMode } from "@/lib/env";
import { prepareCalibration, reconcileBatchCompletion, synthesizeRecipe } from "@/lib/orchestrator/graph";
import { estimateGenerationCost } from "@/lib/providers/fal";
import { enqueueBatchAssets, enqueueJob } from "@/lib/queue";
import { getRepository } from "@/lib/repository";
import { assertLiveRuntimeReady } from "@/lib/runtime-health";
import { batchActionSchema } from "@/lib/validation";

export async function POST(request: Request, context: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await context.params;
    const input = batchActionSchema.parse(await request.json());
    const repository = getRepository();
    const batch = await repository.getBatch(id);
    if (!batch) throw new Error("Batch not found.");
    if (!isDemoMode && ["retry_calibration", "run", "resynthesize", "retry_failed", "regenerate_asset"].includes(input.action)) {
      await assertLiveRuntimeReady();
    }

    switch (input.action) {
      case "retry_calibration":
        if (batch.status === "autonomous_running") throw new Error("Wait for the current run to finish before retrying calibration.");
        if (batch.approvals.filter((approval) => approval.approved).length >= 5) throw new Error("Calibration already has five approvals.");
        await repository.setBatchStatus(id, "calibrating", { error: null });
        if (isDemoMode) await prepareCalibration(id);
        else await enqueueJob({ kind: "prepare_calibration", batchId: id }, `calibration-${id}-${Date.now()}`);
        break;
      case "run": {
        if (batch.status === "autonomous_running") throw new Error("This batch is already running.");
        if (batch.approvals.filter((approval) => approval.approved).length < 5) throw new Error("Five approvals are required before autonomous production.");
        if (!batch.priorityPrompts.length) throw new Error("The priority recipe is not ready yet.");
        const runnable = batch.assets.filter((asset) => !["passed", "approved", "delivered"].includes(asset.status));
        if (!runnable.length) {
          await reconcileBatchCompletion(id);
          break;
        }
        const startedAt = new Date().toISOString();
        if (!await repository.claimBatchRun(id, startedAt)) throw new Error("This batch is already running.");
        try {
          for (const asset of runnable) {
            await repository.saveAsset({ ...asset, status: "queued", failureReason: undefined, updatedAt: startedAt });
          }
          await enqueueBatchAssets(id, runnable.map((asset) => asset.id), `run-${crypto.randomUUID()}`);
        } catch (error) {
          await Promise.allSettled([
            ...runnable.map((asset) => repository.saveAsset(asset)),
            repository.setBatchStatus(id, batch.status, { startedAt: batch.startedAt ?? null, completedAt: batch.completedAt ?? null }),
          ]);
          throw error;
        }
        break;
      }
      case "resynthesize":
        if (batch.status === "autonomous_running") throw new Error("Wait for the current run to finish before re-synthesizing the recipe.");
        if (isDemoMode) await synthesizeRecipe(id);
        else {
          await repository.setBatchStatus(id, "synthesizing");
          await enqueueJob({ kind: "resynthesize_recipe", batchId: id }, `resynthesis-${id}-${Date.now()}`);
        }
        break;
      case "retry_failed": {
        if (batch.status === "autonomous_running") throw new Error("Wait for the current run to finish before retrying failed assets.");
        const nextCost = estimateGenerationCost(batch.references.filter((reference) => reference.type === "image").length);
        const failed = batch.assets.filter((asset) => ["failed", "needs_review"].includes(asset.status) && asset.attempts.length < batch.settings.maxAttempts && asset.attempts.reduce((sum, attempt) => sum + attempt.cost, 0) + nextCost <= batch.settings.assetCostCap);
        if (!failed.length) throw new Error("No failed assets have remaining attempt and cost budget. Approve them manually or start a new batch with a larger cap.");
        const startedAt = new Date().toISOString();
        if (!await repository.claimBatchRun(id, startedAt)) throw new Error("This batch is already running.");
        try {
          for (const asset of failed) {
            await repository.saveAsset({ ...asset, status: "queued", failureReason: undefined, updatedAt: startedAt });
          }
          await enqueueBatchAssets(id, failed.map((asset) => asset.id), `retry-${crypto.randomUUID()}`);
        } catch (error) {
          await Promise.allSettled([
            ...failed.map((asset) => repository.saveAsset(asset)),
            repository.setBatchStatus(id, batch.status, { startedAt: batch.startedAt ?? null, completedAt: batch.completedAt ?? null }),
          ]);
          throw error;
        }
        break;
      }
      case "approve_asset": {
        const asset = batch.assets.find((item) => item.id === input.assetId);
        if (!asset) throw new Error("Asset not found.");
        if (!["failed", "needs_review"].includes(asset.status)) throw new Error("Only failed or needs-review assets can be manually approved.");
        await repository.saveAsset({ ...asset, status: "approved", failureReason: undefined, updatedAt: new Date().toISOString() });
        await reconcileBatchCompletion(id);
        break;
      }
      case "regenerate_asset": {
        if (batch.status === "autonomous_running") throw new Error("Wait for the current run to finish before manually regenerating an asset.");
        const asset = batch.assets.find((item) => item.id === input.assetId);
        if (!asset) throw new Error("Asset not found.");
        if (["queued", "generating", "qc"].includes(asset.status)) throw new Error("This asset is already in the autonomous workflow.");
        const nextCost = estimateGenerationCost(batch.references.filter((reference) => reference.type === "image").length);
        const assetSpend = asset.attempts.reduce((sum, attempt) => sum + attempt.cost, 0);
        if (asset.attempts.length >= batch.settings.maxAttempts) throw new Error("This asset has reached its attempt cap and can only be manually approved.");
        if (assetSpend + nextCost > batch.settings.assetCostCap) throw new Error("This asset has reached its cost cap and can only be manually approved.");
        const startedAt = new Date().toISOString();
        const claimed = await repository.claimBatchRun(id, startedAt);
        if (!claimed) throw new Error("This batch is already running.");
        try {
          await repository.saveAsset({ ...asset, status: "queued", failureReason: input.prompt ? `Manual direction: ${input.prompt}` : undefined, updatedAt: startedAt });
          await enqueueBatchAssets(id, [asset.id], `manual-${crypto.randomUUID()}`);
        } catch (error) {
          await Promise.allSettled([
            repository.saveAsset(asset),
            ...(claimed ? [repository.setBatchStatus(id, batch.status, { startedAt: batch.startedAt ?? null, completedAt: batch.completedAt ?? null })] : []),
          ]);
          throw error;
        }
        break;
      }
      case "update_prompt":
        if (batch.status === "autonomous_running") throw new Error("Wait for the current run to finish before editing the recipe.");
        await repository.updatePrompt(id, input.promptId, input.prompt);
        break;
    }

    return NextResponse.json(await repository.getBatch(id));
  } catch (error) {
    return apiError(error, "Could not run the batch action.");
  }
}
