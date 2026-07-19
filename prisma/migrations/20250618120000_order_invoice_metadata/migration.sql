-- Phase 2D: store VAT invoice fields at checkout until invoice generation
ALTER TABLE "orders" ADD COLUMN "invoice_metadata" JSONB NOT NULL DEFAULT '{}';
