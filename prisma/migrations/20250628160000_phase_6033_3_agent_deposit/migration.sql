-- Build 6033.3 Agent Money Flow & Deposit Center

CREATE TYPE "AgentDepositStatus" AS ENUM (
  'INIT',
  'AWAITING_PAYMENT',
  'PAID',
  'RECORDED',
  'CREDITED',
  'EXPIRED',
  'FAILED',
  'CANCELLED'
);

CREATE TABLE "agent_deposits" (
  "id" UUID NOT NULL,
  "agent_id" UUID NOT NULL,
  "payment_reference" VARCHAR(128) NOT NULL,
  "idempotency_key" VARCHAR(128),
  "gateway" "PaymentGatewayCode" NOT NULL,
  "amount" DECIMAL(18,2) NOT NULL,
  "fee_amount" DECIMAL(18,2) NOT NULL DEFAULT 0,
  "net_amount" DECIMAL(18,2) NOT NULL,
  "status" "AgentDepositStatus" NOT NULL DEFAULT 'INIT',
  "gateway_response" JSONB NOT NULL DEFAULT '{}',
  "gateway_transaction_id" VARCHAR(128),
  "ledger_entry_id" UUID,
  "expires_at" TIMESTAMPTZ(6),
  "paid_at" TIMESTAMPTZ(6),
  "credited_at" TIMESTAMPTZ(6),
  "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updated_at" TIMESTAMPTZ(6) NOT NULL,
  "deleted_at" TIMESTAMPTZ(6),

  CONSTRAINT "agent_deposits_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "agent_deposits_payment_reference_key" ON "agent_deposits"("payment_reference");
CREATE UNIQUE INDEX "agent_deposits_ledger_entry_id_key" ON "agent_deposits"("ledger_entry_id");
CREATE UNIQUE INDEX "agent_deposits_agent_id_idempotency_key_key" ON "agent_deposits"("agent_id", "idempotency_key");
CREATE INDEX "agent_deposits_agent_id_idx" ON "agent_deposits"("agent_id");
CREATE INDEX "agent_deposits_status_idx" ON "agent_deposits"("status");
CREATE INDEX "agent_deposits_deleted_at_idx" ON "agent_deposits"("deleted_at");

ALTER TABLE "agent_deposits"
  ADD CONSTRAINT "agent_deposits_agent_id_fkey"
  FOREIGN KEY ("agent_id") REFERENCES "agents"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "agent_deposits"
  ADD CONSTRAINT "agent_deposits_ledger_entry_id_fkey"
  FOREIGN KEY ("ledger_entry_id") REFERENCES "ledger_entries"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
