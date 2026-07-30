-- Soft sandbox: separate sandbox credentials + balances; live API gated.
ALTER TABLE "agents"
  ADD COLUMN IF NOT EXISTS "sandbox_balance" DECIMAL(18, 2) NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS "sandbox_held_balance" DECIMAL(18, 2) NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS "sandbox_api_key_hash" VARCHAR(255),
  ADD COLUMN IF NOT EXISTS "sandbox_api_key_lookup" VARCHAR(64),
  ADD COLUMN IF NOT EXISTS "sandbox_secret_key_encrypted" TEXT,
  ADD COLUMN IF NOT EXISTS "live_api_enabled" BOOLEAN NOT NULL DEFAULT false;

CREATE UNIQUE INDEX IF NOT EXISTS "agents_sandbox_api_key_lookup_key"
  ON "agents"("sandbox_api_key_lookup");

-- Existing agents with live credentials keep production access.
UPDATE "agents"
SET "live_api_enabled" = true
WHERE "api_key_hash" IS NOT NULL
  AND "deleted_at" IS NULL;
