import { and, asc, desc, eq, inArray, ne, sql } from "drizzle-orm";
import { getDatabase } from "@/lib/db/client";
import {
  approvals,
  assets,
  attempts,
  batches,
  calibrationCandidates,
  priorityPrompts,
  qcResults,
  references,
} from "@/lib/db/schema";
import { createCompletedDemoBatch, createDemoBatch, demoImageSources, demoPrompts, demoSpec } from "@/lib/demo-data";
import { env, isDemoMode } from "@/lib/env";
import type {
  Approval,
  ApprovalInput,
  Asset,
  Batch,
  BatchCreateInput,
  BatchListItem,
  BatchStatus,
  CalibrationCandidate,
  CreativeSpec,
  DashboardData,
  PriorityPrompt,
  ReferenceAsset,
} from "@/lib/types";
import type { StoredUpload } from "@/lib/storage";

export interface BatchRepository {
  dashboard(): Promise<DashboardData>;
  getBatch(id: string): Promise<Batch | undefined>;
  createBatch(id: string, input: BatchCreateInput, sourceFiles: StoredUpload[], referenceFiles: StoredUpload[]): Promise<Batch>;
  deleteBatch(id: string): Promise<void>;
  claimBatchRun(id: string, startedAt: string): Promise<boolean>;
  setBatchStatus(id: string, status: BatchStatus, fields?: { error?: Batch["error"] | null; startedAt?: string | null; completedAt?: string | null }): Promise<void>;
  saveSpec(batchId: string, spec: CreativeSpec): Promise<void>;
  savePrompts(batchId: string, prompts: PriorityPrompt[]): Promise<void>;
  saveCandidates(batchId: string, candidates: CalibrationCandidate[]): Promise<void>;
  addApproval(batchId: string, input: ApprovalInput): Promise<{ approval: Approval; approvedCount: number }>;
  saveAsset(asset: Asset): Promise<void>;
  markDelivered(batchId: string, assetIds: string[]): Promise<void>;
  updatePrompt(batchId: string, promptId: string, prompt: string): Promise<void>;
  recordPromptUse(batchId: string, promptId: string, won: boolean): Promise<void>;
  reserveCost(batchId: string, amount: number): Promise<boolean>;
}

function toListItem(batch: Batch): BatchListItem {
  const passedAssets = batch.assets.filter((asset) => ["passed", "approved", "delivered"].includes(asset.status)).length;
  return {
    id: batch.id,
    name: batch.name,
    status: batch.status,
    assetType: batch.assetType,
    totalAssets: batch.assets.length,
    passedAssets,
    reviewAssets: batch.assets.filter((asset) => asset.status === "needs_review").length,
    costSpent: batch.costSpent,
    costCap: batch.settings.costCap,
    coverUrl: batch.assets.find((asset) => asset.outputUrl)?.outputUrl ?? batch.assets[0]?.sourceUrl ?? "/demo/source-sneaker.svg",
    updatedAt: batch.updatedAt,
  };
}

function makeDashboard(batchList: Batch[]): DashboardData {
  const totalAssets = batchList.reduce((sum, batch) => sum + batch.assets.length, 0);
  const passed = batchList.reduce(
    (sum, batch) => sum + batch.assets.filter((asset) => ["passed", "approved", "delivered"].includes(asset.status)).length,
    0,
  );
  const terminal = batchList.reduce(
    (sum, batch) => sum + batch.assets.filter((asset) => ["passed", "approved", "delivered", "failed", "needs_review"].includes(asset.status)).length,
    0,
  );
  return {
    batches: batchList.map(toListItem).sort((a, b) => b.updatedAt.localeCompare(a.updatedAt)),
    totalAssets,
    autoPassRate: terminal === 0 ? 0 : Math.round((passed / terminal) * 100),
    estimatedHoursSaved: Math.round((passed * 7) / 6) / 10,
    totalSpend: Math.round(batchList.reduce((sum, batch) => sum + batch.costSpent, 0) * 100) / 100,
  };
}

type DemoGlobal = typeof globalThis & { __creativeQcBatches?: Map<string, Batch> };
const demoGlobal = globalThis as DemoGlobal;

