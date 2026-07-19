-- Phase 2F.3: Persist eSale transaction metadata for worker restart recovery

ALTER TYPE "ProviderTransactionStatus" ADD VALUE IF NOT EXISTS 'PROCESSING';

ALTER TABLE "provider_transactions"
  ADD COLUMN IF NOT EXISTS "provider_transaction_date" VARCHAR(32),
  ADD COLUMN IF NOT EXISTS "provider_metadata" JSONB NOT NULL DEFAULT '{}';
