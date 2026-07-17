import { Annotation, END, START, StateGraph } from "@langchain/langgraph";
import { estimateGenerationCost, generateImage } from "@/lib/providers/fal";
import { createCreativeSpec, reasonAboutQc, synthesizePriorityPrompts } from "@/lib/providers/anthropic";
import { extractQcEvidence } from "@/lib/providers/vlm";
import { getRepository } from "@/lib/repository";
import { storeGeneratedImage } from "@/lib/storage";
import type { Asset, Batch, CalibrationCandidate, QcResult } from "@/lib/types";

const WorkflowState = Annotation.Root({
  batch: Annotation<Batch>(),
  asset: Annotation<Asset>(),
  promptIndex: Annotation<number>(),
  feedbackRetries: Annotation<number>(),
  attemptCount: Annotation<number>(),
  feedback: Annotation<string>(),
  outputUrl: Annotation<string | undefined>(),
  providerRequestId: Annotation<string | undefined>(),
  terminalReason: Annotation<string | undefined>(),
  generationFailed: Annotation<boolean>(),
});

type State = typeof WorkflowState.State;

function currentPrompt(state: State) {
  return state.batch.priorityPrompts[state.promptIndex];
}

async function generateNode(state: State): Promise<Partial<State>> {
  const recipe = currentPrompt(state);
  if (!recipe) return { terminalReason: "All priority prompts were exhausted." };
  if (state.attemptCount >= state.batch.settings.maxAttempts) return { terminalReason: "Maximum attempts reached." };
  const referenceUrls = state.batch.references.filter((reference) => reference.type === "image").map((reference) => reference.url);
  const estimatedCost = estimateGenerationCost(referenceUrls.length);
  const assetSpend = state.asset.attempts.reduce((sum, attempt) => sum + attempt.cost, 0);
  if (assetSpend + estimatedCost > state.batch.settings.assetCostCap) {
    return { terminalReason: "Per-asset cost cap reached before the next generation call." };
  }
  const repository = getRepository();
  const reserved = await repository.reserveCost(state.batch.id, estimatedCost);
  if (!reserved) return { terminalReason: "Batch cost cap reached before the next generation call." };
  const attemptNumber = state.attemptCount + 1;
  const attemptId = crypto.randomUUID();
  const asset: Asset = {
    ...state.asset,
    status: "generating",
    updatedAt: new Date().toISOString(),
    attempts: [
      ...state.asset.attempts,
      {
        id: attemptId,
        assetId: state.asset.id,
        number: attemptNumber,
        promptId: recipe.id,
        promptRank: recipe.rank,
        prompt: recipe.prompt,
        params: recipe.params,
        status: "generating",
        cost: estimatedCost,
        createdAt: new Date().toISOString(),
      },
    ],
  };
  await repository.saveAsset(asset);
  try {
    const generated = await generateImage({
      sourceUrl: asset.sourceUrl,
      referenceUrls,
      aspectRatio: asset.aspectRatio,
      prompt: recipe.prompt,
      negativePrompt: recipe.negativePrompt,
      correctionFeedback: state.feedback || undefined,
      params: recipe.params,
      attemptNumber,
    });
    const outputUrl = await storeGeneratedImage(state.batch.id, asset.id, generated.url);
    const latestAttempt = asset.attempts.at(-1)!;
    latestAttempt.outputUrl = outputUrl;
    latestAttempt.providerRequestId = generated.requestId;
    latestAttempt.status = "qc";
    asset.outputUrl = outputUrl;
    asset.status = "qc";
    asset.updatedAt = new Date().toISOString();
    await repository.saveAsset(asset);
    return { asset, outputUrl, providerRequestId: generated.requestId, attemptCount: attemptNumber, generationFailed: false };
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unknown generation provider error.";
    const latestAttempt = asset.attempts.at(-1)!;
    latestAttempt.status = "failed";
    latestAttempt.failureReason = message;
    asset.status = "queued";
    asset.failureReason = message;
    asset.updatedAt = new Date().toISOString();
    await repository.saveAsset(asset);
    return { asset, attemptCount: attemptNumber, feedback: message, generationFailed: true };
  }
}