function getDemoStore(): Map<string, Batch> {
  if (!demoGlobal.__creativeQcBatches) {
    const running = createDemoBatch();
    const completed = createCompletedDemoBatch();
    demoGlobal.__creativeQcBatches = new Map([
      [running.id, running],
      [completed.id, completed],
    ]);
  }
  return demoGlobal.__creativeQcBatches;
}

function clone<T>(value: T): T {
  return structuredClone(value);
}

function makeDemoAttempt(asset: Asset, index: number): Asset["attempts"][number] {
  const score = index % 7 === 5 ? 76 : 87 + (index % 10);
  const passed = score >= 80;
  const id = `attempt-${asset.id}-1`;
  return {
    id,
    assetId: asset.id,
    number: 1,
    promptId: "prompt-1",
    promptRank: 1,
    prompt: demoPrompts[0]!.prompt,
    params: { guidance_scale: 2.5, seed: 7190 + index },
    outputUrl: demoImageSources.outputs[index % demoImageSources.outputs.length],
    providerRequestId: `demo_${asset.id}`,
    status: passed ? "passed" : "failed",
    cost: env.GENERATION_COST_ESTIMATE_USD,
    qcResult: {
      id: `qc-${asset.id}-1`,
      attemptId: id,
      passed,
      overallScore: score,
      scores: {
        productFidelity: Math.min(98, score + 4),
        composition: score - 2,
        lighting: score + 1,
        brandStyle: score,
        technicalQuality: score - 1,
      },
      similarity: Math.min(0.96, score / 100 + 0.04),
      feedback: passed
        ? "The generated scene preserves the product and matches the approved warm studio recipe."
        : "Product fidelity is acceptable, but the background temperature and edge separation miss the approved look.",
      corrections: passed ? [] : ["Warm the background", "Increase right-edge separation"],
      confidence: 0.92,
      createdAt: new Date().toISOString(),
    },
    createdAt: new Date().toISOString(),
  };
}

function advanceDemo(batch: Batch): Batch {
  if (batch.status !== "autonomous_running" || !batch.startedAt) return batch;
  const elapsed = (Date.now() - new Date(batch.startedAt).getTime()) / 1000;
  let changed = false;
  batch.assets.forEach((asset, index) => {
    if (["passed", "delivered", "approved", "needs_review", "failed"].includes(asset.status)) return;
    const stage = Math.floor((elapsed - index * 0.45) / 1.1);
    const nextStatus = stage <= 0 ? "queued" : stage === 1 ? "generating" : stage === 2 ? "qc" : index % 11 === 7 ? "needs_review" : "passed";
    if (nextStatus === asset.status) return;
    asset.status = nextStatus;
    asset.updatedAt = new Date().toISOString();
    if (nextStatus === "passed" || nextStatus === "needs_review") {
      const attempt = makeDemoAttempt(asset, index);
      asset.attempts = [attempt];
      asset.outputUrl = attempt.outputUrl;
      asset.qcScore = attempt.qcResult?.overallScore;
      asset.similarity = attempt.qcResult?.similarity;
      asset.winningPromptRank = nextStatus === "passed" ? 1 : undefined;
      asset.failureReason = nextStatus === "needs_review" ? "Demo attempt cap reached after product-edge mismatch." : undefined;
      batch.costSpent = Math.min(batch.settings.costCap, batch.costSpent + attempt.cost);
    }
    changed = true;
  });
  if (batch.assets.every((asset) => ["passed", "delivered", "approved", "needs_review", "failed"].includes(asset.status))) {
    batch.status = "done";
    batch.completedAt = new Date().toISOString();
    changed = true;
  }
  if (changed) batch.updatedAt = new Date().toISOString();
  return batch;
}

class MemoryBatchRepository implements BatchRepository {
  async dashboard(): Promise<DashboardData> {
    const batchList = [...getDemoStore().values()].map(advanceDemo).map(clone);
    return makeDashboard(batchList);
  }

  async getBatch(id: string): Promise<Batch | undefined> {
    const batch = getDemoStore().get(id);
    return batch ? clone(advanceDemo(batch)) : undefined;
  }

