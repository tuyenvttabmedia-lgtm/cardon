-- Phase 3B: indexed API key lookup for partner gateway auth
ALTER TABLE "agents" ADD COLUMN IF NOT EXISTS "api_key_lookup" VARCHAR(64);

CREATE UNIQUE INDEX IF NOT EXISTS "agents_api_key_lookup_key"
  ON "agents"("api_key_lookup")
  WHERE "api_key_lookup" IS NOT NULL;
