# Phase 6O30.3 — Product Service Mapping HOTFIX

## Root cause

The storefront classified CARD products into **Thẻ game** vs **Thẻ điện thoại** using a frontend regex heuristic (`isTelcoProduct`) on product slug/name. **Vietnamobile** did not match the telco pattern, so products assigned to category **Thẻ điện thoại** in admin still appeared under **Thẻ game**.

The frontend ignored `Product.categoryId` and the category tree entirely.

## Architecture decision

**Single canonical source:** `Product.categoryId` → `ProductCategory` tree → root category slug → computed `homeService`.

| Layer | Responsibility |
|-------|----------------|
| **Database** | `Product.categoryId` links product to a category; categories form a tree via `parentId` |
| **Backend** | Resolves `homeService` from category ancestry; validates product/variant compatibility |
| **API** | Returns `homeService` on products and categories — frontend must not guess |
| **Frontend** | Filters homepage/checkout/search by `product.homeService` only |

Root category slugs (fixed):

| Root slug | `homeService` | Homepage tab |
|-----------|---------------|--------------|
| `game-card` | `GAME_CARD` | Thẻ game |
| `phone-card` | `PHONE_CARD` | Thẻ điện thoại |
| `topup` | `TOPUP` | Nạp cước |
| `data` | `DATA` | Nạp Data |

Child categories (e.g. admin-created **Vietnamobile** under `phone-card`) inherit the parent service.

## Chosen mapping field

**Computed field: `homeService`** (enum `GAME_CARD | PHONE_CARD | TOPUP | DATA`)

Derived from **`ProductCategory` ancestry** anchored at root slugs above. Not stored as a separate DB column (no schema migration).

## Validation rules (admin API)

### Category create

- `homeService` is **required**
- Category is created as child of the matching root (unless explicit `parentId` under same service)
- Reserved slugs: `game-card`, `phone-card`, `topup`, `data`

### Product create/update

- Category must resolve to a `homeService` (valid tree or legacy slug hint)

### Variant create/update

| `homeService` | Allowed variant `type` |
|---------------|------------------------|
| `GAME_CARD` | `CARD` |
| `PHONE_CARD` | `CARD` |
| `TOPUP` | `TOPUP` |
| `DATA` | `DATA` |

Mismatch → `400 Bad Request`, not saved.

## Data repair

Script: `scripts/repair-product-home-service.ts`

- Ensures four root categories exist
- Reparents orphan categories using slug hints (category slugs only)
- Splits legacy mixed card buckets using provider product codes (integration data)

Run after deploy:

```bash
docker exec cardon-local-full-api node --experimental-strip-types /app/scripts/repair-product-home-service.ts
```

## Frontend changes

- Removed `isTelcoProduct` heuristic
- `filterProductsByHomeCategory()` uses `product.homeService === tab.homeService`
- `/cards` filters by `?service=GAME_CARD|PHONE_CARD|TOPUP|DATA`

## Regression checklist

- [ ] Create **Vietnamobile** in category **Thẻ điện thoại** → appears only under **Thẻ điện thoại**
- [ ] Create **Garena** in **Thẻ game** category → appears only under **Thẻ game**
- [ ] Create **Viettel Topup** → appears only under **Nạp cước**
- [ ] Create **Data package** → appears only under **Nạp Data**
- [ ] No product appears in multiple homepage services
- [ ] Admin: TOPUP variant on GAME_CARD category → validation error
- [ ] Homepage, checkout, search, product detail use same API `homeService`

## Build marker

`6O30.3 HOTFIX`

## Files modified

**Backend**

- `src/modules/product/entities/home-service.ts` (new)
- `src/modules/product/entities/product.mapper.ts`
- `src/modules/product/dto/category.dto.ts`
- `src/modules/product/services/category.service.ts`
- `src/modules/product/services/product.service.ts`
- `src/modules/product/services/variant.service.ts`
- `src/modules/product/home-service.spec.ts` (new)

**Scripts**

- `scripts/repair-product-home-service.ts` (new)
- `scripts/seed-local-full.ts`

**Frontend (web)**

- `apps/web/lib/home-catalog.ts`
- `apps/web/types/api.ts`
- `apps/web/app/cards/CardsPageClient.tsx`
- `apps/web/lib/build-version.ts`

**Admin**

- `apps/admin/app/products/page.tsx`
- `apps/admin/types/api.ts`
- `apps/admin/services/api-client.ts`
- `apps/admin/lib/build-version.ts`

**Infra**

- `docker-compose.local-full.yml`
