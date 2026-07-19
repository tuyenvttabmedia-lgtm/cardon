SELECT pv.sku, pv.type, pm.provider_product_code, pm.status, pm.availability, p.code
FROM provider_product_mappings pm
JOIN product_variants pv ON pv.id = pm.product_variant_id
JOIN providers p ON p.id = pm.provider_id
WHERE pv.type IN ('TOPUP', 'DATA')
ORDER BY pv.sku, pm.status;

SELECT pv.id, pv.sku FROM product_variants pv WHERE pv.sku = 'NAPVIETTEL_10K';
