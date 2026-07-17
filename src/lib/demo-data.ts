import type {
  Approval,
  Asset,
  Batch,
  CalibrationCandidate,
  CreativeSpec,
  PriorityPrompt,
} from "@/lib/types";

const iso = (offsetMinutes = 0) => new Date(Date.now() + offsetMinutes * 60_000).toISOString();

const sources = [
  "/demo/source-sneaker.svg",
  "/demo/source-bottle.svg",
  "/demo/source-watch.svg",
  "/demo/source-bag.svg",
];

const outputs = [
  "/demo/scene-sneaker.svg",
  "/demo/scene-bottle.svg",
  "/demo/scene-watch.svg",
  "/demo/scene-bag.svg",
];

export const demoSpec: CreativeSpec = {
  assetType: "sku_lifestyle",
  objective: "Place each product in a warm, editorial studio scene while preserving every product detail.",
  aspectRatios: ["4:5", "1:1"],
  variantsPerAsset: 1,
  subjectConstraints: [
    "Preserve product geometry, color, logos, labels, and materials",
    "Keep the complete product visible with comfortable edge spacing",
    "Do not add accessories that could be mistaken for included items",
  ],
  styleTokens: ["warm editorial", "quiet luxury", "directional window light", "textured stone", "deep soft shadows"],
  brandPalette: ["#17171B", "#B99D81", "#E8DED1", "#7468FF"],
  negativeConstraints: ["plastic CGI sheen", "distorted typography", "clipped product", "cool blue cast", "busy props"],
  acceptanceRubric: [
    { id: "fidelity", label: "Product fidelity", description: "Geometry, identity, color, and markings match the source.", weight: 0.35, minimumScore: 88 },
    { id: "composition", label: "Composition", description: "Product is dominant, balanced, and marketplace-safe.", weight: 0.2, minimumScore: 78 },
    { id: "light", label: "Light & shadow", description: "Lighting is plausible and consistent with the approved look.", weight: 0.15, minimumScore: 75 },
    { id: "style", label: "Brand style", description: "Palette and mood align with approved calibration images.", weight: 0.2, minimumScore: 80 },
    { id: "technical", label: "Technical quality", description: "No artifacts, warped text, halos, or unintended cropping.", weight: 0.1, minimumScore: 82 },
  ],
  version: 2,
};

export const demoPrompts: PriorityPrompt[] = [
  {
    id: "prompt-1",
    batchId: "demo-autumn-drop",
    rank: 1,
    prompt: "Preserve the product exactly. Place it in a restrained warm editorial studio with matte stone, directional late-afternoon window light, deep feathered shadow, subtle taupe gradient, premium campaign photography, product fully visible and optically sharp.",
    rationale: "Best match for all five approvals: warm stone, strong subject isolation, and a repeatable left-to-right key light.",
    negativePrompt: "cool cast, glossy CGI, warped logo, extra product parts, busy props, cropped edges",
    params: { guidance_scale: 5, num_inference_steps: 28, image_size: "portrait_4_3" },
    wins: 7,
    uses: 9,
    winRate: 77.8,
  },
  {
    id: "prompt-2",
    batchId: "demo-autumn-drop",
    rank: 2,
    prompt: "Keep the source product pixel-faithful. Build a quiet luxury still life on lightly textured plaster, warm neutral bounce light, subtle botanical shadow, restrained depth of field, catalogue-clean silhouette.",
    rationale: "Fallback for reflective or translucent products where P1's stronger shadow can obscure edge detail.",
    negativePrompt: "hard specular clipping, plant covering product, altered label, excessive blur",
    params: { guidance_scale: 4.5, num_inference_steps: 32, image_size: "portrait_4_3" },
    wins: 3,
    uses: 5,
    winRate: 60,
  },
  {
    id: "prompt-3",
    batchId: "demo-autumn-drop",
    rank: 3,
    prompt: "Re-stage the unchanged product on a minimal dark-to-warm studio sweep with a single large softbox, realistic contact shadow, premium marketplace photography, no decorative objects.",
    rationale: "Clean recovery strategy when scene props or style transfer reduce product fidelity.",
    negativePrompt: "props, text changes, floating object, colored rim light, low contrast product",
    params: { guidance_scale: 4, num_inference_steps: 30, image_size: "portrait_4_3" },
    wins: 1,
    uses: 3,
    winRate: 33.3,
  },
];

function makeAttempt(assetId: string, index: number, score: number, promptRank = 1) {
  const passed = score >= 80;
  const id = `attempt-${assetId}-${index}`;
  return {
    id,
    assetId,
    number: index,
    promptId: `prompt-${promptRank}`,
    promptRank,
    prompt: demoPrompts[promptRank - 1]?.prompt ?? demoPrompts[0]!.prompt,
    params: { guidance_scale: 5, seed: 4182 + index },
    outputUrl: outputs[(Number(assetId.split("-").at(-1)) || 1) % outputs.length],
    providerRequestId: `fal_demo_${assetId}_${index}`,
    status: passed ? ("passed" as const) : ("failed" as const),
    cost: 0.018,
    qcResult: {
      id: `qc-${assetId}-${index}`,
      attemptId: id,
      passed,
      overallScore: score,
      scores: {
        productFidelity: Math.min(98, score + 4),
        composition: Math.max(68, score - 1),
        lighting: Math.min(96, score + 2),
        brandStyle: score,
        technicalQuality: Math.max(72, score - 2),
      },
      similarity: Math.min(0.96, score / 100 + 0.04),
      feedback: passed
        ? "Product identity is intact and the warm editorial treatment matches the approved calibration set. Contact shadow and edge separation are convincing."
        : "The background is slightly cool and the right edge loses separation. Warm the sweep, restore a softer contact shadow, and preserve the label at source sharpness.",
      corrections: passed ? [] : ["Warm background by approximately 8%", "Restore right-edge separation", "Keep label texture unchanged"],
      confidence: 0.93,
      createdAt: iso(-30 + index),
    },
    createdAt: iso(-35 + index),
  };
}

