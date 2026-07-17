DO $$ BEGIN
  CREATE TYPE batch_status AS ENUM ('draft','calibrating','synthesizing','ready','autonomous_running','done','failed');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN
  CREATE TYPE asset_status AS ENUM ('queued','generating','qc','passed','failed','needs_review','approved','delivered');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

CREATE TABLE IF NOT EXISTS batches (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(), user_id text NOT NULL DEFAULT 'portfolio-user', name text NOT NULL,
  prompt text NOT NULL, asset_type text NOT NULL, aspect_ratios jsonb NOT NULL DEFAULT '[]'::jsonb,
  variants_per_asset integer NOT NULL DEFAULT 1, spec_json jsonb, status batch_status NOT NULL DEFAULT 'draft',
  cost_cap double precision NOT NULL DEFAULT 5, asset_cost_cap double precision NOT NULL DEFAULT 0.5, cost_spent double precision NOT NULL DEFAULT 0,
  max_attempts integer NOT NULL DEFAULT 5, feedback_retries integer NOT NULL DEFAULT 2, qc_pass_score integer NOT NULL DEFAULT 80,
  error_json jsonb, started_at timestamptz, completed_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(), updated_at timestamptz NOT NULL DEFAULT now()
);
ALTER TABLE batches ADD COLUMN IF NOT EXISTS asset_cost_cap double precision NOT NULL DEFAULT 0.5;
CREATE INDEX IF NOT EXISTS batches_status_idx ON batches(status);

CREATE TABLE IF NOT EXISTS "references" (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(), batch_id uuid NOT NULL REFERENCES batches(id) ON DELETE CASCADE,
  type text NOT NULL, name text NOT NULL, url text NOT NULL, style_tokens jsonb NOT NULL DEFAULT '[]'::jsonb
);
CREATE INDEX IF NOT EXISTS references_batch_idx ON "references"(batch_id);

CREATE TABLE IF NOT EXISTS assets (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(), batch_id uuid NOT NULL REFERENCES batches(id) ON DELETE CASCADE,
  sku text NOT NULL, name text NOT NULL, aspect_ratio text NOT NULL DEFAULT '1:1', source_url text NOT NULL, output_url text,
  status asset_status NOT NULL DEFAULT 'queued', winning_prompt_rank integer, qc_score double precision,
  similarity double precision, failure_reason text, created_at timestamptz NOT NULL DEFAULT now(), updated_at timestamptz NOT NULL DEFAULT now()
);
ALTER TABLE assets ADD COLUMN IF NOT EXISTS aspect_ratio text NOT NULL DEFAULT '1:1';
CREATE INDEX IF NOT EXISTS assets_batch_status_idx ON assets(batch_id,status);

CREATE TABLE IF NOT EXISTS attempts (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(), asset_id uuid NOT NULL REFERENCES assets(id) ON DELETE CASCADE,
  number integer NOT NULL, prompt_id uuid, prompt_rank integer NOT NULL, prompt text NOT NULL,
  params jsonb NOT NULL DEFAULT '{}'::jsonb, output_url text, provider_request_id text, status text NOT NULL,
  cost double precision NOT NULL DEFAULT 0, failure_reason text, created_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT attempt_asset_number_idx UNIQUE(asset_id,number)
);
CREATE INDEX IF NOT EXISTS attempt_asset_idx ON attempts(asset_id);

CREATE TABLE IF NOT EXISTS qc_results (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(), attempt_id uuid NOT NULL UNIQUE REFERENCES attempts(id) ON DELETE CASCADE,
  passed boolean NOT NULL, overall_score double precision NOT NULL, scores_json jsonb NOT NULL,
  similarity double precision NOT NULL, feedback text NOT NULL, corrections jsonb NOT NULL DEFAULT '[]'::jsonb,
  confidence double precision NOT NULL, created_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS priority_prompts (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(), batch_id uuid NOT NULL REFERENCES batches(id) ON DELETE CASCADE,
  rank integer NOT NULL, prompt text NOT NULL, rationale text NOT NULL, negative_prompt text NOT NULL DEFAULT '',
  params jsonb NOT NULL DEFAULT '{}'::jsonb, wins integer NOT NULL DEFAULT 0, uses integer NOT NULL DEFAULT 0,
  CONSTRAINT prompt_batch_rank_idx UNIQUE(batch_id,rank)
);

CREATE TABLE IF NOT EXISTS approvals (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(), batch_id uuid NOT NULL REFERENCES batches(id) ON DELETE CASCADE,
  asset_id uuid NOT NULL REFERENCES assets(id) ON DELETE CASCADE, candidate_id uuid NOT NULL UNIQUE,
  approved boolean NOT NULL, note text, created_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS calibration_candidates (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(), batch_id uuid NOT NULL REFERENCES batches(id) ON DELETE CASCADE,
  asset_id uuid NOT NULL REFERENCES assets(id) ON DELETE CASCADE, source_url text NOT NULL, output_url text NOT NULL,
  prompt text NOT NULL, decision text, note text, created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS candidate_batch_idx ON calibration_candidates(batch_id);
