-- Phase 6O.7: dynamic catalog asset URLs
ALTER TABLE "product_categories" ADD COLUMN "icon_url" VARCHAR(512);

ALTER TABLE "products" ADD COLUMN "logo_url" VARCHAR(512);
ALTER TABLE "products" ADD COLUMN "banner_url" VARCHAR(512);
