# Phase 2C — Product Engine Report

> Date: 2026-06-18  
> Scope: Catalog hierarchy, provider mappings, pricing resolver, public + admin APIs  
> Not included: Order, Payment, Provider API calls, Agent API, Frontend

---

## Executive Summary

| Overall | **FULL PASS** |
|---------|---------------|
| `npm run build` | **PASS** |
| `npm run test:product` | **PASS (9/9)** |
| Architecture | Controller → Service → Repository → Prisma |

---

## Module Structure

```
src/modules/product/
├── product.module.ts
├── controllers/
│   ├── product-public.controller.ts
│   └── product-admin.controller.ts
├── services/
│   ├── category.service.ts
│   ├── product.service.ts
│   ├── variant.service.ts
│   ├── provider-mapping.service.ts
│   └── pricing.service.ts
├── repositories/
│   ├── category.repository.ts
│   ├── product.repository.ts
│   ├── variant.repository.ts
│   ├── provider-mapping.repository.ts
│   └── pricing.repository.ts
├── dto/
│   ├── category.dto.ts
│   ├── product.dto.ts
│   ├── variant.dto.ts
│   └── provider-mapping.dto.ts
└── entities/
    ├── product.constants.ts
    └── product.mapper.ts
```

---

## Product Hierarchy

```
Category (product_categories)
    ↓
Product (products)
    ↓
Variant (product_variants) — sellable SKU
    ↓
ProviderProductMapping (multi-provider)
```

### Variant types supported

| Type | Fulfillment (future) |
|------|----------------------|
| `CARD` | card_records |
| `TOPUP` | topup_transactions |
| `DATA` | topup_transactions |
| `SOFTWARE` | Reserved |

---

## Public API (no auth)

Base: `/api/v1/products`

| Method | Path | Description |
|--------|------|-------------|
| GET | `/products/categories` | Active categories only |
| GET | `/products` | Active products + active variants |
| GET | `/products/:id` | Active product detail |

**Filter rules:**

- Products: `status = ACTIVE` AND `deleted_at IS NULL`
- Variants: `status = ACTIVE` AND `deleted_at IS NULL`
- Categories: `status = ACTIVE`

---

## Admin API (JWT + `products.manage`)

Base: `/api/v1/admin/products`

| Method | Path | Description |
|--------|------|-------------|
| POST | `/categories` | Create category |
| PATCH | `/categories/:id` | Update category |
| POST | `/categories/:id/disable` | Disable category |
| GET | `/categories` | List all (incl. inactive) |
| POST | `/` | Create product |
| PATCH | `/:id` | Update product |
| POST | `/:id/disable` | Soft delete product |
| POST | `/:productId/variants` | Create variant |
| PATCH | `/variants/:variantId` | Update variant |
| POST | `/variants/:variantId/disable` | Soft delete variant |
| POST | `/variants/:variantId/provider-mappings` | Create mapping |
| PATCH | `/provider-mappings/:mappingId` | Update mapping |
| GET | `/variants/:variantId/provider-mappings` | List mappings |

**Permission:** `products.manage` (seeded for ADMIN + SUPER_ADMIN)

---

## Provider Mapping

One variant → many providers (no API calls):

```json
{
  "providerId": "uuid",
  "providerProductCode": "123",
  "providerCost": 95000,
  "priority": 0
}
```

Example: Garena 100k → eSale code `123`, iMedia code `456`

Unique constraint: `(provider_id, product_variant_id)`

---

## Pricing Rules

### `PricingService.getCustomerPrice(variantId)`

Returns `product_variants.sell_price` for ACTIVE variant.

### `PricingService.getAgentPrice(agentId, variantId)`

Priority:

| # | Source | Status |
|---|--------|--------|
| 1 | `agent_product_prices.agent_price` | **Implemented** |
| 2 | `agent_level_prices` | **Deferred** (not in schema) |
| 3 | `product_variants.sell_price` | **Fallback** |

---

## Soft Delete Policy

Never SQL `DELETE` on catalog entities.

| Entity | Disable action |
|--------|----------------|
| Product | `status = INACTIVE`, `deleted_at = NOW()` |
| Variant | `status = INACTIVE`, `deleted_at = NOW()` |
| Category | `status = INACTIVE` (no `deleted_at` column) |

Aligns with `docs/DATA_RETENTION_RULES.md`.

---

## Seed Update

Added permission:

```
products.manage — Manage product catalog, categories, variants
```

Assigned to `ADMIN` and `SUPER_ADMIN` (via PERMISSIONS list).

---

## Test Results

Command: `npm run test:product`

| Test | Result |
|------|--------|
| Create product | **PASS** |
| Create variant | **PASS** |
| Map provider | **PASS** |
| Customer price | **PASS** |
| Agent custom price priority | **PASS** |
| Agent price fallback | **PASS** |
| Inactive product hidden (active query) | **PASS** |
| Soft delete product | **PASS** |
| Customer price — variant not found | **PASS** |

```
Test Suites: 1 passed
Tests:       9 passed
```

---

## Validation

| Command | Result |
|---------|--------|
| `npm run build` | **PASS** |
| `npm run test:product` | **PASS (9/9)** |

---

## Intentionally Not Implemented

- Order creation / checkout
- Payment integration
- Provider API calls (eSale, iMedia)
- Agent catalog API endpoints
- Provider routing / `resolveProvider()`
- Agent level pricing table
- Frontend

---

## Next Phase (Not Started)

**Order module** per `docs/06_ORDER_FULFILLMENT.md`

---

**Phase 2C: COMPLETE — FULL PASS**
