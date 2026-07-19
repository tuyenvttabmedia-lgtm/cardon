-- Phase 6O31 — Persist homeService on Category and Product

CREATE TYPE "HomeServiceType" AS ENUM ('GAME_CARD', 'PHONE_CARD', 'TOPUP', 'DATA');

ALTER TABLE "product_categories" ADD COLUMN "home_service" "HomeServiceType";

UPDATE "product_categories"
SET "home_service" = 'PHONE_CARD'
WHERE slug ~* '(phone-card|the-.*thoai|dien-thoai|telco|^phone)';

UPDATE "product_categories"
SET "home_service" = 'GAME_CARD'
WHERE "home_service" IS NULL
  AND slug ~* '(game-card|game-cards|local-demo-cards|smoke-game-cards|game-cards-local)';

UPDATE "product_categories"
SET "home_service" = 'TOPUP'
WHERE "home_service" IS NULL
  AND (slug = 'topup' OR slug ~* '(nap-cuoc|local-demo-topup)');

UPDATE "product_categories"
SET "home_service" = 'DATA'
WHERE "home_service" IS NULL
  AND (slug = 'data' OR slug ~* 'nap-data');

UPDATE "product_categories"
SET "home_service" = 'GAME_CARD'
WHERE "home_service" IS NULL;

ALTER TABLE "product_categories" ALTER COLUMN "home_service" SET NOT NULL;

CREATE INDEX "product_categories_home_service_idx" ON "product_categories"("home_service");

ALTER TABLE "products" ADD COLUMN "home_service" "HomeServiceType";

UPDATE "products" AS p
SET "home_service" = c."home_service"
FROM "product_categories" AS c
WHERE p."category_id" = c."id";

UPDATE "products"
SET "home_service" = 'GAME_CARD'
WHERE "home_service" IS NULL;

ALTER TABLE "products" ALTER COLUMN "home_service" SET NOT NULL;

CREATE INDEX "products_home_service_idx" ON "products"("home_service");
