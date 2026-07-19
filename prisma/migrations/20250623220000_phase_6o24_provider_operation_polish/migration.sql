-- Phase 6O.24 — Provider operation polish

CREATE TYPE "ProviderProductAvailability" AS ENUM ('AVAILABLE', 'OUT_OF_STOCK', 'MAINTENANCE');
CREATE TYPE "OrderEventType" AS ENUM (
  'PAYMENT_SUCCESS',
  'PROVIDER_REQUEST',
  'PROVIDER_SUCCESS',
  'CARD_DELIVERED',
  'EMAIL_SENT'
);

ALTER TABLE "provider_product_mappings"
  ADD COLUMN "availability" "ProviderProductAvailability" NOT NULL DEFAULT 'AVAILABLE';

CREATE TABLE "provider_runtime_settings" (
    "id" UUID NOT NULL,
    "provider_id" UUID NOT NULL,
    "maintenance_mode" BOOLEAN NOT NULL DEFAULT false,
    "reason" VARCHAR(512),
    "start_at" TIMESTAMPTZ(6),
    "end_at" TIMESTAMPTZ(6),
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(6) NOT NULL,

    CONSTRAINT "provider_runtime_settings_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "provider_runtime_settings_provider_id_key"
  ON "provider_runtime_settings"("provider_id");

ALTER TABLE "provider_runtime_settings"
  ADD CONSTRAINT "provider_runtime_settings_provider_id_fkey"
  FOREIGN KEY ("provider_id") REFERENCES "providers"("id") ON DELETE CASCADE ON UPDATE CASCADE;

CREATE TABLE "order_events" (
    "id" UUID NOT NULL,
    "order_id" UUID NOT NULL,
    "event_type" "OrderEventType" NOT NULL,
    "message" VARCHAR(512) NOT NULL,
    "metadata" JSONB NOT NULL DEFAULT '{}',
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "order_events_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "order_events_order_id_created_at_idx"
  ON "order_events"("order_id", "created_at");

ALTER TABLE "order_events"
  ADD CONSTRAINT "order_events_order_id_fkey"
  FOREIGN KEY ("order_id") REFERENCES "orders"("id") ON DELETE CASCADE ON UPDATE CASCADE;
