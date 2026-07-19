# Phase 2C.1 — Product Engine Audit

> Date: 2026-06-18  
> Scope: Audit only — Product Engine (`src/modules/product/`)  
> Not included: Order, Payment, Provider API, Agent API

---

## Executive Summary

| Overall | **FULL PASS** |
|---------|---------------|
| `npm run build` | **PASS** |
| `npm run test:product` | **PASS (21/21)** |
| Critical fixes | **1** (loss prevention validation) |

---

## Audit Checks

### CHECK 1: Provider mapping correctness

**Scenario:** Garena 100k → Provider A + Provider B (cùng variant, hai provider khác nhau).

| Item | Result |
|------|--------|
| Nhiều mapping ACTIVE trên một variant | **PASS** |
| Unique constraint `(provider_id, product_variant_id)` | **PASS** — tránh trùng cùng provider |
| `ProviderMappingService.createMapping()` | Cho phép gọi nhiều lần với `providerId` khác nhau |
| `ProviderMappingRepository.findActiveByVariantId()` | Lọc `status = ACTIVE`, sort theo `priority`, `providerCost` |

**Evidence:** `product.audit.spec.ts` — "supports Provider A and Provider B for Garena 100k"

---

### CHECK 2: Provider inactive handling

**Scenario:** Mapping bị disable → product vẫn ACTIVE, chỉ provider đó unavailable.

| Item | Result |
|------|--------|
| `POST /admin/products/provider-mappings/:mappingId/disable` | **PASS** (mới thêm) |
| `ProviderMappingService.disableMapping()` | Set mapping `status = INACTIVE` |
| Product status không đổi | **PASS** |
| Public API vẫn trả product ACTIVE | **PASS** (`ACTIVE_PRODUCT_WHERE` không phụ thuộc mapping) |

**Evidence:** `product.audit.spec.ts` — "disabling mapping does not affect product status"

---

### CHECK 3: Pricing priority

**Thứ tự yêu cầu:**

```
agent_product_prices  >  agent group price (future)  >  default sell_price
```

| Priority | Source | Status |
|----------|--------|--------|
| 1 | `agent_product_prices.agent_price` | **Implemented** — `PricingService.getAgentPrice()` |
| 2 | `agent_level_prices` | **Deferred** — chưa có schema |
| 3 | `product_variants.sell_price` | **Fallback** — qua `getCustomerPrice()` |

**Evidence:** `pricing.service.ts`, tests trong `product.service.spec.ts` + `product.audit.spec.ts`

---

### CHECK 4: Loss prevention

**Scenario:** Provider cost = 98,000 — Agent price = 97,000 → **Reject**

| Item | Result |
|------|--------|
| `PricingService.validateAgentPrice(variantId, agentPrice)` | **Implemented** (critical fix) |
| So sánh với `findLowestActiveCost()` (lowest ACTIVE mapping) | **PASS** |
| cost 98,000 / price 97,000 | **BadRequestException** |
| cost 98,000 / price 98,000+ | **Accept** |

**Ghi chú:** Validation sẵn sàng cho phase Agent API / admin set agent price. Chưa có endpoint CRUD `agent_product_prices` trong Product module (Agent API chưa implement) — gọi `validateAgentPrice()` khi thêm endpoint đó.

**Evidence:** `product.service.spec.ts`, `product.audit.spec.ts`

---

### CHECK 5: Sync protection (future)

**Rule documented** — `src/modules/product/entities/product-sync.rules.ts`

| Provider sync MAY update | Provider sync MUST NOT overwrite |
|--------------------------|----------------------------------|
| `provider_product_mappings.provider_cost` | `product_variants.sell_price` |
| `provider_product_mappings.status` (availability) | `agent_product_prices.agent_price` |
| `health_score` (future) | Catalog metadata (name, slug, face_value) |

Chưa implement `ProviderInterface.syncProduct()` — chỉ document rule cho phase sau.

**Evidence:** `PROVIDER_SYNC_RULES` constant + audit test

---

### CHECK 6: Soft delete

**Scenario:** Product delete → `status = INACTIVE`, `deleted_at` set — không physical delete.

| Entity | Method | Result |
|--------|--------|--------|
| Product | `ProductRepository.softDelete()` | **PASS** — INACTIVE + `deletedAt` |
| Variant | `VariantRepository.softDelete()` | **PASS** — INACTIVE + `deletedAt` |
| Physical `DELETE` | Không có trên repository | **PASS** |

**Evidence:** `product.repository.ts`, `variant.repository.ts`, audit + service tests

---

### CHECK 7: Cache preparation

**Policy documented** — `PRODUCT_CACHE_POLICY` in `product-sync.rules.ts`

| Allowed | Not allowed |
|---------|-------------|
| `product_list` cache (TTL, invalidate on mutation) | `agent_price_resolution` — luôn đọc DB |
| `category_tree` cache | `agent_product_prices` — không cache giá agent custom |

**Lý do:** Agent custom pricing thay đổi thường xuyên — stale cache gây sai giá / lỗ tài chính.

---

## Critical Fix Applied

| Issue | Fix |
|-------|-----|
| Thiếu loss prevention khi set agent custom price | Thêm `PricingService.validateAgentPrice()` + `ProviderMappingRepository.findLowestActiveCost()` |

## Non-Critical Additions (audit support)

| Change | Purpose |
|--------|---------|
| `POST .../provider-mappings/:mappingId/disable` | CHECK 2 — disable mapping riêng |
| `UpdateProviderMappingDto.status` | Admin có thể set INACTIVE qua PATCH |
| `product-sync.rules.ts` | CHECK 5 + CHECK 7 documentation |
| `product.audit.spec.ts` | Automated audit tests (11 tests) |

---

## Test Results

**Command:** `npm run test:product` (hoặc `jest --testPathPattern=product`)

| Suite | Tests | Result |
|-------|-------|--------|
| `product.service.spec.ts` | 10 | **PASS** |
| `product.audit.spec.ts` | 11 | **PASS** |
| **Total** | **21** | **PASS** |

**Build:** `npm run build` — **PASS**

---

## Findings (Non-Blocking)

| # | Finding | Severity | Recommendation |
|---|---------|----------|----------------|
| 1 | `agent_level_prices` chưa có schema | Info | Phase pricing tier sau |
| 2 | `validateAgentPrice()` chưa gắn endpoint | Low | Gọi khi implement Agent price CRUD |
| 3 | Provider sync chưa code | Info | Áp dụng `PROVIDER_SYNC_RULES` khi sync phase |
| 4 | Product list cache chưa implement | Info | Áp dụng `PRODUCT_CACHE_POLICY` khi thêm Redis cache |

---

## Intentionally Not Started

- Order module
- Payment module
- Provider API calls
- Agent API endpoints

---

**Phase 2C.1: COMPLETE — FULL PASS**
