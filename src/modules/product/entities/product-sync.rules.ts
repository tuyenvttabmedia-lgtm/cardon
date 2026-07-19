/**
 * Provider catalog sync rules (Phase 2C.1 — documented, not implemented).
 *
 * When ProviderInterface.syncProduct() runs in a future phase:
 *
 * MAY UPDATE on provider_product_mappings:
 * - provider_cost
 * - status (availability / ACTIVE|INACTIVE)
 * - health_score
 *
 * MUST NOT OVERWRITE:
 * - product_variants.sell_price (manual admin price)
 * - agent_product_prices.agent_price (agent custom pricing)
 * - product / variant catalog metadata (name, slug, face_value)
 */
export const PROVIDER_SYNC_RULES = {
  updatableFields: ['providerCost', 'status', 'healthScore'] as const,
  protectedFields: [
    'product_variants.sell_price',
    'agent_product_prices.agent_price',
  ] as const,
} as const;

/**
 * Cache policy (Phase 2C.1 — preparation only).
 *
 * ALLOWED:
 * - Public product/category list cache (TTL-based, invalidate on catalog mutation)
 *
 * NOT ALLOWED:
 * - Cached agent price resolution (always read agent_product_prices from DB)
 * - Cached customer price when admin updates sell_price (invalidate on change)
 */
export const PRODUCT_CACHE_POLICY = {
  cacheable: ['product_list', 'category_tree'] as const,
  neverCache: ['agent_price_resolution', 'agent_product_prices'] as const,
} as const;
