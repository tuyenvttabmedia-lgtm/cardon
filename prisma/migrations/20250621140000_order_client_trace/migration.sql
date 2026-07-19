-- Phase 6F.2 — Order client trace for fraud/dispute investigation
ALTER TABLE "orders" ADD COLUMN "client_trace" JSONB NOT NULL DEFAULT '{}';
