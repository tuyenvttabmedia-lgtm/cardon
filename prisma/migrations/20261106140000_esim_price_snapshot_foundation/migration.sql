-- Phase 1 eSIM price snapshot. Adds nullable columns and empty FX tables.
-- Does not UPDATE existing orders, payments, or quotes.

CREATE TYPE "FxRateSourceStatus" AS ENUM ('PENDING_APPROVAL', 'APPROVED', 'DISABLED');

CREATE TYPE "FxRateStatus" AS ENUM ('DRAFT', 'PENDING_REVIEW', 'EFFECTIVE', 'SUPERSEDED', 'REJECTED');

CREATE TABLE "fx_rate_sources" (
  "code" VARCHAR(32) NOT NULL,
  "status" "FxRateSourceStatus" NOT NULL DEFAULT 'PENDING_APPROVAL',
  "base_currency" CHAR(3) NOT NULL,
  "quote_currency" CHAR(3) NOT NULL,
  "max_staleness_seconds" INTEGER,
  "fetch_interval_seconds" INTEGER,
  "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updated_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "fx_rate_sources_pkey" PRIMARY KEY ("code")
);

CREATE TABLE "fx_rates" (
  "id" UUID NOT NULL DEFAULT gen_random_uuid(),
  "source_code" VARCHAR(32) NOT NULL,
  "rate" DECIMAL(18,8) NOT NULL,
  "effective_from" TIMESTAMPTZ(6) NOT NULL,
  "effective_to" TIMESTAMPTZ(6),
  "observed_at" TIMESTAMPTZ(6) NOT NULL,
  "published_by" UUID,
  "status" "FxRateStatus" NOT NULL DEFAULT 'DRAFT',
  "band_result" VARCHAR(32),
  "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "fx_rates_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "fx_rates_rate_positive" CHECK ("rate" > 0)
);

CREATE INDEX "fx_rates_source_code_status_idx" ON "fx_rates"("source_code", "status");

ALTER TABLE "fx_rates"
  ADD CONSTRAINT "fx_rates_source_code_fkey"
  FOREIGN KEY ("source_code") REFERENCES "fx_rate_sources"("code") ON DELETE RESTRICT ON UPDATE CASCADE;

CREATE UNIQUE INDEX "fx_rates_one_effective_per_source"
  ON "fx_rates"("source_code")
  WHERE "status" = 'EFFECTIVE';

ALTER TABLE "orders"
  ADD COLUMN "catalog_currency" CHAR(3),
  ADD COLUMN "catalog_amount" DECIMAL(18,2),
  ADD COLUMN "charge_currency" CHAR(3),
  ADD COLUMN "charge_amount" DECIMAL(18,2),
  ADD COLUMN "cost_currency" CHAR(3),
  ADD COLUMN "cost_amount" DECIMAL(18,4),
  ADD COLUMN "fx_rate_id" UUID,
  ADD COLUMN "fx_rate" DECIMAL(18,8),
  ADD COLUMN "fx_as_of" TIMESTAMPTZ(6),
  ADD COLUMN "esim_market" VARCHAR(8),
  ADD COLUMN "pricing_locked_at" TIMESTAMPTZ(6);

ALTER TABLE "orders"
  ADD CONSTRAINT "orders_catalog_snapshot_pair" CHECK (
    ("catalog_currency" IS NULL AND "catalog_amount" IS NULL)
    OR ("catalog_currency" = 'VND' AND "catalog_amount" IS NOT NULL)
  ),
  ADD CONSTRAINT "orders_charge_snapshot_pair" CHECK (
    ("charge_currency" IS NULL AND "charge_amount" IS NULL)
    OR ("charge_currency" IS NOT NULL AND "charge_amount" IS NOT NULL)
  );

ALTER TABLE "orders"
  ADD CONSTRAINT "orders_fx_rate_id_fkey"
  FOREIGN KEY ("fx_rate_id") REFERENCES "fx_rates"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "payments"
  ADD COLUMN "currency" CHAR(3),
  ADD COLUMN "product_lane" VARCHAR(16),
  ADD COLUMN "fx_rate_id" UUID;

ALTER TABLE "payments"
  ADD CONSTRAINT "payments_fx_rate_id_fkey"
  FOREIGN KEY ("fx_rate_id") REFERENCES "fx_rates"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

CREATE UNIQUE INDEX "payments_one_open_esim"
  ON "payments"("order_id")
  WHERE "product_lane" = 'ESIM'
    AND "status" IN ('PENDING', 'SUCCESS')
    AND "deleted_at" IS NULL;

ALTER TABLE "esim_order_quotes"
  ADD COLUMN "catalog_currency" CHAR(3),
  ADD COLUMN "catalog_unit_amount" DECIMAL(18,2),
  ADD COLUMN "cost_currency" CHAR(3),
  ADD COLUMN "cost_amount" DECIMAL(18,4),
  ADD COLUMN "charge_currency" CHAR(3),
  ADD COLUMN "charge_amount" DECIMAL(18,2),
  ADD COLUMN "fx_rate_id" UUID,
  ADD COLUMN "fx_rate" DECIMAL(18,8),
  ADD COLUMN "fx_as_of" TIMESTAMPTZ(6),
  ADD COLUMN "display_currency" CHAR(3),
  ADD COLUMN "snapshot_at" TIMESTAMPTZ(6);

ALTER TABLE "esim_order_quotes"
  ADD CONSTRAINT "esim_order_quotes_catalog_snapshot_pair" CHECK (
    ("catalog_currency" IS NULL AND "catalog_unit_amount" IS NULL)
    OR ("catalog_currency" = 'VND' AND "catalog_unit_amount" IS NOT NULL)
  ),
  ADD CONSTRAINT "esim_order_quotes_charge_snapshot_pair" CHECK (
    ("charge_currency" IS NULL AND "charge_amount" IS NULL)
    OR ("charge_currency" IS NOT NULL AND "charge_amount" IS NOT NULL)
  );

ALTER TABLE "esim_order_quotes"
  ADD CONSTRAINT "esim_order_quotes_fx_rate_id_fkey"
  FOREIGN KEY ("fx_rate_id") REFERENCES "fx_rates"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