  async createBatch(id: string, input: BatchCreateInput, sourceFiles: StoredUpload[], referenceFiles: StoredUpload[]): Promise<Batch> {
    const now = new Date().toISOString();
    const batch: Batch = {
      id,
      name: input.name,
      prompt: input.prompt,
      status: "calibrating",
      assetType: input.assetType,
      aspectRatios: input.aspectRatios,
      variantsPerAsset: input.variantsPerAsset,
      settings: {
        costCap: input.costCap,
        assetCostCap: env.COST_CAP_USD_PER_ASSET,
        maxAttempts: env.MAX_ATTEMPTS_PER_ASSET,
        feedbackRetries: env.FEEDBACK_RETRIES,
        qcPassScore: env.QC_PASS_SCORE,
      },
      costSpent: 0,
      createdAt: now,
      updatedAt: now,
      spec: { ...demoSpec, assetType: input.assetType, objective: input.prompt, aspectRatios: input.aspectRatios, variantsPerAsset: input.variantsPerAsset },
      references: referenceFiles.map((file) => ({
        id: crypto.randomUUID(),
        type: file.type.startsWith("video") ? "video" : "image",
        name: file.name,
        url: file.url,
        styleTokens: ["reference look"],
      })),
      assets: sourceFiles.flatMap((file, sourceIndex) => input.aspectRatios.flatMap((aspectRatio) => Array.from({ length: input.variantsPerAsset }, (_, variantIndex) => ({
        id: crypto.randomUUID(),
        batchId: id,
        sku: `SKU-${String(sourceIndex + 1).padStart(3, "0")}-${aspectRatio.replace(":", "x")}-V${variantIndex + 1}`,
        name: `${file.name.replace(/\.[^.]+$/, "")} · ${aspectRatio}${input.variantsPerAsset > 1 ? ` · Variant ${variantIndex + 1}` : ""}`,
        aspectRatio,
        sourceUrl: file.url,
        status: "queued" as const,
        attempts: [],
        updatedAt: now,
      })))),
      calibrationCandidates: [],
      approvals: [],
      priorityPrompts: [],
    };
    batch.calibrationCandidates = Array.from({ length: 10 }, (_, index) => {
      const asset = batch.assets[index % batch.assets.length]!;
      return {
        id: crypto.randomUUID(),
        batchId: id,
        assetId: asset.id,
        sourceUrl: asset.sourceUrl,
        outputUrl: demoImageSources.outputs[index % demoImageSources.outputs.length]!,
        prompt: `Calibration ${index + 1}: ${input.prompt}`,
        createdAt: now,
      };
    });
    getDemoStore().set(id, batch);
    return clone(batch);
  }

  async setBatchStatus(id: string, status: BatchStatus, fields?: { error?: Batch["error"] | null; startedAt?: string | null; completedAt?: string | null }): Promise<void> {
    const batch = getDemoStore().get(id);
    if (!batch) throw new Error("Batch not found.");
    batch.status = status;
    batch.updatedAt = new Date().toISOString();
    if (fields && "error" in fields) batch.error = fields.error ?? undefined;
    if (fields && "startedAt" in fields) batch.startedAt = fields.startedAt ?? undefined;
    if (fields && "completedAt" in fields) batch.completedAt = fields.completedAt ?? undefined;
  }

  async deleteBatch(id: string): Promise<void> {
    getDemoStore().delete(id);
  }

  async claimBatchRun(id: string, startedAt: string): Promise<boolean> {
    const batch = getDemoStore().get(id);
    if (!batch || batch.status === "autonomous_running") return false;
    batch.status = "autonomous_running";
    batch.startedAt = startedAt;
    batch.completedAt = undefined;
    batch.updatedAt = startedAt;
    return true;
  }

  async saveSpec(batchId: string, spec: CreativeSpec): Promise<void> {
    const batch = getDemoStore().get(batchId);
    if (!batch) throw new Error("Batch not found.");
    batch.spec = clone(spec);
    batch.updatedAt = new Date().toISOString();
  }

