-- B2C retail checkout Idempotency-Key (anti double-submit / retry duplicate orders).
ALTER TABLE "orders"
ADD COLUMN IF NOT EXISTS "checkout_idempotency_key" VARCHAR(128);

CREATE UNIQUE INDEX IF NOT EXISTS "orders_checkout_idempotency_key_key"
ON "orders" ("checkout_idempotency_key");
