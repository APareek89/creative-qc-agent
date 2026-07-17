import {
  boolean,
  doublePrecision,
  index,
  integer,
  jsonb,
  pgEnum,
  pgTable,
  text,
  timestamp,
  uniqueIndex,
  uuid,
} from "drizzle-orm/pg-core";
import type { CreativeSpec, QcScores } from "@/lib/types";

export const batchStatusEnum = pgEnum("batch_status", [
  "draft",
  "calibrating",
  "synthesizing",
  "ready",
  "autonomous_running",
  "done",
  "failed",
]);

export const assetStatusEnum = pgEnum("asset_status", [
  "queued",
  "generating",
  "qc",
  "passed",
  "failed",
  "needs_review",
  "approved",
  "delivered",
]);

export const batches = pgTable(
  "batches",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    user: text("user_id").notNull().default("portfolio-user"),
    name: text("name").notNull(),
    prompt: text("prompt").notNull(),
    assetType: text("asset_type").notNull(),
    aspectRatios: jsonb("aspect_ratios").$type<string[]>().notNull().default([]),
    variantsPerAsset: integer("variants_per_asset").notNull().default(1),
    specJson: jsonb("spec_json").$type<CreativeSpec>(),
    status: batchStatusEnum("status").notNull().default("draft"),
    costCap: doublePrecision("cost_cap").notNull().default(5),
    assetCostCap: doublePrecision("asset_cost_cap").notNull().default(0.5),
    costSpent: doublePrecision("cost_spent").notNull().default(0),
    maxAttempts: integer("max_attempts").notNull().default(5),
    feedbackRetries: integer("feedback_retries").notNull().default(2),
    qcPassScore: integer("qc_pass_score").notNull().default(80),
    errorJson: jsonb("error_json"),
    startedAt: timestamp("started_at", { withTimezone: true }),
    completedAt: timestamp("completed_at", { withTimezone: true }),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [index("batches_status_idx").on(table.status)],
);

export const references = pgTable(
  "references",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    batchId: uuid("batch_id").notNull().references(() => batches.id, { onDelete: "cascade" }),
    type: text("type").notNull(),
    name: text("name").notNull(),
    url: text("url").notNull(),
    styleTokens: jsonb("style_tokens").$type<string[]>().notNull().default([]),
  },
  (table) => [index("references_batch_idx").on(table.batchId)],
);

export const assets = pgTable(
  "assets",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    batchId: uuid("batch_id").notNull().references(() => batches.id, { onDelete: "cascade" }),
    sku: text("sku").notNull(),
    name: text("name").notNull(),
    aspectRatio: text("aspect_ratio").notNull().default("1:1"),
    sourceUrl: text("source_url").notNull(),
    outputUrl: text("output_url"),
    status: assetStatusEnum("status").notNull().default("queued"),
    winningPromptRank: integer("winning_prompt_rank"),
    qcScore: doublePrecision("qc_score"),
    similarity: doublePrecision("similarity"),
    failureReason: text("failure_reason"),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [index("assets_batch_status_idx").on(table.batchId, table.status)],
);

export const attempts = pgTable(
  "attempts",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    assetId: uuid("asset_id").notNull().references(() => assets.id, { onDelete: "cascade" }),
    number: integer("number").notNull(),
    promptId: uuid("prompt_id"),
    promptRank: integer("prompt_rank").notNull(),
    prompt: text("prompt").notNull(),
    params: jsonb("params").$type<Record<string, string | number | boolean>>().notNull().default({}),
    outputUrl: text("output_url"),
    providerRequestId: text("provider_request_id"),
    status: text("status").notNull(),
    cost: doublePrecision("cost").notNull().default(0),
    failureReason: text("failure_reason"),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [
    uniqueIndex("attempt_asset_number_idx").on(table.assetId, table.number),
    index("attempt_asset_idx").on(table.assetId),
  ],
);

export const qcResults = pgTable(
  "qc_results",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    attemptId: uuid("attempt_id").notNull().references(() => attempts.id, { onDelete: "cascade" }),
    passed: boolean("passed").notNull(),
    overallScore: doublePrecision("overall_score").notNull(),
    scoresJson: jsonb("scores_json").$type<QcScores>().notNull(),
    similarity: doublePrecision("similarity").notNull(),
    feedback: text("feedback").notNull(),
    corrections: jsonb("corrections").$type<string[]>().notNull().default([]),
    confidence: doublePrecision("confidence").notNull(),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [uniqueIndex("qc_attempt_idx").on(table.attemptId)],
);

export const priorityPrompts = pgTable(
  "priority_prompts",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    batchId: uuid("batch_id").notNull().references(() => batches.id, { onDelete: "cascade" }),
    rank: integer("rank").notNull(),
    prompt: text("prompt").notNull(),
    rationale: text("rationale").notNull(),
    negativePrompt: text("negative_prompt").notNull().default(""),
    params: jsonb("params").$type<Record<string, string | number | boolean>>().notNull().default({}),
    wins: integer("wins").notNull().default(0),
    uses: integer("uses").notNull().default(0),
  },
  (table) => [uniqueIndex("prompt_batch_rank_idx").on(table.batchId, table.rank)],
);

export const approvals = pgTable(
  "approvals",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    batchId: uuid("batch_id").notNull().references(() => batches.id, { onDelete: "cascade" }),
    assetId: uuid("asset_id").notNull().references(() => assets.id, { onDelete: "cascade" }),
    candidateId: uuid("candidate_id").notNull(),
    approved: boolean("approved").notNull(),
    note: text("note"),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [uniqueIndex("approval_candidate_idx").on(table.candidateId)],
);

export const calibrationCandidates = pgTable(
  "calibration_candidates",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    batchId: uuid("batch_id").notNull().references(() => batches.id, { onDelete: "cascade" }),
    assetId: uuid("asset_id").notNull().references(() => assets.id, { onDelete: "cascade" }),
    sourceUrl: text("source_url").notNull(),
    outputUrl: text("output_url").notNull(),
    prompt: text("prompt").notNull(),
    decision: text("decision"),
    note: text("note"),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [index("candidate_batch_idx").on(table.batchId)],
);