function makeAssets(): Asset[] {
  const names = ["Cloud Runner", "Kin Botanical", "Midnight Arc", "Atelier Tote", "Cloud Runner — Clay", "Kin Night Serum", "Arc Steel", "Atelier Mini", "Cloud Runner — Bone", "Kin Daily Wash", "Arc Graphite", "Atelier Carryall"];
  const states: Asset["status"][] = ["passed", "passed", "qc", "generating", "passed", "needs_review", "queued", "passed", "queued", "passed", "queued", "passed"];
  const scores = [94, 91, 86, 0, 89, 74, 0, 96, 0, 87, 0, 92];
  return names.map((name, index) => {
    const id = `asset-${index + 1}`;
    const status = states[index] ?? "queued";
    const score = scores[index] ?? 0;
    const attempts = status === "queued" || status === "generating" ? [] : status === "needs_review" ? [makeAttempt(id, 1, 68), makeAttempt(id, 2, 74, 2)] : [makeAttempt(id, 1, score)];
    return {
      id,
      batchId: "demo-autumn-drop",
      sku: `FW26-${String(index + 1).padStart(3, "0")}`,
      name,
      aspectRatio: index % 2 === 0 ? "4:5" : "1:1",
      sourceUrl: sources[index % sources.length]!,
      outputUrl: status === "queued" ? undefined : outputs[index % outputs.length]!,
      status,
      attempts,
      winningPromptRank: status === "passed" ? 1 : undefined,
      qcScore: score || undefined,
      similarity: score ? Math.min(0.96, score / 100 + 0.03) : undefined,
      failureReason: status === "needs_review" ? "Attempt cap reached after persistent label distortion." : undefined,
      updatedAt: iso(-index * 2),
    };
  });
}

function makeCandidates(): CalibrationCandidate[] {
  return Array.from({ length: 7 }, (_, index) => ({
    id: `candidate-${index + 1}`,
    batchId: "demo-autumn-drop",
    assetId: `asset-${(index % 4) + 1}`,
    sourceUrl: sources[index % sources.length]!,
    outputUrl: outputs[index % outputs.length]!,
    prompt: `Calibration direction ${index + 1}: warm editorial studio, exact product preservation, controlled contact shadow.`,
    decision: index < 5 ? ("approved" as const) : undefined,
    createdAt: iso(-90 + index),
  }));
}

function makeApprovals(candidates: CalibrationCandidate[]): Approval[] {
  return candidates.slice(0, 5).map((candidate, index) => ({
    id: `approval-${index + 1}`,
    batchId: candidate.batchId,
    assetId: candidate.assetId,
    candidateId: candidate.id,
    approved: true,
    createdAt: iso(-80 + index),
  }));
}

export function createDemoBatch(): Batch {
  const candidates = makeCandidates();
  return {
    id: "demo-autumn-drop",
    name: "Autumn Studio Drop",
    prompt: "Turn every product into a warm, premium editorial still life. Preserve the product perfectly; use textured stone, taupe gradients, directional window light, and deep soft shadows.",
    status: "autonomous_running",
    assetType: "sku_lifestyle",
    aspectRatios: ["4:5", "1:1"],
    variantsPerAsset: 1,
    settings: { costCap: 5, assetCostCap: 0.5, maxAttempts: 5, feedbackRetries: 2, qcPassScore: 80 },
    costSpent: 0.48,
    createdAt: iso(-180),
    updatedAt: iso(-2),
    spec: demoSpec,
    references: [
      { id: "ref-1", type: "image", name: "Warm stone campaign", url: "/demo/scene-bottle.svg", styleTokens: ["warm stone", "soft shadow"] },
      { id: "ref-2", type: "image", name: "Deep studio sweep", url: "/demo/scene-watch.svg", styleTokens: ["deep gradient", "quiet luxury"] },
    ],
    assets: makeAssets(),
    calibrationCandidates: candidates,
    approvals: makeApprovals(candidates),
    priorityPrompts: demoPrompts,
  };
}

export function createCompletedDemoBatch(): Batch {
  const batch = createDemoBatch();
  return {
    ...batch,
    id: "demo-ceramic-essentials",
    name: "Ceramic Essentials",
    status: "done",
    costSpent: 0.71,
    completedAt: iso(-45),
    updatedAt: iso(-45),
    assets: batch.assets.slice(0, 8).map((asset, index) => {
      const score = index === 5 ? 74 : 89 + (index % 7);
      const status: Asset["status"] = index === 5 ? "needs_review" : "delivered";
      return {
        ...asset,
        id: `ceramic-${index + 1}`,
        batchId: "demo-ceramic-essentials",
        status,
        outputUrl: outputs[index % outputs.length]!,
        qcScore: score,
        similarity: Math.min(0.97, score / 100 + 0.03),
        winningPromptRank: status === "delivered" ? 1 : undefined,
      };
    }),
    calibrationCandidates: [],
    approvals: [],
    priorityPrompts: batch.priorityPrompts.map((prompt) => ({ ...prompt, batchId: "demo-ceramic-essentials" })),
  };
}

export const demoImageSources = { sources, outputs };
