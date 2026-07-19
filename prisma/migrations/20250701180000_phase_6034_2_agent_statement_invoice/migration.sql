-- BUILD 6034.2 — Agent Statement & Invoice Center

CREATE TYPE "AgentStatementStatus" AS ENUM ('DRAFT', 'LOCKED', 'INVOICED', 'PAID');
CREATE TYPE "AgentStatementPaymentStatus" AS ENUM ('UNPAID', 'PARTIAL', 'PAID', 'CANCELLED', 'OVERDUE');

CREATE TABLE "agent_statements" (
  "id" UUID NOT NULL DEFAULT gen_random_uuid(),
  "agent_id" UUID NOT NULL,
  "period_label" VARCHAR(16) NOT NULL,
  "period_start" TIMESTAMPTZ(6) NOT NULL,
  "period_end" TIMESTAMPTZ(6) NOT NULL,
  "status" "AgentStatementStatus" NOT NULL DEFAULT 'DRAFT',
  "payment_status" "AgentStatementPaymentStatus" NOT NULL DEFAULT 'UNPAID',
  "summary" JSONB NOT NULL DEFAULT '{}',
  "invoice_id" UUID,
  "locked_at" TIMESTAMPTZ(6),
  "locked_by_id" UUID,
  "locked_by_email" VARCHAR(255),
  "generated_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "generated_by_id" UUID,
  "generated_by_email" VARCHAR(255),
  "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updated_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "deleted_at" TIMESTAMPTZ(6),
  CONSTRAINT "agent_statements_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "agent_statement_adjustments" (
  "id" UUID NOT NULL DEFAULT gen_random_uuid(),
  "agent_id" UUID NOT NULL,
  "statement_id" UUID,
  "amount" DECIMAL(18,2) NOT NULL,
  "reason" VARCHAR(512) NOT NULL,
  "ledger_entry_id" UUID,
  "created_by_id" UUID NOT NULL,
  "created_by_email" VARCHAR(255) NOT NULL,
  "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "agent_statement_adjustments_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "agent_statements_invoice_id_key" ON "agent_statements"("invoice_id");
CREATE UNIQUE INDEX "agent_statements_agent_id_period_label_key" ON "agent_statements"("agent_id", "period_label");
CREATE INDEX "agent_statements_agent_id_idx" ON "agent_statements"("agent_id");
CREATE INDEX "agent_statements_status_idx" ON "agent_statements"("status");
CREATE INDEX "agent_statements_deleted_at_idx" ON "agent_statements"("deleted_at");
CREATE INDEX "agent_statement_adjustments_agent_id_idx" ON "agent_statement_adjustments"("agent_id");
CREATE INDEX "agent_statement_adjustments_statement_id_idx" ON "agent_statement_adjustments"("statement_id");

ALTER TABLE "agent_statements"
  ADD CONSTRAINT "agent_statements_agent_id_fkey"
  FOREIGN KEY ("agent_id") REFERENCES "agents"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "agent_statements"
  ADD CONSTRAINT "agent_statements_invoice_id_fkey"
  FOREIGN KEY ("invoice_id") REFERENCES "invoices"("id") ON DELETE SET NULL ON UPDATE CASCADE;

ALTER TABLE "agent_statement_adjustments"
  ADD CONSTRAINT "agent_statement_adjustments_agent_id_fkey"
  FOREIGN KEY ("agent_id") REFERENCES "agents"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "agent_statement_adjustments"
  ADD CONSTRAINT "agent_statement_adjustments_statement_id_fkey"
  FOREIGN KEY ("statement_id") REFERENCES "agent_statements"("id") ON DELETE SET NULL ON UPDATE CASCADE;
