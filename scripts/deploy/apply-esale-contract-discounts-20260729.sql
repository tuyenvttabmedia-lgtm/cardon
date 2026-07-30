-- Apply the current eSale contract discounts supplied by CardOn operations.
-- Provider cost = face value * (1 - contract discount / 100).
-- This intentionally corrects sandbox catalog prices, which do not represent
-- CardOn's current production commercial terms.

BEGIN;

CREATE TEMP TABLE contract_discounts (
  product_slug TEXT NOT NULL,
  variant_type TEXT NOT NULL,
  min_face_value NUMERIC(18, 2),
  max_face_value NUMERIC(18, 2),
  discount_percent NUMERIC(8, 4) NOT NULL
) ON COMMIT DROP;

INSERT INTO contract_discounts
  (product_slug, variant_type, min_face_value, max_face_value, discount_percent)
VALUES
  -- Game cards
  ('zing-card',        'CARD', NULL, NULL, 4.0),
  ('vcoin-card',       'CARD', NULL, NULL, 4.8),
  ('appota-card',      'CARD', NULL, NULL, 3.5),
  ('soha-card',        'CARD', NULL, NULL, 6.0),
  ('garena-card',      'CARD', NULL, NULL, 5.4),
  ('scoin',            'CARD', NULL, NULL, 5.5),
  ('funcard',          'CARD', NULL, NULL, 5.5),
  ('gosu-card',        'CARD', NULL, NULL, 5.5),
  ('kul-card',         'CARD', NULL, NULL, 5.5),

  -- Phone cards
  ('mobifone',         'CARD', NULL, NULL, 2.4),
  ('vinaphone',        'CARD', NULL, NULL, 2.4),
  ('viettel-card',     'CARD', 10000, 10000, 2.0),
  ('viettel-card',     'CARD', 20000, 500000, 2.1),
  ('viettel-card',     'CARD', 1000000, 1000000, 1.8),
  ('vietnamobile',     'CARD', NULL, NULL, 4.2),

  -- Prepaid phone topup. No postpaid Viettel SKU currently exists.
  ('mobifone-topup',     'TOPUP', NULL, NULL, 2.4),
  ('vinaphone-topup',    'TOPUP', NULL, NULL, 2.4),
  ('viettel-topup',      'TOPUP', NULL, NULL, 1.8),
  ('vietnamobile-topup', 'TOPUP', NULL, NULL, 4.8);

CREATE TEMP TABLE cost_changes ON COMMIT DROP AS
SELECT
  mapping.id AS mapping_id,
  mapping.provider_id,
  mapping.product_variant_id AS variant_id,
  mapping.provider_cost AS old_cost,
  ROUND(variant.face_value * (1 - rule.discount_percent / 100), 2) AS new_cost
FROM provider_product_mappings mapping
JOIN providers provider ON provider.id = mapping.provider_id
JOIN product_variants variant ON variant.id = mapping.product_variant_id
JOIN products product ON product.id = variant.product_id
JOIN contract_discounts rule
  ON rule.product_slug = product.slug
 AND rule.variant_type = variant.type::text
 AND (rule.min_face_value IS NULL OR variant.face_value >= rule.min_face_value)
 AND (rule.max_face_value IS NULL OR variant.face_value <= rule.max_face_value)
WHERE provider.code = 'ESALE'
  AND mapping.status = 'ACTIVE'
  AND variant.status = 'ACTIVE'
  AND mapping.provider_cost IS DISTINCT FROM
      ROUND(variant.face_value * (1 - rule.discount_percent / 100), 2);

INSERT INTO provider_cost_histories
  (id, provider_id, variant_id, old_cost, new_cost, changed_at)
SELECT
  gen_random_uuid(),
  provider_id,
  variant_id,
  old_cost,
  new_cost,
  NOW()
FROM cost_changes;

UPDATE provider_product_mappings mapping
SET
  provider_cost = changes.new_cost,
  updated_at = NOW()
FROM cost_changes changes
WHERE mapping.id = changes.mapping_id;

DO $$
DECLARE
  changed_count INTEGER;
BEGIN
  SELECT COUNT(*) INTO changed_count FROM cost_changes;
  RAISE NOTICE 'Updated % active eSale provider costs', changed_count;
END
$$;

COMMIT;
