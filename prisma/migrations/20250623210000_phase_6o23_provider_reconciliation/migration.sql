-- Phase 6O.23 — Provider reconciliation & operations

ALTER TYPE "ProviderStatus" ADD VALUE IF NOT EXISTS 'DEGRADED';

CREATE TYPE "ProviderReconciliationStatus" AS ENUM ('MATCHED', 'DIFFERENCE', 'NEED_CHECK');
CREATE TYPE "ProviderOperationalStatus" AS ENUM ('ONLINE', 'SLOW', 'ERROR');

CREATE TABLE "provider_reconciliation_reports" (
    "id" UUID NOT NULL,
    "provider_id" UUID NOT NULL,
    "report_date" DATE NOT NULL,
    "opening_balance" DECIMAL(18,2) NOT NULL,
    "closing_balance" DECIMAL(18,2),
    "total_transactions" INTEGER NOT NULL DEFAULT 0,
    "success_transactions" INTEGER NOT NULL DEFAULT 0,
    "failed_transactions" INTEGER NOT NULL DEFAULT 0,
    "total_provider_cost" DECIMAL(18,2) NOT NULL DEFAULT 0,
    "expected_balance" DECIMAL(18,2) NOT NULL,
    "actual_balance" DECIMAL(18,2),
    "difference_amount" DECIMAL(18,2) NOT NULL DEFAULT 0,
    "status" "ProviderReconciliationStatus" NOT NULL DEFAULT 'NEED_CHECK',
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(6) NOT NULL,

    CONSTRAINT "provider_reconciliation_reports_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "provider_reconciliation_reports_provider_id_report_date_key"
  ON "provider_reconciliation_reports"("provider_id", "report_date");
CREATE INDEX "provider_reconciliation_reports_report_date_idx"
  ON "provider_reconciliation_reports"("report_date");

ALTER TABLE "provider_reconciliation_reports"
  ADD CONSTRAINT "provider_reconciliation_reports_provider_id_fkey"
  FOREIGN KEY ("provider_id") REFERENCES "providers"("id") ON DELETE CASCADE ON UPDATE CASCADE;

CREATE TABLE "provider_cost_histories" (
    "id" UUID NOT NULL,
    "provider_id" UUID NOT NULL,
    "variant_id" UUID NOT NULL,
    "old_cost" DECIMAL(18,2) NOT NULL,
    "new_cost" DECIMAL(18,2) NOT NULL,
    "changed_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "provider_cost_histories_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "provider_cost_histories_provider_id_changed_at_idx"
  ON "provider_cost_histories"("provider_id", "changed_at");
CREATE INDEX "provider_cost_histories_variant_id_idx"
  ON "provider_cost_histories"("variant_id");

ALTER TABLE "provider_cost_histories"
  ADD CONSTRAINT "provider_cost_histories_provider_id_fkey"
  FOREIGN KEY ("provider_id") REFERENCES "providers"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "provider_cost_histories"
  ADD CONSTRAINT "provider_cost_histories_variant_id_fkey"
  FOREIGN KEY ("variant_id") REFERENCES "product_variants"("id") ON DELETE CASCADE ON UPDATE CASCADE;

CREATE TABLE "provider_health_metrics" (
    "id" UUID NOT NULL,
    "provider_id" UUID NOT NULL,
    "success_rate" DECIMAL(8,4) NOT NULL DEFAULT 100,
    "error_rate" DECIMAL(8,4) NOT NULL DEFAULT 0,
    "avg_latency_ms" INTEGER NOT NULL DEFAULT 0,
    "sample_size" INTEGER NOT NULL DEFAULT 0,
    "operational_status" "ProviderOperationalStatus" NOT NULL DEFAULT 'ONLINE',
    "last_error_message" TEXT,
    "last_error_at" TIMESTAMPTZ(6),
    "updated_at" TIMESTAMPTZ(6) NOT NULL,

    CONSTRAINT "provider_health_metrics_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "provider_health_metrics_provider_id_key"
  ON "provider_health_metrics"("provider_id");

ALTER TABLE "provider_health_metrics"
  ADD CONSTRAINT "provider_health_metrics_provider_id_fkey"
  FOREIGN KEY ("provider_id") REFERENCES "providers"("id") ON DELETE CASCADE ON UPDATE CASCADE;
