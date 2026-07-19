-- Revert BUILD 6034.1 pricing groups; simplified agent margin via system_settings

ALTER TABLE "agents" DROP CONSTRAINT IF EXISTS "agents_pricing_group_id_fkey";
DROP INDEX IF EXISTS "agents_pricing_group_id_idx";
ALTER TABLE "agents" DROP COLUMN IF EXISTS "pricing_group_id";

DROP TABLE IF EXISTS "pricing_change_histories";
DROP TABLE IF EXISTS "pricing_discount_rules";
DROP TABLE IF EXISTS "pricing_group_variant_prices";
DROP TABLE IF EXISTS "pricing_groups";

DROP TYPE IF EXISTS "PricingChangeEntityType";
DROP TYPE IF EXISTS "PricingDiscountRuleStatus";
DROP TYPE IF EXISTS "PricingDiscountScope";
DROP TYPE IF EXISTS "PricingDiscountRuleType";
DROP TYPE IF EXISTS "PricingGroupStatus";

INSERT INTO "system_settings" ("id", "key", "value", "description", "created_at", "updated_at")
VALUES (
  gen_random_uuid(),
  'settings.agent.margin',
  '{
    "roundTo": 100,
    "services": {
      "GAME_CARD": { "marginPercent": 0.5, "marginFixed": 500 },
      "PHONE_CARD": { "marginPercent": 0.5, "marginFixed": 500 },
      "TOPUP": { "marginPercent": 0.3, "marginFixed": 300 },
      "DATA": { "marginPercent": 0.3, "marginFixed": 300 }
    }
  }'::jsonb,
  'Cấu hình lợi nhuận CardOn cho đại lý theo loại dịch vụ',
  NOW(),
  NOW()
)
ON CONFLICT ("key") DO NOTHING;
