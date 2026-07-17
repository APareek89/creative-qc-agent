export const ASSET_STATUSES = [
  "queued",
  "generating",
  "qc",
  "passed",
  "failed",
  "needs_review",
  "approved",
  "delivered",
] as const;

export type AssetStatus = (typeof ASSET_STATUSES)[number];

export const BATCH_STATUSES = [
  "draft",
  "calibrating",
  "synthesizing",
  "ready",
  "autonomous_running",
  "done",
  "failed",
] as const;

export type BatchStatus = (typeof BATCH_STATUSES)[number];
export type AssetType = "multi_view" | "sku_lifestyle";
export type ApprovalDecision = "approved" | "rejected";

export interface AcceptanceCriterion {
  id: string;
  label: string;
  description: string;
  weight: number;
  minimumScore: number;
}

export interface CreativeSpec {
  assetType: AssetType;
  objective: string;
  aspectRatios: string[];
  variantsPerAsset: number;
  subjectConstraints: string[];
  styleTokens: string[];
  brandPalette: string[];
  negativeConstraints: string[];
  acceptanceRubric: AcceptanceCriterion[];
  version: number;
}

export interface ReferenceAsset {
  id: string;
  type: "image" | "video";
  url: string;
  name: string;
  styleTokens: string[];
}

export interface QcScores {
  productFidelity: number;
  composition: number;
  lighting: number;
  brandStyle: number;
  technicalQuality: number;
}

export interface QcResult {
  id: string;
  attemptId: string;
  passed: boolean;
  overallScore: number;
  scores: QcScores;
  similarity: number;
  feedback: string;
  corrections: string[];
  confidence: number;
  createdAt: string;
}

export interface Attempt {
  id: string;
  assetId: string;
  number: number;
  promptId: string;
  promptRank: number;
  prompt: string;
  params: Record<string, string | number | boolean>;
  outputUrl?: string;
  providerRequestId?: string;
  status: "generating" | "qc" | "passed" | "failed";
  cost: number;
  failureReason?: string;
  qcResult?: QcResult;
  createdAt: string;
}

export interface Asset {
  id: string;
  batchId: string;
  sku: string;
  name: string;
  aspectRatio: string;
  sourceUrl: string;
  outputUrl?: string;
  status: AssetStatus;
  attempts: Attempt[];
  winningPromptRank?: number;
  qcScore?: number;
  similarity?: number;
  failureReason?: string;
  updatedAt: string;
}

export interface CalibrationCandidate {
  id: string;
  batchId: string;
  assetId: string;
  sourceUrl: string;
  outputUrl: string;
  prompt: string;
  decision?: ApprovalDecision;
  note?: string;
  createdAt: string;
}

export interface PriorityPrompt {
  id: string;
  batchId: string;
  rank: number;
  prompt: string;
  rationale: string;
  negativePrompt: string;
  params: Record<string, string | number | boolean>;
  wins: number;
  uses: number;
  winRate: number;
}

export interface Approval {
  id: string;
  batchId: string;
  assetId: string;
  candidateId: string;
  approved: boolean;
  note?: string;
  createdAt: string;
}

export interface BatchSettings {
  costCap: number;
  assetCostCap: number;
  maxAttempts: number;
  feedbackRetries: number;
  qcPassScore: number;
}

export interface Batch {
  id: string;
  name: string;
  prompt: string;
  status: BatchStatus;
  assetType: AssetType;
  aspectRatios: string[];
  variantsPerAsset: number;
  settings: BatchSettings;
  costSpent: number;
  createdAt: string;
  updatedAt: string;
  spec?: CreativeSpec;
  references: ReferenceAsset[];
  assets: Asset[];
  calibrationCandidates: CalibrationCandidate[];
  approvals: Approval[];
  priorityPrompts: PriorityPrompt[];
  startedAt?: string;
  completedAt?: string;
  error?: { provider: string; message: string; retryable: boolean };
}

export interface BatchListItem {
  id: string;
  name: string;
  status: BatchStatus;
  assetType: AssetType;
  totalAssets: number;
  passedAssets: number;
  reviewAssets: number;
  costSpent: number;
  costCap: number;
  coverUrl: string;
  updatedAt: string;
}

export interface DashboardData {
  batches: BatchListItem[];
  totalAssets: number;
  autoPassRate: number;
  estimatedHoursSaved: number;
  totalSpend: number;
}

export interface BatchCreateInput {
  name: string;
  prompt: string;
  assetType: AssetType;
  aspectRatios: string[];
  variantsPerAsset: number;
  costCap: number;
}

export interface ApprovalInput {
  candidateId: string;
  decision: ApprovalDecision;
  note?: string;
}

export interface RuntimeHealth {
  mode: "demo" | "live";
  web: "ok";
  database: "ok" | "missing" | "error";
  redis: "ok" | "missing" | "error";
  storage: "ok" | "missing" | "error";
  gemini: "ok" | "missing" | "error";
  fal: "ok" | "missing" | "error";
}

export function isRuntimeHealthy(health: RuntimeHealth): boolean {
  return health.mode === "live" && [health.database, health.redis, health.storage, health.gemini, health.fal].every((status) => status === "ok");
}

export function getBatchCounts(batch: Batch): Record<AssetStatus, number> {
  return ASSET_STATUSES.reduce<Record<AssetStatus, number>>(
    (counts, status) => ({
      ...counts,
      [status]: batch.assets.filter((asset) => asset.status === status).length,
    }),
    {
      queued: 0,
      generating: 0,
      qc: 0,
      passed: 0,
      failed: 0,
      needs_review: 0,
      approved: 0,
      delivered: 0,
    },
  );
}

export function isTerminalStatus(status: AssetStatus): boolean {
  return ["passed", "failed", "needs_review", "approved", "delivered"].includes(status);
}
