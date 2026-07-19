-- Phase 3A: Agent lifecycle — add PENDING_KYC (must be separate txn from SET DEFAULT)
ALTER TYPE "AgentStatus" ADD VALUE IF NOT EXISTS 'PENDING_KYC';