async function judgeNode(state: State): Promise<Partial<State>> {
  if (!state.outputUrl) return { terminalReason: "Generation completed without an output URL." };
  const repository = getRepository();
  const evidence = await extractQcEvidence(state.batch, state.asset, state.outputUrl);
  const judgment = await reasonAboutQc(state.batch, evidence, state.asset.sourceUrl, state.outputUrl);
  const similarity = evidence.styleSimilarity;
  const scoreValues = Object.values(judgment.scores);
  const rubricAverage = scoreValues.reduce((sum, score) => sum + score, 0) / scoreValues.length;
  const overallScore = Math.round((rubricAverage * 0.8 + similarity * 100 * 0.2) * 10) / 10;
  const passed = overallScore >= state.batch.settings.qcPassScore && judgment.scores.productFidelity >= 85;
  const asset = structuredClone(state.asset);
  const latestAttempt = asset.attempts.at(-1);
  if (!latestAttempt) throw new Error("QC cannot run without an attempt record.");
  const result: QcResult = {
    id: crypto.randomUUID(),
    attemptId: latestAttempt.id,
    passed,
    overallScore,
    scores: judgment.scores,
    similarity,
    feedback: judgment.feedback,
    corrections: judgment.corrections,
    confidence: judgment.confidence,
    createdAt: new Date().toISOString(),
  };
  latestAttempt.qcResult = result;
  latestAttempt.status = passed ? "passed" : "failed";
  asset.qcScore = overallScore;
  asset.similarity = similarity;
  asset.status = passed ? "passed" : "queued";
  asset.winningPromptRank = passed ? latestAttempt.promptRank : undefined;
  asset.failureReason = passed ? undefined : judgment.feedback;
  asset.updatedAt = new Date().toISOString();
  await repository.saveAsset(asset);
  await repository.recordPromptUse(state.batch.id, latestAttempt.promptId, passed);
  return {
    asset,
    feedback: judgment.corrections.length ? judgment.corrections.join("; ") : judgment.feedback,
    terminalReason: passed ? "passed" : undefined,
    generationFailed: false,
  };
}

async function finalizeNode(state: State): Promise<Partial<State>> {
  const asset: Asset = {
    ...state.asset,
    status: "needs_review",
    failureReason: state.terminalReason || state.feedback || "Quality caps were exhausted.",
    updatedAt: new Date().toISOString(),
  };
  await getRepository().saveAsset(asset);
  return { asset };
}

function afterGenerate(state: State): "judge" | "generate" | "finalize" {
  if (state.terminalReason) return "finalize";
  if (!state.generationFailed) return "judge";
  return state.attemptCount >= state.batch.settings.maxAttempts ? "finalize" : "generate";
}

function afterJudge(state: State): "generate" | "finalize" | typeof END {
  if (state.terminalReason === "passed") return END;
  if (state.attemptCount >= state.batch.settings.maxAttempts) return "finalize";
  if (state.feedbackRetries < state.batch.settings.feedbackRetries) return "generate";
  if (state.promptIndex + 1 < state.batch.priorityPrompts.length) return "generate";
  return "finalize";
}

function prepareRetryNode(state: State): Partial<State> {
  if (state.generationFailed || state.feedbackRetries < state.batch.settings.feedbackRetries) {
    return { feedbackRetries: state.feedbackRetries + 1, terminalReason: undefined, outputUrl: undefined };
  }
  return { promptIndex: state.promptIndex + 1, feedbackRetries: 0, terminalReason: undefined, outputUrl: undefined };
}

const graph = new StateGraph(WorkflowState)
  .addNode("generate", generateNode)
  .addNode("judge", judgeNode)
  .addNode("prepareRetry", prepareRetryNode)
  .addNode("finalize", finalizeNode)
  .addEdge(START, "generate")
  .addConditionalEdges("generate", afterGenerate, {
    judge: "judge",
    generate: "prepareRetry",
    finalize: "finalize",
  })
  .addConditionalEdges("judge", afterJudge, {
    generate: "prepareRetry",
    finalize: "finalize",
    [END]: END,
  })
  .addEdge("prepareRetry", "generate")
  .addEdge("finalize", END)
  .compile();

export async function runAssetWorkflow(batchId: string, assetId: string): Promise<Asset> {
  const repository = getRepository();
  const batch = await repository.getBatch(batchId);
  if (!batch) throw new Error("Batch not found.");
  const asset = batch.assets.find((item) => item.id === assetId);
  if (!asset) throw new Error("Asset not found.");
  if (!batch.priorityPrompts.length) throw new Error("The batch has no synthesized priority prompts.");
  if (["passed", "approved", "delivered"].includes(asset.status)) {
    await reconcileBatchCompletion(batchId);
    return asset;
  }
  let workingAsset = asset;
  let initialFeedback = asset.failureReason ?? "";
  let initialFeedbackRetries = 0;
  if (asset.status === "qc" && asset.outputUrl) {
    const resumed = await judgeNode({
      batch,
      asset,
      promptIndex: Math.max(0, asset.attempts.at(-1)?.promptRank ? asset.attempts.at(-1)!.promptRank - 1 : 0),
      feedbackRetries: 0,
      attemptCount: asset.attempts.length,
      feedback: initialFeedback,
      outputUrl: asset.outputUrl,
      providerRequestId: asset.attempts.at(-1)?.providerRequestId,
      terminalReason: undefined,
      generationFailed: false,
    });
    workingAsset = resumed.asset ?? asset;
    initialFeedback = resumed.feedback ?? initialFeedback;
    initialFeedbackRetries = 1;
    if (resumed.terminalReason === "passed") {
      await reconcileBatchCompletion(batchId);
      return workingAsset;
    }
  }
  const result = await graph.invoke(
    {
      batch,
      asset: workingAsset,
      promptIndex: 0,
      feedbackRetries: initialFeedbackRetries,
      attemptCount: workingAsset.attempts.length,
      feedback: initialFeedback,
      outputUrl: undefined,
      providerRequestId: undefined,
      terminalReason: undefined,
      generationFailed: false,
    },
    { recursionLimit: batch.settings.maxAttempts * 3 + 6 },
  );
  await reconcileBatchCompletion(batchId);
  return result.asset;
}

