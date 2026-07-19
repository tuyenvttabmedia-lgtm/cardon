-- Phase 6035.2b — KYC Center (account types, extended payload, NEED_MORE_INFO)

ALTER TYPE "AgentKycStatus" ADD VALUE 'NEED_MORE_INFO';

CREATE TYPE "AgentAccountType" AS ENUM ('PERSONAL', 'HOUSEHOLD', 'COMPANY');

ALTER TABLE "agent_kyc"
  ADD COLUMN IF NOT EXISTS "account_type" "AgentAccountType",
  ADD COLUMN IF NOT EXISTS "profile" JSONB,
  ADD COLUMN IF NOT EXISTS "documents" JSONB,
  ADD COLUMN IF NOT EXISTS "business_profile" JSONB,
  ADD COLUMN IF NOT EXISTS "review_note" VARCHAR(2000),
  ADD COLUMN IF NOT EXISTS "requested_fields" JSONB;

UPDATE "agent_kyc"
SET "account_type" = 'COMPANY'
WHERE "account_type" IS NULL;
