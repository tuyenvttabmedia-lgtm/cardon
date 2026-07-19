# Phase 6O.10 — Final Catalog Operation UX Fix

**Date:** 2026-06-23  
**Build marker:** `WEB_BUILD_VERSION=6O10`  
**Scope:** Footer UX, provider mapping lifecycle, homepage catalog defaults, product sort order — no payment/order fulfillment/ledger changes.

---

## Summary

| Task | Root cause | Fix |
|------|------------|-----|
| 1 Mobile footer | 3 link columns in 2-col grid left orphan full-width row | Company block + fixed 4-slot 2×2 grid (pad with Kết nối) |
| 2 Provider mapping | Hard unique on provider+variant blocked re-create after disable | Partial unique on ACTIVE triple; reactivate INACTIVE row on create |
| 3 Default selection | No product selected on load → empty denominations | Auto-select first category + first product |
| 4 Product sorting | Products listed alphabetically only | `sortOrder ASC, createdAt ASC` on API + client |
| 5–6 Regression + deploy | — | Docker rebuild, localhost verified |

---

## Task 1 — Mobile footer grid

**Files:** `apps/web/components/layout/Footer.tsx`, `apps/web/lib/footer-config.ts`

**Mobile layout:**
1. Block 1: Thông tin công ty (full width)
2. Block 2: `grid-cols-2 gap-x-8 gap-y-8 items-start` — always 4 equal slots

If CMS has 3 link groups → 4th slot = **Kết nối** (Facebook, Zalo).

**Desktop:** unchanged — `lg:grid-cols-4` (company + link columns).

---

## Task 2 — Provider mapping lifecycle

**Migration:** `prisma/migrations/20250623100000_phase_6o10_catalog_operation/migration.sql`

- Dropped `provider_product_mappings_provider_id_product_variant_id_key`
- Added partial unique: `(provider_id, product_variant_id, provider_product_code) WHERE status = 'ACTIVE'`

**API:** `ProviderMappingService`

- `createMapping`: reactivates matching INACTIVE row (updates cost/priority) instead of duplicate error
- `enableMapping`: new endpoint `POST /admin/products/provider-mappings/:id/enable`
- `updateMapping`: validates no active conflict when re-enabling or editing code

**Admin UI:** `apps/admin/app/products/page.tsx`

- Row shows provider, SKU, cost, priority, status badge
- **Ngừng hoạt động** badge when INACTIVE
- Buttons: **Sửa**, **Tạm ngừng**, **Kích hoạt lại**
- Inline edit form for cost/priority/SKU

---

## Task 3 — Default product selection

**File:** `apps/web/components/home/HomePageClient.tsx`

On load (fresh browser, no checkout restore):

1. First home category with products (`pickFirstHomeCategoryWithProducts`)
2. First product in that category
3. Denominations shown immediately

`/#mua-the` → defaults to **Thẻ game** when products exist.

Category change auto-selects first product in new category.

Empty variants message: **"Chưa có mệnh giá khả dụng"**

---

## Task 4 — Product sorting

**Schema:** `Product.sortOrder Int @default(0)`

**API:** `ProductRepository.findManyActive()` → `orderBy: [{ sortOrder: 'asc' }, { createdAt: 'asc' }]`

**Client:** `filterProductsByHomeCategory()` sorts by `sortOrder`, then `createdAt`

Categories already sorted by `sortOrder` in `CategoryRepository`.

---

## Task 5 — Regression checklist

### Mobile 375px — Footer

| Check | Pass |
|-------|------|
| Company full width on top | ☐ |
| 2×2 grid: Dịch vụ \| Chính sách | ☐ |
| Hỗ trợ \| Kết nối (4th slot) | ☐ |
| No single column spanning full width | ☐ |

### Admin — Provider mapping

| Step | Pass |
|------|------|
| Create mapping | ☐ |
| Disable → badge "Ngừng hoạt động" | ☐ |
| Re-create same provider+SKU → reactivates (no duplicate error) | ☐ |
| Kích hoạt lại button works | ☐ |
| Edit cost/priority via Sửa | ☐ |

### Homepage — Fresh browser

| Check | Pass |
|-------|------|
| Category pre-selected | ☐ |
| Product pre-selected (e.g. Garena) | ☐ |
| Denominations visible immediately | ☐ |
| /#mua-the selects game category | ☐ |

---

## Task 6 — Deploy verification

```powershell
docker compose -f docker-compose.local-full.yml --env-file .env.local-full build --no-cache api web admin
docker compose -f docker-compose.local-full.yml --env-file .env.local-full up -d
docker compose ... up -d --force-recreate nginx
```

| Check | Result |
|-------|--------|
| http://localhost/ | 200 |
| Build marker | `CardOn build 6O10` |
| Migration applied | `sort_order` on products, partial unique index |

---

## Files changed

```
apps/web/components/layout/Footer.tsx
apps/web/lib/footer-config.ts
apps/web/components/home/HomePageClient.tsx
apps/web/lib/home-catalog.ts
apps/web/types/api.ts
apps/web/lib/build-version.ts
apps/admin/app/products/page.tsx
apps/admin/services/api-client.ts
apps/admin/lib/i18n/vi.ts
src/modules/product/services/provider-mapping.service.ts
src/modules/product/controllers/product-admin.controller.ts
src/modules/product/repositories/product.repository.ts
src/modules/product/entities/product.mapper.ts
src/modules/product/product.service.spec.ts
prisma/schema.prisma
prisma/migrations/20250623100000_phase_6o10_catalog_operation/migration.sql
docker-compose.local-full.yml
docs/PHASE_6O10_CATALOG_OPERATION_FIX.md
```

---

## Notes

- Provider mappings are never hard-deleted — INACTIVE rows preserved for audit/reconciliation.
- Product `sortOrder` defaults to 0; admin reorder UI can be added in a future phase.
- Host `npm` unavailable; builds run inside Docker.