const TERMINAL_ASSET_STATUSES: Asset["status"][] = ["passed", "approved", "delivered", "failed", "needs_review"];

export async function reconcileBatchCompletion(batchId: string): Promise<void> {
  const repository = getRepository();
  const batch = await repository.getBatch(batchId);
  if (!batch?.assets.length) return;
  if (batch.assets.every((asset) => TERMINAL_ASSET_STATUSES.includes(asset.status))) {
    await repository.setBatchStatus(batchId, "done", { completedAt: new Date().toISOString() });
  }
}

export async function prepareCalibration(batchId: string): Promise<void> {
  const repository = getRepository();
  const batch = await repository.getBatch(batchId);
  if (!batch) throw new Error("Batch not found.");
  const spec = batch.spec ?? await createCreativeSpec(batch);
  if (!batch.spec) await repository.saveSpec(batchId, spec);
  const candidates: CalibrationCandidate[] = [...batch.calibrationCandidates];
  const candidateCount = 10;
  const referenceUrls = batch.references.filter((reference) => reference.type === "image").map((reference) => reference.url);
  const estimatedCost = estimateGenerationCost(referenceUrls.length);
  let lastError: unknown;
  for (let index = candidates.length; index < candidateCount; index += 1) {
    const asset = batch.assets[index % batch.assets.length]!;
    const reserved = await repository.reserveCost(batchId, estimatedCost);
    if (!reserved) break;
    try {
      const generated = await generateImage({
        sourceUrl: asset.sourceUrl,
        referenceUrls,
        aspectRatio: asset.aspectRatio,
        prompt: `${spec.objective}. ${spec.styleTokens.join(", ")}. Preserve the source product exactly.`,
        negativePrompt: spec.negativeConstraints.join(", "),
        params: { guidance_scale: 5, num_inference_steps: 28, image_size: "portrait_4_3" },
        attemptNumber: index + 1,
      });
      candidates.push({
        id: crypto.randomUUID(),
        batchId,
        assetId: asset.id,
        sourceUrl: asset.sourceUrl,
        outputUrl: await storeGeneratedImage(batchId, `calibration-${asset.id}-${index}`, generated.url),
        prompt: `${spec.objective}. ${spec.styleTokens.join(", ")}`,
        createdAt: new Date().toISOString(),
      });
      await repository.saveCandidates(batchId, candidates);
    } catch (error) {
      lastError = error;
      console.warn(JSON.stringify({ event: "calibration_candidate_failed", batchId, index, error: error instanceof Error ? error.message : "Unknown provider error" }));
    }
  }
  if (candidates.length < 5) {
    const reason = lastError instanceof Error ? ` Last provider error: ${lastError.message}` : "";
    throw new Error(`Only ${candidates.length} calibration candidates completed; at least five are required.${reason}`);
  }
}

export async function synthesizeRecipe(batchId: string): Promise<void> {
  const repository = getRepository();
  const batch = await repository.getBatch(batchId);
  if (!batch) throw new Error("Batch not found.");
  const approved = batch.calibrationCandidates.filter((candidate) => candidate.decision === "approved");
  const rejected = batch.calibrationCandidates.filter((candidate) => candidate.decision === "rejected");
  if (approved.length < 5) throw new Error("Five approved calibration candidates are required.");
  await repository.setBatchStatus(batchId, "synthesizing");
  const synthesis = await synthesizePriorityPrompts(batch, approved, rejected, batch.approvals);
  if (batch.spec) await repository.saveSpec(batchId, { ...batch.spec, acceptanceRubric: synthesis.tightenedRubric, version: batch.spec.version + 1 });
  await repository.savePrompts(batchId, synthesis.prompts);
}
