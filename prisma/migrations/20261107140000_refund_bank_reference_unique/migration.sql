-- Prevent two SUCCEEDED refund attempts from claiming the same bank transfer proof.
-- PostgreSQL UNIQUE allows multiple NULLs, so incomplete attempts stay unconstrained.
CREATE UNIQUE INDEX IF NOT EXISTS "refund_attempts_bank_transaction_reference_key"
  ON "refund_attempts" ("bank_transaction_reference");
