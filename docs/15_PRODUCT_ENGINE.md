# Product Engine

> Phase 3 — Design reference. Extends `02_DATABASE_SCHEMA.md`. No application code yet.

## Overview

The Product Engine manages catalog hierarchy, pricing resolution, and provider routing.

```
Checkout / Agent API / Admin
    ↓
ProductEngineService           ← all catalog business logic
    ↓
ProductRepository | PricingRepository | ProviderRoutingRepository
    ↓
Database
```

Never resolve price or provider in controllers.

---

## Product Hierarchy

```
Category
    ↓
Product
    ↓
Variant (sellable SKU)
```

### Example

```
Game Card          (category)
    ↓
Garena             (product)
    ↓
Garena 100K        (variant — SKU: GARENA_100K)
```

| Level | Purpose | Example |
|-------|---------|---------|
| **Category** | Navigation, SEO grouping | Game Card, Topup, Data |
| **Product** | Brand / service group | Garena, PUBG, Mobifone Topup |
| **Variant** | Purchasable unit with price | Garena 100K, Topup 50K |

Checkout and Agent API operate on **Variant** (`product_variants` table). See `02_DATABASE_SCHEMA.md`.

---

## Product Types

| Type | Description | Fulfillment |
|------|-------------|-------------|
| `CARD` | Game / mobile card with PIN | `card_records` |
| `TOPUP` | Mobile topup | `topup_transactions` |
| `DATA` | Mobile data package | `topup_transactions` (same pipeline) |
| `SOFTWARE` | Software license (future) | TBD — not Phase 3 |

Maps from legacy enum in `02`: `GAME_CARD` / `MOBILE_CARD` → `CARD`; `TOPUP` → `TOPUP`.

---

## Catalog Structure (Logical)

```
categories
    ↓
product_variants
    ↓
provider_product_mappings (multi-provider)
```

---

## Pricing Model

Three pricing layers, resolved in **priority order**:

```
1. agent_product_prices     ← custom price per agent + variant (highest)
        ↓ (if not found)
2. agent_level_prices       ← price by agent tier + variant
        ↓ (if not found)
3. product_variants.sell_price  ← default customer price
```

### Customer Price (B2C)

Always uses `product_variants.sell_price` at checkout. Snapshot saved to `order_items.unit_price`.

### Agent Price

```typescript
ProductEngineService.getAgentPrice(agentId, variantId): Decimal {
  // 1. agent_product_prices
  const custom = await repo.findAgentProductPrice(agentId, variantId);
  if (custom) return custom.agent_price;

  // 2. agent_level_prices via agents.agent_level_id
  const levelPrice = await repo.findAgentLevelPrice(agent.agent_level_id, variantId);
  if (levelPrice) return levelPrice.price;

  // 3. default — variant sell_price or configured agent discount
  return variant.sell_price * agent.default_discount_rate;
}
```

Existing `agent_product_prices` in `02` references `product_id` → will reference `product_variant_id` after schema extension.

---

## Provider Mapping

One CardOn **variant** can map to **many providers**.

```
Garena 100K (variant)
    ↓
provider_product_mappings:
  - esale   → provider_product_code = "1"
  - imedia  → provider_product_code = "ABC"
```

Routing selects **one provider per fulfillment attempt** — not simultaneous calls.

### provider_product_mappings

| Column | Purpose |
|--------|---------|
| product_variant_id | FK → product_variants |
| provider_id | FK → providers |
| provider_product_code | Provider-side SKU/code |
| provider_cost | Cost from this provider |
| priority | Manual override order (lower = higher) |
| status | ACTIVE, INACTIVE |

---

## Provider Routing Priority

When fulfilling an order, `ProviderRoutingService` selects provider:

```
1. Manual provider selected     ← admin override on order or variant config
        ↓
2. Cheapest cost                ← lowest provider_cost among ACTIVE mappings
        ↓
3. Provider health              ← exclude providers with recent failures / low balance flag
        ↓
4. Available provider           ← first ACTIVE mapping that passes health check
```

```
ProductEngineService.resolveProvider(variantId, options?)
    ↓
Load provider_product_mappings (status: ACTIVE)
    ↓
Apply routing rules 1 → 4
    ↓
Return ProviderInterface instance (ESaleProvider | IMediaProvider)
```

**Compatibility with V2:** Provider calls still go through `ProviderInterface`. Fulfillment worker uses resolved provider — never hardcoded.

**Note:** Current `02.products.provider_id` is superseded by `product_provider_mappings` for new catalog. During migration, single-provider products become one mapping row.

---

## ProductEngineService (Reference)

```typescript
class ProductEngineService {
  getCategoryTree(): Promise<CategoryTree>;
  getVariantBySku(sku: string): Promise<ProductVariant>;
  getVariantsByProduct(productId: string): Promise<ProductVariant[]>;
  getCustomerPrice(variantId: string): Promise<Decimal>;
  getAgentPrice(agentId: string, variantId: string): Promise<Decimal>;
  resolveProvider(variantId: string, options?: RoutingOptions): Promise<ProviderInterface>;
  syncProviderCatalog(providerCode: string): Promise<SyncResult>;
}
```

Layer flow:

```
ProductController / AgentController
    ↓
ProductEngineService
    ↓
ProductRepository | PricingRepository | ProviderRoutingRepository
```

---

## Provider Catalog Sync

```
Cron / Admin trigger
    ↓
ProviderInterface.syncProduct()
    ↓
Upsert product_provider_mappings (cost, availability)
    ↓
Update provider health metrics
```

Sync updates **mapping** rows — does not auto-create variants without admin approval.

---

## Order Integration

At order creation:

```typescript
const variant = await productEngine.getVariantBySku(sku);
const unitPrice = channel === 'AGENT'
  ? await productEngine.getAgentPrice(agentId, variant.id)
  : await productEngine.getCustomerPrice(variant.id);

await orderItemRepo.create({
  variant_id: variant.id,
  quantity,
  unit_price: unitPrice,
  discount: 0,
  total_amount: unitPrice * quantity,
});
```

Schema: `order_items.variant_id` → `product_variants`. See `02_DATABASE_SCHEMA.md`.

---

## Admin Operations

| Action | Permission |
|--------|-----------|
| Manage categories | `pricing.manage` |
| Manage products / variants | `pricing.manage` |
| Manage provider mappings | `providers.manage` |
| Set agent custom prices | `pricing.manage` |
| Trigger catalog sync | `providers.manage` |

---

## Database Schema

> **Merged into [`02_DATABASE_SCHEMA.md`](./02_DATABASE_SCHEMA.md)** — product_categories, products, product_variants, provider_product_mappings, agent_product_prices.

Tier pricing (`agent_levels`) deferred to future phase — use `agent_product_prices` for custom pricing.

---

## Related Docs

- [02_DATABASE_SCHEMA.md](./02_DATABASE_SCHEMA.md)
- [04_PROVIDER_ESALE.md](./04_PROVIDER_ESALE.md)
- [05_PROVIDER_IMEDIA.md](./05_PROVIDER_IMEDIA.md)
- [06_ORDER_FULFILLMENT.md](./06_ORDER_FULFILLMENT.md)
- [07_AGENT_API.md](./07_AGENT_API.md)
- [16_B2C_CHECKOUT_FLOW.md](./16_B2C_CHECKOUT_FLOW.md)
