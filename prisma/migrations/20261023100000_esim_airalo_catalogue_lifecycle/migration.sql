CREATE TYPE "EsimCatalogLifecycle" AS ENUM ('IMPORTED', 'MAPPED', 'REVIEW_REQUIRED', 'PUBLISHED', 'INACTIVE');

CREATE TABLE "esim_airalo_packages" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "provider_package_id" VARCHAR(128) NOT NULL,
    "provider_id" UUID NOT NULL,
    "variant_id" UUID,
    "country_iso" VARCHAR(8) NOT NULL,
    "destination_key" VARCHAR(32) NOT NULL,
    "operator_title" VARCHAR(255) NOT NULL,
    "title" VARCHAR(255) NOT NULL,
    "package_type" VARCHAR(32) NOT NULL,
    "validity_days" INTEGER NOT NULL,
    "data_amount_mb" INTEGER NOT NULL,
    "is_unlimited" BOOLEAN NOT NULL DEFAULT false,
    "fup_clear" BOOLEAN NOT NULL DEFAULT false,
    "cost_currency" VARCHAR(8) NOT NULL,
    "cost_amount" DECIMAL(18,4) NOT NULL,
    "cost_vnd" DECIMAL(18,2) NOT NULL,
    "sell_price_vnd" DECIMAL(18,2) NOT NULL,
    "usd_vnd_rate" DECIMAL(18,4),
    "lifecycle" "EsimCatalogLifecycle" NOT NULL DEFAULT 'IMPORTED',
    "review_reason" VARCHAR(512),
    "raw_safe_meta" JSONB NOT NULL DEFAULT '{}',
    "imported_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "published_at" TIMESTAMPTZ(6),
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "esim_airalo_packages_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "esim_airalo_packages_provider_package_id_key" ON "esim_airalo_packages"("provider_package_id");
CREATE INDEX "esim_airalo_packages_lifecycle_idx" ON "esim_airalo_packages"("lifecycle");
CREATE INDEX "esim_airalo_packages_country_iso_idx" ON "esim_airalo_packages"("country_iso");
CREATE INDEX "esim_airalo_packages_destination_key_idx" ON "esim_airalo_packages"("destination_key");
CREATE INDEX "esim_airalo_packages_variant_id_idx" ON "esim_airalo_packages"("variant_id");

ALTER TABLE "esim_airalo_packages" ADD CONSTRAINT "esim_airalo_packages_provider_id_fkey" FOREIGN KEY ("provider_id") REFERENCES "providers"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "esim_airalo_packages" ADD CONSTRAINT "esim_airalo_packages_variant_id_fkey" FOREIGN KEY ("variant_id") REFERENCES "product_variants"("id") ON DELETE SET NULL ON UPDATE CASCADE;
