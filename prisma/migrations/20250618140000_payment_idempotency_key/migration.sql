-- Phase 2E: payment creation idempotency key
ALTER TABLE "payments" ADD COLUMN "idempotency_key" VARCHAR(128);
CREATE UNIQUE INDEX "payments_idempotency_key_key" ON "payments"("idempotency_key");