  async savePrompts(batchId: string, prompts: PriorityPrompt[]): Promise<void> {
    const batch = getDemoStore().get(batchId);
    if (!batch) throw new Error("Batch not found.");
    batch.priorityPrompts = clone(prompts);
    batch.status = "ready";
    batch.updatedAt = new Date().toISOString();
  }

  async saveCandidates(batchId: string, candidatesToSave: CalibrationCandidate[]): Promise<void> {
    const batch = getDemoStore().get(batchId);
    if (!batch) throw new Error("Batch not found.");
    batch.calibrationCandidates = clone(candidatesToSave);
    batch.updatedAt = new Date().toISOString();
  }

  async addApproval(batchId: string, input: ApprovalInput): Promise<{ approval: Approval; approvedCount: number }> {
    const batch = getDemoStore().get(batchId);
    if (!batch) throw new Error("Batch not found.");
    const candidate = batch.calibrationCandidates.find((item) => item.id === input.candidateId);
    if (!candidate) throw new Error("Calibration candidate not found.");
    const existing = batch.approvals.find((approval) => approval.candidateId === input.candidateId);
    const approval: Approval = {
      id: existing?.id ?? crypto.randomUUID(),
      batchId,
      assetId: candidate.assetId,
      candidateId: candidate.id,
      approved: input.decision === "approved",
      note: input.note,
      createdAt: existing?.createdAt ?? new Date().toISOString(),
    };
    batch.approvals = [...batch.approvals.filter((item) => item.candidateId !== candidate.id), approval];
    candidate.decision = input.decision;
    candidate.note = input.note;
    const approvedCount = batch.approvals.filter((item) => item.approved).length;
    if (approvedCount >= 5) {
      batch.status = "ready";
      batch.priorityPrompts = demoPrompts.map((prompt) => ({ ...clone(prompt), id: crypto.randomUUID(), batchId }));
      batch.spec = { ...demoSpec, assetType: batch.assetType, objective: batch.prompt, aspectRatios: batch.aspectRatios };
    }
    batch.updatedAt = new Date().toISOString();
    return { approval: clone(approval), approvedCount };
  }

  async saveAsset(asset: Asset): Promise<void> {
    const batch = getDemoStore().get(asset.batchId);
    if (!batch) throw new Error("Batch not found.");
    batch.assets = batch.assets.map((item) => (item.id === asset.id ? clone(asset) : item));
    batch.updatedAt = new Date().toISOString();
  }

  async markDelivered(batchId: string, assetIds: string[]): Promise<void> {
    const batch = getDemoStore().get(batchId);
    if (!batch) throw new Error("Batch not found.");
    const selected = new Set(assetIds);
    batch.assets.forEach((asset) => {
      if (selected.has(asset.id) && ["passed", "approved", "delivered"].includes(asset.status)) asset.status = "delivered";
    });
    batch.updatedAt = new Date().toISOString();
  }

  async updatePrompt(batchId: string, promptId: string, prompt: string): Promise<void> {
    const batch = getDemoStore().get(batchId);
    if (!batch) throw new Error("Batch not found.");
    const recipe = batch.priorityPrompts.find((item) => item.id === promptId);
    if (!recipe) throw new Error("Priority prompt not found.");
    recipe.prompt = prompt;
    batch.updatedAt = new Date().toISOString();
  }

  async recordPromptUse(batchId: string, promptId: string, won: boolean): Promise<void> {
    const batch = getDemoStore().get(batchId);
    if (!batch) throw new Error("Batch not found.");
    const prompt = batch.priorityPrompts.find((item) => item.id === promptId);
    if (!prompt) return;
    prompt.uses += 1;
    if (won) prompt.wins += 1;
    prompt.winRate = Math.round((prompt.wins / prompt.uses) * 1000) / 10;
    batch.updatedAt = new Date().toISOString();
  }

  async reserveCost(batchId: string, amount: number): Promise<boolean> {
    const batch = getDemoStore().get(batchId);
    if (!batch || batch.costSpent + amount > batch.settings.costCap) return false;
    batch.costSpent += amount;
    batch.updatedAt = new Date().toISOString();
    return true;
  }
}

