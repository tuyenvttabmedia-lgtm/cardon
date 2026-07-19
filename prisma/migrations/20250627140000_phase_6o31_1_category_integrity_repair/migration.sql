-- Phase 6O31.1 — Repair duplicate product categories after homeService migration

-- Ensure DATA root exists
INSERT INTO "product_categories" ("id", "slug", "name", "home_service", "sort_order", "status", "created_at", "updated_at")
SELECT gen_random_uuid(), 'data', 'Nạp Data', 'DATA', 3, 'ACTIVE', NOW(), NOW()
WHERE NOT EXISTS (SELECT 1 FROM "product_categories" WHERE "slug" = 'data');

-- Move products from duplicate categories to canonical service roots
UPDATE "products" AS p
SET "category_id" = canon."id",
    "home_service" = canon."home_service",
    "updated_at" = NOW()
FROM "product_categories" AS dup
JOIN "product_categories" AS canon ON canon."slug" = CASE dup."home_service"
  WHEN 'GAME_CARD' THEN 'game-card'
  WHEN 'PHONE_CARD' THEN 'phone-card'
  WHEN 'TOPUP' THEN 'topup'
  WHEN 'DATA' THEN 'data'
END
WHERE p."category_id" = dup."id"
  AND p."deleted_at" IS NULL
  AND dup."slug" IN (
    'local-demo-cards',
    'local-demo-cards-game',
    'local-demo-game-cards',
    'local-demo-phone-cards',
    'local-demo-topup',
    'the-ien-thoai',
    'nap-data',
    'smoke-game-cards',
    'game-cards-local'
  );

-- Reparent children of duplicate categories to canonical roots
UPDATE "product_categories" AS child
SET "parent_id" = canon."id",
    "updated_at" = NOW()
FROM "product_categories" AS dup
JOIN "product_categories" AS canon ON canon."slug" = CASE dup."home_service"
  WHEN 'GAME_CARD' THEN 'game-card'
  WHEN 'PHONE_CARD' THEN 'phone-card'
  WHEN 'TOPUP' THEN 'topup'
  WHEN 'DATA' THEN 'data'
END
WHERE child."parent_id" = dup."id"
  AND dup."slug" IN (
    'local-demo-cards',
    'local-demo-cards-game',
    'local-demo-game-cards',
    'local-demo-phone-cards',
    'local-demo-topup',
    'the-ien-thoai',
    'nap-data',
    'smoke-game-cards',
    'game-cards-local'
  );

-- Delete empty duplicate categories
DELETE FROM "product_categories" AS dup
WHERE dup."slug" IN (
    'local-demo-cards',
    'local-demo-cards-game',
    'local-demo-game-cards',
    'local-demo-phone-cards',
    'local-demo-topup',
    'the-ien-thoai',
    'nap-data',
    'smoke-game-cards',
    'game-cards-local'
  )
  AND NOT EXISTS (
    SELECT 1 FROM "products" p
    WHERE p."category_id" = dup."id" AND p."deleted_at" IS NULL
  )
  AND NOT EXISTS (
    SELECT 1 FROM "product_categories" c
    WHERE c."parent_id" = dup."id"
  );

-- Remove extra duplicate roots with same homeService (keep canonical slug only)
DELETE FROM "product_categories" AS dup
WHERE dup."parent_id" IS NULL
  AND dup."slug" NOT IN ('game-card', 'phone-card', 'topup', 'data')
  AND EXISTS (
    SELECT 1 FROM "product_categories" canon
    WHERE canon."slug" = CASE dup."home_service"
      WHEN 'GAME_CARD' THEN 'game-card'
      WHEN 'PHONE_CARD' THEN 'phone-card'
      WHEN 'TOPUP' THEN 'topup'
      WHEN 'DATA' THEN 'data'
    END
  )
  AND NOT EXISTS (
    SELECT 1 FROM "products" p
    WHERE p."category_id" = dup."id" AND p."deleted_at" IS NULL
  )
  AND NOT EXISTS (
    SELECT 1 FROM "product_categories" c
    WHERE c."parent_id" = dup."id"
  );
