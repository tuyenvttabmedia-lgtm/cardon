-- BUILD 6034.1 — Pricing & Discount Center

CREATE TYPE "PricingGroupStatus" AS ENUM ('ACTIVE', 'INACTIVE');
CREATE TYPE "PricingDiscountRuleType" AS ENUM ('PERCENTAGE', 'FIXED');
CREATE TYPE "PricingDiscountScope" AS ENUM ('GLOBAL', 'PRODUCT', 'CATEGORY', 'PROVIDER');
CREATE TYPE "PricingDiscountRuleStatus" AS ENUM ('ACTIVE', 'INACTIVE');
CREATE TYPE "PricingChangeEntityType" AS ENUM (
  'PRICING_GROUP',
  'PRICING_GROUP_VARIANT',
  'AGENT_PRODUCT_PRICE',
  'AGENT_PRICING_GROUP',
  'DISCOUNT_RULE',
  'IMPORT'
);

ALTER TYPE "SystemAuditResource" ADD VALUE IF NOT EXISTS 'PRICING';

CREATE TABLE "pricing_groups" (
  "id" UUID NOT NULL DEFAULT gen_random_uuid(),
  "code" VARCHAR(64) NOT NULL,
  "name" VARCHAR(128) NOT NULL,
  "description" VARCHAR(512),
  "default_discount_percent" DECIMAL(5,2) NOT NULL DEFAULT 0,
  "status" "PricingGroupStatus" NOT NULL DEFAULT 'ACTIVE',
  "is_default" BOOLEAN NOT NULL DEFAULT false,
  "sort_order" INTEGER NOT NULL DEFAULT 0,
  "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updated_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "pricing_groups_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "pricing_groups_code_key" ON "pricing_groups"("code");
CREATE INDEX "pricing_groups_status_idx" ON "pricing_groups"("status");

CREATE TABLE "pricing_group_variant_prices" (
  "id" UUID NOT NULL DEFAULT gen_random_uuid(),
  "pricing_group_id" UUID NOT NULL,
  "variant_id" UUID NOT NULL,
  "sell_price" DECIMAL(18,2),
  "discount_percent" DECIMAL(5,2),
  "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updated_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "pricing_group_variant_prices_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "pricing_group_variant_prices_pricing_group_id_variant_id_key"
  ON "pricing_group_variant_prices"("pricing_group_id", "variant_id");
CREATE INDEX "pricing_group_variant_prices_variant_id_idx" ON "pricing_group_variant_prices"("variant_id");

ALTER TABLE "pricing_group_variant_prices"
  ADD CONSTRAINT "pricing_group_variant_prices_pricing_group_id_fkey"
  FOREIGN KEY ("pricing_group_id") REFERENCES "pricing_groups"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "pricing_group_variant_prices"
  ADD CONSTRAINT "pricing_group_variant_prices_variant_id_fkey"
  FOREIGN KEY ("variant_id") REFERENCES "product_variants"("id") ON DELETE CASCADE ON UPDATE CASCADE;

CREATE TABLE "pricing_discount_rules" (
  "id" UUID NOT NULL DEFAULT gen_random_uuid(),
  "name" VARCHAR(128) NOT NULL,
  "rule_type" "PricingDiscountRuleType" NOT NULL,
  "scope" "PricingDiscountScope" NOT NULL,
  "scope_id" UUID,
  "value" DECIMAL(18,2) NOT NULL,
  "priority" INTEGER NOT NULL DEFAULT 100,
  "effective_from" TIMESTAMPTZ(6),
  "effective_to" TIMESTAMPTZ(6),
  "status" "PricingDiscountRuleStatus" NOT NULL DEFAULT 'ACTIVE',
  "agent_id" UUID,
  "pricing_group_id" UUID,
  "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updated_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "pricing_discount_rules_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "pricing_discount_rules_status_priority_idx" ON "pricing_discount_rules"("status", "priority");
CREATE INDEX "pricing_discount_rules_scope_scope_id_idx" ON "pricing_discount_rules"("scope", "scope_id");
CREATE INDEX "pricing_discount_rules_agent_id_idx" ON "pricing_discount_rules"("agent_id");
CREATE INDEX "pricing_discount_rules_pricing_group_id_idx" ON "pricing_discount_rules"("pricing_group_id");

ALTER TABLE "pricing_discount_rules"
  ADD CONSTRAINT "pricing_discount_rules_agent_id_fkey"
  FOREIGN KEY ("agent_id") REFERENCES "agents"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "pricing_discount_rules"
  ADD CONSTRAINT "pricing_discount_rules_pricing_group_id_fkey"
  FOREIGN KEY ("pricing_group_id") REFERENCES "pricing_groups"("id") ON DELETE CASCADE ON UPDATE CASCADE;

CREATE TABLE "pricing_change_histories" (
  "id" UUID NOT NULL DEFAULT gen_random_uuid(),
  "entity_type" "PricingChangeEntityType" NOT NULL,
  "entity_id" VARCHAR(128) NOT NULL,
  "field_name" VARCHAR(128) NOT NULL,
  "old_value" JSONB,
  "new_value" JSONB,
  "reason" VARCHAR(512),
  "performed_by_id" UUID,
  "performed_email" VARCHAR(255),
  "agent_id" UUID,
  "variant_id" UUID,
  "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "pricing_change_histories_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "pricing_change_histories_entity_type_entity_id_idx"
  ON "pricing_change_histories"("entity_type", "entity_id");
CREATE INDEX "pricing_change_histories_agent_id_idx" ON "pricing_change_histories"("agent_id");
CREATE INDEX "pricing_change_histories_created_at_idx" ON "pricing_change_histories"("created_at");

ALTER TABLE "agents" ADD COLUMN "pricing_group_id" UUID;
CREATE INDEX "agents_pricing_group_id_idx" ON "agents"("pricing_group_id");
ALTER TABLE "agents"
  ADD CONSTRAINT "agents_pricing_group_id_fkey"
  FOREIGN KEY ("pricing_group_id") REFERENCES "pricing_groups"("id") ON DELETE SET NULL ON UPDATE CASCADE;

INSERT INTO "pricing_groups" ("id", "code", "name", "description", "default_discount_percent", "status", "is_default", "sort_order")
VALUES (
  '00000000-0000-4000-8000-000000000001',
  'DEFAULT',
  'Mặc định',
  'Nhóm giá mặc định cho đại lý mới',
  0,
  'ACTIVE',
  true,
  0
);

UPDATE "agents" SET "pricing_group_id" = '00000000-0000-4000-8000-000000000001' WHERE "pricing_group_id" IS NULL AND "deleted_at" IS NULL;

INSERT INTO "pricing_groups" ("id", "code", "name", "description", "default_discount_percent", "status", "is_default", "sort_order")
VALUES
  ('00000000-0000-4000-8000-000000000002', 'VIP', 'VIP', 'Đại lý VIP', 5, 'ACTIVE', false, 10),
  ('00000000-0000-4000-8000-000000000003', 'ENTERPRISE', 'Enterprise', 'Đại lý doanh nghiệp', 8, 'ACTIVE', false, 20),
  ('00000000-0000-4000-8000-000000000004', 'RESELLER', 'Reseller', 'Đại lý bán lại', 3, 'ACTIVE', false, 30),
  ('00000000-0000-4000-8000-000000000005', 'STRATEGIC', 'Strategic', 'Đại lý chiến lược', 10, 'ACTIVE', false, 40);
