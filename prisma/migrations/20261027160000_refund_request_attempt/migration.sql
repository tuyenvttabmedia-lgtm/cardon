-- REFUND-02: additive refund request/attempt tables. No order/payment data changes.
CREATE TYPE "RefundRequestStatus" AS ENUM (
  'REQUESTED',
  'APPROVED',
  'PROCESSING',
  'SUCCEEDED',
  'MANUAL_REVIEW',
  'CANCELLED'
);

CREATE TYPE "RefundAttemptStatus" AS ENUM (
  'SENT',
  'SUCCEEDED',
  'FAILED',
  'UNCONFIRMED'
);

CREATE TYPE "RefundReconStatus" AS ENUM (
  'PENDING_VERIFY',
  'VERIFIED',
  'REJECTED'
);

CREATE TYPE "RefundIntendedMethod" AS ENUM (
  'BANK_PAYOUT',
  'SEPAY_PG_VOID',
  'SEPAY_PG_REFUND',
  'PAYPAL_REFUND',
  'MANUAL_OTHER'
);

CREATE TYPE "RefundEsimGate" AS ENUM (
  'NONE',
  'CREATE_UNCLEAR',
  'HAS_REFERENCE',
  'ISSUED'
);

CREATE TYPE "RefundCurrency" AS ENUM ('VND', 'USD');

CREATE TABLE "refund_requests" (
  "id" UUID NOT NULL,
  "order_id" UUID NOT NULL,
  "payment_id" UUID NOT NULL,
  "amount" DECIMAL(18,2) NOT NULL,
  "currency" "RefundCurrency" NOT NULL,
  "reason" VARCHAR(512) NOT NULL,
  "status" "RefundRequestStatus" NOT NULL DEFAULT 'REQUESTED',
  "intended_method" "RefundIntendedMethod" NOT NULL,
  "esim_gate" "RefundEsimGate" NOT NULL DEFAULT 'NONE',
  "requested_by_id" UUID NOT NULL,
  "approved_by_id" UUID,
  "cancelled_by_id" UUID,
  "approved_at" TIMESTAMPTZ(6),
  "cancelled_at" TIMESTAMPTZ(6),
  "completed_at" TIMESTAMPTZ(6),
  "evidence" JSONB NOT NULL DEFAULT '{}',
  "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updated_at" TIMESTAMPTZ(6) NOT NULL,
  CONSTRAINT "refund_requests_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "refund_attempts" (
  "id" UUID NOT NULL,
  "request_id" UUID NOT NULL,
  "amount" DECIMAL(18,2) NOT NULL,
  "currency" "RefundCurrency" NOT NULL,
  "status" "RefundAttemptStatus" NOT NULL DEFAULT 'SENT',
  "recon_status" "RefundReconStatus" NOT NULL DEFAULT 'PENDING_VERIFY',
  "method" "RefundIntendedMethod" NOT NULL,
  "idempotency_key" VARCHAR(128) NOT NULL,
  "open_guard" UUID,
  "provider_refund_ref" VARCHAR(128),
  "bank_transaction_reference" VARCHAR(128),
  "destination_hint" VARCHAR(128),
  "transferred_at" TIMESTAMPTZ(6),
  "executed_by_id" UUID,
  "verified_by_id" UUID,
  "verified_at" TIMESTAMPTZ(6),
  "statement_evidence_ref" VARCHAR(128),
  "error_code" VARCHAR(64),
  "error_message" VARCHAR(512),
  "safe_request_meta" JSONB NOT NULL DEFAULT '{}',
  "safe_response_meta" JSONB NOT NULL DEFAULT '{}',
  "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updated_at" TIMESTAMPTZ(6) NOT NULL,
  "completed_at" TIMESTAMPTZ(6),
  CONSTRAINT "refund_attempts_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "refund_requests_order_id_idx" ON "refund_requests"("order_id");
CREATE INDEX "refund_requests_payment_id_status_idx" ON "refund_requests"("payment_id", "status");
CREATE INDEX "refund_requests_status_idx" ON "refund_requests"("status");
CREATE INDEX "refund_requests_requested_by_id_idx" ON "refund_requests"("requested_by_id");

CREATE UNIQUE INDEX "refund_attempts_idempotency_key_key" ON "refund_attempts"("idempotency_key");
CREATE UNIQUE INDEX "refund_attempts_open_guard_key" ON "refund_attempts"("open_guard");
CREATE INDEX "refund_attempts_request_id_status_idx" ON "refund_attempts"("request_id", "status");
CREATE INDEX "refund_attempts_status_idx" ON "refund_attempts"("status");
CREATE INDEX "refund_attempts_recon_status_idx" ON "refund_attempts"("recon_status");

ALTER TABLE "refund_requests"
  ADD CONSTRAINT "refund_requests_order_id_fkey"
  FOREIGN KEY ("order_id") REFERENCES "orders"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "refund_requests"
  ADD CONSTRAINT "refund_requests_payment_id_fkey"
  FOREIGN KEY ("payment_id") REFERENCES "payments"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "refund_requests"
  ADD CONSTRAINT "refund_requests_requested_by_id_fkey"
  FOREIGN KEY ("requested_by_id") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "refund_requests"
  ADD CONSTRAINT "refund_requests_approved_by_id_fkey"
  FOREIGN KEY ("approved_by_id") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "refund_requests"
  ADD CONSTRAINT "refund_requests_cancelled_by_id_fkey"
  FOREIGN KEY ("cancelled_by_id") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "refund_attempts"
  ADD CONSTRAINT "refund_attempts_request_id_fkey"
  FOREIGN KEY ("request_id") REFERENCES "refund_requests"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "refund_attempts"
  ADD CONSTRAINT "refund_attempts_executed_by_id_fkey"
  FOREIGN KEY ("executed_by_id") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "refund_attempts"
  ADD CONSTRAINT "refund_attempts_verified_by_id_fkey"
  FOREIGN KEY ("verified_by_id") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
