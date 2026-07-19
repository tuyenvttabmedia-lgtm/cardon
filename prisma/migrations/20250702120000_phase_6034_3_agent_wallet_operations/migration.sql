-- BUILD 6034.3 — Agent Wallet Operations Center

CREATE TYPE "AgentManualCreditType" AS ENUM ('CREDIT', 'DEBIT');
CREATE TYPE "AgentManualCreditCategory" AS ENUM ('CONTRACT', 'BANK_TRANSFER', 'PROMOTION', 'COMPENSATION', 'CORRECTION', 'OTHER');
CREATE TYPE "AgentManualCreditStatus" AS ENUM ('PENDING_APPROVAL', 'COMPLETED', 'REJECTED', 'CANCELLED');

CREATE TABLE "agent_manual_credits" (
    "id" UUID NOT NULL,
    "agent_id" UUID NOT NULL,
    "type" "AgentManualCreditType" NOT NULL DEFAULT 'CREDIT',
    "amount" DECIMAL(18,2) NOT NULL,
    "category" "AgentManualCreditCategory" NOT NULL,
    "reason" TEXT NOT NULL,
    "reference_code" VARCHAR(128),
    "status" "AgentManualCreditStatus" NOT NULL DEFAULT 'PENDING_APPROVAL',
    "ledger_entry_id" UUID,
    "requested_by_id" UUID NOT NULL,
    "requested_by_email" VARCHAR(255) NOT NULL,
    "requested_role" "UserRole" NOT NULL,
    "approved_by_id" UUID,
    "approved_by_email" VARCHAR(255),
    "rejected_reason" TEXT,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "approved_at" TIMESTAMPTZ(6),
    "completed_at" TIMESTAMPTZ(6),
    "deleted_at" TIMESTAMPTZ(6),

    CONSTRAINT "agent_manual_credits_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "agent_manual_credits_agent_id_created_at_idx" ON "agent_manual_credits"("agent_id", "created_at");
CREATE INDEX "agent_manual_credits_status_idx" ON "agent_manual_credits"("status");
CREATE INDEX "agent_manual_credits_deleted_at_idx" ON "agent_manual_credits"("deleted_at");

ALTER TABLE "agent_manual_credits" ADD CONSTRAINT "agent_manual_credits_agent_id_fkey" FOREIGN KEY ("agent_id") REFERENCES "agents"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
