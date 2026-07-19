-- Phase 6O.22 — Provider runtime (Esale production)

ALTER TYPE "FulfillmentStatus" ADD VALUE IF NOT EXISTS 'NEED_MANUAL_REVIEW';

CREATE TYPE "ProviderBalanceStatus" AS ENUM ('NORMAL', 'LOW_BALANCE', 'ERROR');
CREATE TYPE "ProviderTransactionType" AS ENUM ('CARD', 'TOPUP', 'DATA');

CREATE TABLE "provider_balances" (
    "id" UUID NOT NULL,
    "provider_id" UUID NOT NULL,
    "balance" DECIMAL(18,2) NOT NULL DEFAULT 0,
    "currency" VARCHAR(8) NOT NULL DEFAULT 'VND',
    "last_sync_at" TIMESTAMPTZ(6),
    "status" "ProviderBalanceStatus" NOT NULL DEFAULT 'NORMAL',
    "low_balance_threshold" DECIMAL(18,2) NOT NULL DEFAULT 5000000,
    "last_error_message" TEXT,
    "last_error_at" TIMESTAMPTZ(6),
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(6) NOT NULL,

    CONSTRAINT "provider_balances_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "provider_balances_provider_id_key" ON "provider_balances"("provider_id");

ALTER TABLE "provider_balances"
  ADD CONSTRAINT "provider_balances_provider_id_fkey"
  FOREIGN KEY ("provider_id") REFERENCES "providers"("id") ON DELETE CASCADE ON UPDATE CASCADE;

INSERT INTO "provider_balances" ("id", "provider_id", "balance", "currency", "last_sync_at", "status", "low_balance_threshold", "updated_at")
SELECT gen_random_uuid(), p."id", p."balance", 'VND', p."last_balance_synced_at", 'NORMAL', 5000000, CURRENT_TIMESTAMP
FROM "providers" p
WHERE p."deleted_at" IS NULL
  AND NOT EXISTS (
    SELECT 1 FROM "provider_balances" pb WHERE pb."provider_id" = p."id"
  );

ALTER TABLE "provider_balances" ADD COLUMN IF NOT EXISTS "alert_admin_enabled" BOOLEAN NOT NULL DEFAULT true;
ALTER TABLE "provider_balances" ADD COLUMN IF NOT EXISTS "alert_telegram_enabled" BOOLEAN NOT NULL DEFAULT false;
ALTER TABLE "provider_balances" ADD COLUMN IF NOT EXISTS "alert_email_enabled" BOOLEAN NOT NULL DEFAULT true;

ALTER TABLE "provider_transactions" ADD COLUMN IF NOT EXISTS "order_item_id" UUID;
ALTER TABLE "provider_transactions" ADD COLUMN IF NOT EXISTS "type" "ProviderTransactionType";
ALTER TABLE "provider_transactions" ADD COLUMN IF NOT EXISTS "face_value" DECIMAL(18,2);
ALTER TABLE "provider_transactions" ADD COLUMN IF NOT EXISTS "provider_cost" DECIMAL(18,2);
ALTER TABLE "provider_transactions" ADD COLUMN IF NOT EXISTS "error_code" VARCHAR(64);
ALTER TABLE "provider_transactions" ADD COLUMN IF NOT EXISTS "error_message" TEXT;
ALTER TABLE "provider_transactions" ADD COLUMN IF NOT EXISTS "completed_at" TIMESTAMPTZ(6);

CREATE INDEX IF NOT EXISTS "provider_transactions_order_item_id_idx" ON "provider_transactions"("order_item_id");