class PostgresBatchRepository implements BatchRepository {
  async dashboard(): Promise<DashboardData> {
    const db = getDatabase();
    const rows = await db.select({ id: batches.id }).from(batches).orderBy(desc(batches.updatedAt)).limit(50);
    const batchList = (await Promise.all(rows.map((row) => this.getBatch(row.id)))).filter((batch): batch is Batch => Boolean(batch));
    return makeDashboard(batchList);
  }

  async getBatch(id: string): Promise<Batch | undefined> {
    const db = getDatabase();
    const [batchRows, referenceRows, assetRows, promptRows, approvalRows, candidateRows] = await Promise.all([
      db.select().from(batches).where(eq(batches.id, id)).limit(1),
      db.select().from(references).where(eq(references.batchId, id)),
      db.select().from(assets).where(eq(assets.batchId, id)).orderBy(asc(assets.createdAt)),
      db.select().from(priorityPrompts).where(eq(priorityPrompts.batchId, id)).orderBy(asc(priorityPrompts.rank)),
      db.select().from(approvals).where(eq(approvals.batchId, id)).orderBy(asc(approvals.createdAt)),
      db.select().from(calibrationCandidates).where(eq(calibrationCandidates.batchId, id)).orderBy(asc(calibrationCandidates.createdAt)),
    ]);
    const row = batchRows[0];
    if (!row) return undefined;
    const assetIds = assetRows.map((asset) => asset.id);
    const attemptRows = assetIds.length ? await db.select().from(attempts).where(inArray(attempts.assetId, assetIds)).orderBy(asc(attempts.number)) : [];
    const attemptIds = attemptRows.map((attempt) => attempt.id);
    const qcRows = attemptIds.length ? await db.select().from(qcResults).where(inArray(qcResults.attemptId, attemptIds)) : [];
    const qcMap = new Map(qcRows.map((qc) => [qc.attemptId, qc]));
    const assetMap = assetRows.map<Asset>((assetRow) => ({
      id: assetRow.id,
      batchId: assetRow.batchId,
      sku: assetRow.sku,
      name: assetRow.name,
      aspectRatio: assetRow.aspectRatio,
      sourceUrl: assetRow.sourceUrl,
      outputUrl: assetRow.outputUrl ?? undefined,
      status: assetRow.status,
      winningPromptRank: assetRow.winningPromptRank ?? undefined,
      qcScore: assetRow.qcScore ?? undefined,
      similarity: assetRow.similarity ?? undefined,
      failureReason: assetRow.failureReason ?? undefined,
      updatedAt: assetRow.updatedAt.toISOString(),
      attempts: attemptRows.filter((attempt) => attempt.assetId === assetRow.id).map((attempt) => {
        const qc = qcMap.get(attempt.id);
        return {
          id: attempt.id,
          assetId: attempt.assetId,
          number: attempt.number,
          promptId: attempt.promptId ?? `rank-${attempt.promptRank}`,
          promptRank: attempt.promptRank,
          prompt: attempt.prompt,
          params: attempt.params,
          outputUrl: attempt.outputUrl ?? undefined,
          providerRequestId: attempt.providerRequestId ?? undefined,
          status: attempt.status as "generating" | "qc" | "passed" | "failed",
          cost: attempt.cost,
          failureReason: attempt.failureReason ?? undefined,
          createdAt: attempt.createdAt.toISOString(),
          qcResult: qc
            ? {
                id: qc.id,
                attemptId: qc.attemptId,
                passed: qc.passed,
                overallScore: qc.overallScore,
                scores: qc.scoresJson,
                similarity: qc.similarity,
                feedback: qc.feedback,
                corrections: qc.corrections,
                confidence: qc.confidence,
                createdAt: qc.createdAt.toISOString(),
              }
            : undefined,
        };
      }),
    }));
    return {
      id: row.id,
      name: row.name,
      prompt: row.prompt,
      status: row.status,
      assetType: row.assetType as Batch["assetType"],
      aspectRatios: row.aspectRatios,
      variantsPerAsset: row.variantsPerAsset,
      settings: { costCap: row.costCap, assetCostCap: row.assetCostCap, maxAttempts: row.maxAttempts, feedbackRetries: row.feedbackRetries, qcPassScore: row.qcPassScore },
      costSpent: row.costSpent,
      createdAt: row.createdAt.toISOString(),
      updatedAt: row.updatedAt.toISOString(),
      spec: row.specJson ?? undefined,
      references: referenceRows.map<ReferenceAsset>((reference) => ({
        id: reference.id,
        type: reference.type as ReferenceAsset["type"],
        name: reference.name,
        url: reference.url,
        styleTokens: reference.styleTokens,
      })),
      assets: assetMap,
      calibrationCandidates: candidateRows.map((candidate) => ({
        id: candidate.id,
        batchId: candidate.batchId,
        assetId: candidate.assetId,
        sourceUrl: candidate.sourceUrl,
        outputUrl: candidate.outputUrl,
        prompt: candidate.prompt,
        decision: candidate.decision as CalibrationCandidate["decision"],
        note: candidate.note ?? undefined,
        createdAt: candidate.createdAt.toISOString(),
      })),
      approvals: approvalRows.map((approval) => ({
        id: approval.id,
        batchId: approval.batchId,
        assetId: approval.assetId,
        candidateId: approval.candidateId,
        approved: approval.approved,
        note: approval.note ?? undefined,
        createdAt: approval.createdAt.toISOString(),
      })),
      priorityPrompts: promptRows.map((prompt) => ({
        id: prompt.id,
        batchId: prompt.batchId,
        rank: prompt.rank,
        prompt: prompt.prompt,
        rationale: prompt.rationale,
        negativePrompt: prompt.negativePrompt,
        params: prompt.params,
        wins: prompt.wins,
        uses: prompt.uses,
        winRate: prompt.uses === 0 ? 0 : Math.round((prompt.wins / prompt.uses) * 1000) / 10,
      })),
      startedAt: row.startedAt?.toISOString(),
      completedAt: row.completedAt?.toISOString(),
      error: row.errorJson as Batch["error"],
    };
  }

