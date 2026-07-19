-- Phase 6O.10: product sort order + partial unique on active provider mappings

ALTER TABLE "products" ADD COLUMN IF NOT EXISTS "sort_order" INTEGER NOT NULL DEFAULT 0;

CREATE INDEX IF NOT EXISTS "products_sort_order_created_at_idx" ON "products"("sort_order", "created_at");

DROP INDEX IF EXISTS "provider_product_mappings_provider_id_product_variant_id_key";

CREATE UNIQUE INDEX IF NOT EXISTS "active_provider_mapping_unique"
  ON "provider_product_mappings"("provider_id", "product_variant_id", "provider_product_code")
  WHERE "status" = 'ACTIVE';
