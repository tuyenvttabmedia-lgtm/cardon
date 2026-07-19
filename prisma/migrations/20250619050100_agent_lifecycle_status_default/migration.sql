-- Phase 3A: Agent lifecycle — add REJECTED + default (after PENDING_KYC committed)
ALTER TYPE "AgentStatus" ADD VALUE IF NOT EXISTS 'REJECTED';

ALTER TABLE "agents" ALTER COLUMN "status" SET DEFAULT 'PENDING_KYC';