  async createBatch(id: string, input: BatchCreateInput, sourceFiles: StoredUpload[], referenceFiles: StoredUpload[]): Promise<Batch> {
    const db = getDatabase();
    await db.transaction(async (tx) => {
      await tx.insert(batches).values({
        id,
        name: input.name,
        prompt: input.prompt,
        assetType: input.assetType,
        aspectRatios: input.aspectRatios,
        variantsPerAsset: input.variantsPerAsset,
        status: "calibrating",
        costCap: input.costCap,
        assetCostCap: env.COST_CAP_USD_PER_ASSET,
        maxAttempts: env.MAX_ATTEMPTS_PER_ASSET,
        feedbackRetries: env.FEEDBACK_RETRIES,
        qcPassScore: env.QC_PASS_SCORE,
      });
      if (sourceFiles.length) {
        await tx.insert(assets).values(sourceFiles.flatMap((file, sourceIndex) => input.aspectRatios.flatMap((aspectRatio) => Array.from({ length: input.variantsPerAsset }, (_, variantIndex) => ({
          batchId: id,
          sku: `SKU-${String(sourceIndex + 1).padStart(3, "0")}-${aspectRatio.replace(":", "x")}-V${variantIndex + 1}`,
          name: `${file.name.replace(/\.[^.]+$/, "")} · ${aspectRatio}${input.variantsPerAsset > 1 ? ` · Variant ${variantIndex + 1}` : ""}`,
          aspectRatio,
          sourceUrl: file.url,
          status: "queued" as const,
        })))));
      }
      if (referenceFiles.length) {
        await tx.insert(references).values(referenceFiles.map((file) => ({
          batchId: id,
          type: file.type.startsWith("video") ? "video" : "image",
          name: file.name,
          url: file.url,
          styleTokens: [],
        })));
      }
    });
    const batch = await this.getBatch(id);
    if (!batch) throw new Error("Batch was not readable after creation.");
    return batch;
  }

  async setBatchStatus(id: string, status: BatchStatus, fields?: { error?: Batch["error"] | null; startedAt?: string | null; completedAt?: string | null }): Promise<void> {
    await getDatabase().update(batches).set({
      status,
      updatedAt: new Date(),
      errorJson: fields && "error" in fields ? fields.error : undefined,
      startedAt: fields && "startedAt" in fields ? (fields.startedAt ? new Date(fields.startedAt) : null) : undefined,
      completedAt: fields && "completedAt" in fields ? (fields.completedAt ? new Date(fields.completedAt) : null) : undefined,
    }).where(eq(batches.id, id));
  }

