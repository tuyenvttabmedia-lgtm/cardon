-- Phase 5A.2 — Customer account profile fields
ALTER TABLE "users" ADD COLUMN IF NOT EXISTS "username" VARCHAR(32);
ALTER TABLE "users" ADD COLUMN IF NOT EXISTS "full_name" VARCHAR(128);
ALTER TABLE "users" ADD COLUMN IF NOT EXISTS "identity_number_enc" VARCHAR(512);
ALTER TABLE "users" ADD COLUMN IF NOT EXISTS "accepted_terms_at" TIMESTAMPTZ(6);

CREATE UNIQUE INDEX IF NOT EXISTS "users_username_key" ON "users"("username") WHERE "username" IS NOT NULL;
