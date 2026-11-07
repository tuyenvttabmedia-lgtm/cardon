-- F3-B: PayPal Capture & Fee Reconciliation (additive). Does not alter payments/orders settle fields.

CREATE TYPE "PaypalReportImportSource" AS ENUM ('CSV', 'API');
CREATE TYPE "PaypalReportFormat" AS ENUM ('ACTIVITY_DOWNLOAD');
CREATE TYPE "PaypalReportImportStatus" AS ENUM ('PARSED', 'MATCHED', 'FAILED');
CREATE TYPE "PaypalReportLineKind" AS ENUM (
  'SALE_CAPTURE',
  'REFUND',
  'REVERSAL',
  'CHARGEBACK',
  'PAYOUT_OR_BALANCE',
  'FX',
  'NON_SETTLED',
  'OTHER'
);
CREATE TYPE "PaypalFeeMatchStatus" AS ENUM (
  'MATCHED',
  'AMOUNT_MISMATCH',
  'CURRENCY_MISMATCH',
  'MISSING_LOCAL',
  'MISSING_GATEWAY',
  'DUPLICATE_CSV',
  'NEEDS_REVIEW',
  'MANUAL_MATCHED',
  'NON_SALE'
);
CREATE TYPE "PaypalFeeMatchType" AS ENUM ('AUTO', 'MANUAL');

CREATE TABLE "paypal_report_imports" (
  "id" UUID NOT NULL,
  "source" "PaypalReportImportSource" NOT NULL DEFAULT 'CSV',
  "format" "PaypalReportFormat" NOT NULL DEFAULT 'ACTIVITY_DOWNLOAD',
  "period_from" TIMESTAMPTZ(6),
  "period_to" TIMESTAMPTZ(6),
  "original_filename" VARCHAR(255) NOT NULL,
  "file_hash" VARCHAR(64) NOT NULL,
  "file_content" BYTEA,
  "row_count" INTEGER NOT NULL DEFAULT 0,
  "sale_count" INTEGER NOT NULL DEFAULT 0,
  "non_sale_count" INTEGER NOT NULL DEFAULT 0,
  "status" "PaypalReportImportStatus" NOT NULL DEFAULT 'PARSED',
  "error_summary" VARCHAR(1024),
  "header_json" JSONB NOT NULL DEFAULT '[]',
  "header_provisional" BOOLEAN NOT NULL DEFAULT true,
  "imported_by" UUID NOT NULL,
  "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "paypal_report_imports_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "paypal_report_imports_file_hash_key" ON "paypal_report_imports"("file_hash");
CREATE INDEX "paypal_report_imports_created_at_idx" ON "paypal_report_imports"("created_at");
CREATE INDEX "paypal_report_imports_status_idx" ON "paypal_report_imports"("status");

CREATE TABLE "paypal_report_lines" (
  "id" UUID NOT NULL,
  "import_id" UUID NOT NULL,
  "kind" "PaypalReportLineKind" NOT NULL,
  "paypal_txn_id" VARCHAR(64) NOT NULL,
  "paypal_reference_id" VARCHAR(64),
  "custom_id" VARCHAR(256),
  "invoice_id" VARCHAR(128),
  "gross" DECIMAL(18,2) NOT NULL,
  "fee" DECIMAL(18,2) NOT NULL,
  "net" DECIMAL(18,2) NOT NULL,
  "currency" CHAR(3) NOT NULL,
  "txn_event_code" VARCHAR(16),
  "status_raw" VARCHAR(64),
  "type_raw" VARCHAR(128),
  "balance_impact" VARCHAR(32),
  "booked_at" TIMESTAMPTZ(6),
  "raw_json" JSONB NOT NULL DEFAULT '{}',
  "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "paypal_report_lines_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "paypal_report_lines_import_id_paypal_txn_id_kind_key"
  ON "paypal_report_lines"("import_id", "paypal_txn_id", "kind");
CREATE INDEX "paypal_report_lines_paypal_txn_id_idx" ON "paypal_report_lines"("paypal_txn_id");
CREATE INDEX "paypal_report_lines_custom_id_idx" ON "paypal_report_lines"("custom_id");
CREATE INDEX "paypal_report_lines_kind_idx" ON "paypal_report_lines"("kind");

CREATE TABLE "paypal_fee_matches" (
  "id" UUID NOT NULL,
  "payment_id" UUID,
  "report_line_id" UUID,
  "import_id" UUID NOT NULL,
  "match_status" "PaypalFeeMatchStatus" NOT NULL,
  "match_type" "PaypalFeeMatchType" NOT NULL DEFAULT 'AUTO',
  "is_active" BOOLEAN NOT NULL DEFAULT true,
  "gross_cardon" DECIMAL(18,2),
  "gross_paypal" DECIMAL(18,2),
  "fee_estimated" DECIMAL(18,2),
  "fee_actual" DECIMAL(18,2),
  "net_paypal" DECIMAL(18,2),
  "gross_delta" DECIMAL(18,2),
  "fee_delta" DECIMAL(18,2),
  "currency" CHAR(3) NOT NULL,
  "actor_id" UUID,
  "note" VARCHAR(512),
  "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updated_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "paypal_fee_matches_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "paypal_fee_matches_payment_id_is_active_idx" ON "paypal_fee_matches"("payment_id", "is_active");
CREATE INDEX "paypal_fee_matches_match_status_idx" ON "paypal_fee_matches"("match_status");
CREATE INDEX "paypal_fee_matches_import_id_idx" ON "paypal_fee_matches"("import_id");

-- One active reconciliation match per payment
CREATE UNIQUE INDEX "paypal_fee_matches_one_active_payment_uidx"
  ON "paypal_fee_matches"("payment_id")
  WHERE "is_active" = true AND "payment_id" IS NOT NULL;

ALTER TABLE "paypal_report_lines"
  ADD CONSTRAINT "paypal_report_lines_import_id_fkey"
  FOREIGN KEY ("import_id") REFERENCES "paypal_report_imports"("id")
  ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "paypal_fee_matches"
  ADD CONSTRAINT "paypal_fee_matches_payment_id_fkey"
  FOREIGN KEY ("payment_id") REFERENCES "payments"("id")
  ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "paypal_fee_matches"
  ADD CONSTRAINT "paypal_fee_matches_report_line_id_fkey"
  FOREIGN KEY ("report_line_id") REFERENCES "paypal_report_lines"("id")
  ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "paypal_fee_matches"
  ADD CONSTRAINT "paypal_fee_matches_import_id_fkey"
  FOREIGN KEY ("import_id") REFERENCES "paypal_report_imports"("id")
  ON DELETE CASCADE ON UPDATE CASCADE;