  async deleteBatch(id: string): Promise<void> {
    await getDatabase().delete(batches).where(eq(batches.id, id));
  }

  async claimBatchRun(id: string, startedAt: string): Promise<boolean> {
    const rows = await getDatabase().update(batches).set({
      status: "autonomous_running",
      startedAt: new Date(startedAt),
      completedAt: null,
      updatedAt: new Date(startedAt),
    }).where(and(eq(batches.id, id), ne(batches.status, "autonomous_running"))).returning({ id: batches.id });
    return rows.length === 1;
  }

  async saveSpec(batchId: string, spec: CreativeSpec): Promise<void> {
    await getDatabase().update(batches).set({ specJson: spec, updatedAt: new Date() }).where(eq(batches.id, batchId));
  }

  async savePrompts(batchId: string, prompts: PriorityPrompt[]): Promise<void> {
    const db = getDatabase();
    await db.transaction(async (tx) => {
      await tx.delete(priorityPrompts).where(eq(priorityPrompts.batchId, batchId));
      if (prompts.length) {
        await tx.insert(priorityPrompts).values(prompts.map((prompt) => ({
          id: prompt.id,
          batchId,
          rank: prompt.rank,
          prompt: prompt.prompt,
          rationale: prompt.rationale,
          negativePrompt: prompt.negativePrompt,
          params: prompt.params,
          wins: prompt.wins,
          uses: prompt.uses,
        })));
      }
      await tx.update(batches).set({ status: "ready", updatedAt: new Date() }).where(eq(batches.id, batchId));
    });
  }

  async saveCandidates(batchId: string, candidatesToSave: CalibrationCandidate[]): Promise<void> {
    const db = getDatabase();
    await db.transaction(async (tx) => {
      if (candidatesToSave.length) {
        await tx.insert(calibrationCandidates).values(candidatesToSave.map((candidate) => ({
          id: candidate.id,
          batchId,
          assetId: candidate.assetId,
          sourceUrl: candidate.sourceUrl,
          outputUrl: candidate.outputUrl,
          prompt: candidate.prompt,
          decision: candidate.decision,
          note: candidate.note,
        }))).onConflictDoUpdate({
          target: calibrationCandidates.id,
          set: {
            sourceUrl: sql`excluded.source_url`,
            outputUrl: sql`excluded.output_url`,
            prompt: sql`excluded.prompt`,
          },
        });
      }
    });
  }

  async addApproval(batchId: string, input: ApprovalInput): Promise<{ approval: Approval; approvedCount: number }> {
    const db = getDatabase();
    return db.transaction(async (tx) => {
      const candidateRows = await tx.select().from(calibrationCandidates).where(and(eq(calibrationCandidates.id, input.candidateId), eq(calibrationCandidates.batchId, batchId))).limit(1);
      const candidate = candidateRows[0];
      if (!candidate) throw new Error("Calibration candidate not found.");
      const approvalRows = await tx.insert(approvals).values({
        batchId,
        assetId: candidate.assetId,
        candidateId: candidate.id,
        approved: input.decision === "approved",
        note: input.note,
      }).onConflictDoUpdate({
        target: approvals.candidateId,
        set: { approved: input.decision === "approved", note: input.note },
      }).returning();
      await tx.update(calibrationCandidates).set({ decision: input.decision, note: input.note }).where(eq(calibrationCandidates.id, candidate.id));
      const countRows = await tx.select({ count: sql<number>`count(*)::int` }).from(approvals).where(and(eq(approvals.batchId, batchId), eq(approvals.approved, true)));
      const approvalRow = approvalRows[0]!;
      return {
        approval: {
          id: approvalRow.id,
          batchId,
          assetId: approvalRow.assetId,
          candidateId: approvalRow.candidateId,
          approved: approvalRow.approved,
          note: approvalRow.note ?? undefined,
          createdAt: approvalRow.createdAt.toISOString(),
        },
        approvedCount: countRows[0]?.count ?? 0,
      };
    });
  }

