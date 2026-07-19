-- Activate ESALE TOPUP/DATA provider mappings (required for nạp cước/data fulfillment)
UPDATE provider_product_mappings pm
SET
  status = 'ACTIVE',
  availability = 'AVAILABLE',
  updated_at = NOW()
FROM product_variants pv, providers p
WHERE pm.product_variant_id = pv.id
  AND pm.provider_id = p.id
  AND p.code = 'ESALE'
  AND pv.type IN ('TOPUP', 'DATA');

SELECT pv.type, COUNT(*) AS active_count
FROM provider_product_mappings pm
JOIN product_variants pv ON pv.id = pm.product_variant_id
JOIN providers p ON p.id = pm.provider_id
WHERE p.code = 'ESALE' AND pv.type IN ('TOPUP', 'DATA') AND pm.status = 'ACTIVE'
GROUP BY pv.type;
