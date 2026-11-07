-- Phase A local eSIM mock. Additive enum values and new tables only.
ALTER TYPE "HomeServiceType" ADD VALUE IF NOT EXISTS 'ESIM';
ALTER TYPE "ProductVariantType" ADD VALUE IF NOT EXISTS 'ESIM';

CREATE TYPE "EsimProviderMode" AS ENUM ('MOCK', 'LIVE');
CREATE TYPE "EsimAttemptOperation" AS ENUM ('CREATE', 'QUERY');
CREATE TYPE "EsimAttemptOutcome" AS ENUM (
  'SENT',
  'UNCONFIRMED',
  'CONFIRMED_CREATED',
  'CONFIRMED_NOT_CREATED',
  'REJECTED_DEFINITIVE',
  'PROFILE_SAVED'
);

CREATE TABLE "esim_order_quotes" (
  "id" UUID NOT NULL,
  "order_item_id" UUID NOT NULL,
  "provider_id" UUID NOT NULL,
  "provider_product_code" VARCHAR(128) NOT NULL,
  "provider_cost" DECIMAL(18,2) NOT NULL,
  "provider_mode" "EsimProviderMode" NOT NULL,
  "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "esim_order_quotes_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "esim_provider_attempts" (
  "id" UUID NOT NULL,
  "order_item_id" UUID NOT NULL,
  "quote_id" UUID NOT NULL,
  "request_id" VARCHAR(128) NOT NULL,
  "provider_reference" VARCHAR(128),
  "operation" "EsimAttemptOperation" NOT NULL,
  "outcome" "EsimAttemptOutcome" NOT NULL,
  "open_guard" UUID,
  "error_code" VARCHAR(64),
  "error_message" VARCHAR(512),
  "safe_request_meta" JSONB NOT NULL DEFAULT '{}',
  "safe_response_meta" JSONB NOT NULL DEFAULT '{}',
  "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updated_at" TIMESTAMPTZ(6) NOT NULL,
  "completed_at" TIMESTAMPTZ(6),
  CONSTRAINT "esim_provider_attempts_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "esim_profiles" (
  "id" UUID NOT NULL,
  "order_item_id" UUID NOT NULL,
  "attempt_id" UUID NOT NULL,
  "install_secret_enc" TEXT NOT NULL,
  "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "esim_profiles_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "esim_order_quotes_order_item_id_key" ON "esim_order_quotes"("order_item_id");
CREATE INDEX "esim_order_quotes_provider_id_idx" ON "esim_order_quotes"("provider_id");
CREATE UNIQUE INDEX "esim_provider_attempts_request_id_key" ON "esim_provider_attempts"("request_id");
CREATE UNIQUE INDEX "esim_provider_attempts_open_guard_key" ON "esim_provider_attempts"("open_guard");
CREATE INDEX "esim_provider_attempts_order_item_id_idx" ON "esim_provider_attempts"("order_item_id");
CREATE INDEX "esim_provider_attempts_quote_id_idx" ON "esim_provider_attempts"("quote_id");
CREATE UNIQUE INDEX "esim_profiles_order_item_id_key" ON "esim_profiles"("order_item_id");
CREATE UNIQUE INDEX "esim_profiles_attempt_id_key" ON "esim_profiles"("attempt_id");

ALTER TABLE "esim_order_quotes"
  ADD CONSTRAINT "esim_order_quotes_order_item_id_fkey"
  FOREIGN KEY ("order_item_id") REFERENCES "order_items"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "esim_order_quotes"
  ADD CONSTRAINT "esim_order_quotes_provider_id_fkey"
  FOREIGN KEY ("provider_id") REFERENCES "providers"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "esim_provider_attempts"
  ADD CONSTRAINT "esim_provider_attempts_order_item_id_fkey"
  FOREIGN KEY ("order_item_id") REFERENCES "order_items"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "esim_provider_attempts"
  ADD CONSTRAINT "esim_provider_attempts_quote_id_fkey"
  FOREIGN KEY ("quote_id") REFERENCES "esim_order_quotes"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "esim_profiles"
  ADD CONSTRAINT "esim_profiles_order_item_id_fkey"
  FOREIGN KEY ("order_item_id") REFERENCES "order_items"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "esim_profiles"
  ADD CONSTRAINT "esim_profiles_attempt_id_fkey"
  FOREIGN KEY ("attempt_id") REFERENCES "esim_provider_attempts"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