  async saveAsset(asset: Asset): Promise<void> {
    const db = getDatabase();
    await db.transaction(async (tx) => {
      await tx.update(assets).set({
        outputUrl: asset.outputUrl,
        status: asset.status,
        winningPromptRank: asset.winningPromptRank,
        qcScore: asset.qcScore,
        similarity: asset.similarity,
        failureReason: asset.failureReason,
        updatedAt: new Date(asset.updatedAt),
      }).where(eq(assets.id, asset.id));
      for (const attempt of asset.attempts) {
        await tx.insert(attempts).values({
          id: attempt.id,
          assetId: asset.id,
          number: attempt.number,
          promptId: /^[0-9a-f-]{36}$/i.test(attempt.promptId) ? attempt.promptId : null,
          promptRank: attempt.promptRank,
          prompt: attempt.prompt,
          params: attempt.params,
          outputUrl: attempt.outputUrl,
          providerRequestId: attempt.providerRequestId,
          status: attempt.status,
          cost: attempt.cost,
          failureReason: attempt.failureReason,
          createdAt: new Date(attempt.createdAt),
        }).onConflictDoUpdate({
          target: [attempts.assetId, attempts.number],
          set: {
            outputUrl: attempt.outputUrl,
            providerRequestId: attempt.providerRequestId,
            status: attempt.status,
            cost: attempt.cost,
            failureReason: attempt.failureReason,
          },
        });
        if (attempt.qcResult) {
          const result = attempt.qcResult;
          await tx.insert(qcResults).values({
            id: result.id,
            attemptId: attempt.id,
            passed: result.passed,
            overallScore: result.overallScore,
            scoresJson: result.scores,
            similarity: result.similarity,
            feedback: result.feedback,
            corrections: result.corrections,
            confidence: result.confidence,
            createdAt: new Date(result.createdAt),
          }).onConflictDoUpdate({
            target: qcResults.attemptId,
            set: {
              passed: result.passed,
              overallScore: result.overallScore,
              scoresJson: result.scores,
              similarity: result.similarity,
              feedback: result.feedback,
              corrections: result.corrections,
              confidence: result.confidence,
            },
          });
        }
      }
    });
  }

  async markDelivered(batchId: string, assetIds: string[]): Promise<void> {
    if (!assetIds.length) return;
    await getDatabase().update(assets).set({ status: "delivered", updatedAt: new Date() }).where(and(
      eq(assets.batchId, batchId),
      inArray(assets.id, assetIds),
      inArray(assets.status, ["passed", "approved", "delivered"]),
    ));
  }

  async updatePrompt(batchId: string, promptId: string, prompt: string): Promise<void> {
    const rows = await getDatabase().update(priorityPrompts).set({ prompt }).where(and(eq(priorityPrompts.id, promptId), eq(priorityPrompts.batchId, batchId))).returning({ id: priorityPrompts.id });
    if (!rows.length) throw new Error("Priority prompt not found.");
  }

  async recordPromptUse(batchId: string, promptId: string, won: boolean): Promise<void> {
    await getDatabase().update(priorityPrompts).set({
      uses: sql`${priorityPrompts.uses} + 1`,
      wins: won ? sql`${priorityPrompts.wins} + 1` : sql`${priorityPrompts.wins}`,
    }).where(and(eq(priorityPrompts.id, promptId), eq(priorityPrompts.batchId, batchId)));
  }

  async reserveCost(batchId: string, amount: number): Promise<boolean> {
    const rows = await getDatabase().update(batches).set({
      costSpent: sql`${batches.costSpent} + ${amount}`,
      updatedAt: new Date(),
    }).where(and(eq(batches.id, batchId), sql`${batches.costSpent} + ${amount} <= ${batches.costCap}`)).returning({ id: batches.id });
    return rows.length === 1;
  }
}

let repository: BatchRepository | undefined;

export function getRepository(): BatchRepository {
  if (!repository) repository = isDemoMode ? new MemoryBatchRepository() : new PostgresBatchRepository();
  return repository;
}
