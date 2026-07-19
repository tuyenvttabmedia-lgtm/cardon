# Phase 6O31 — Product Engine Architecture & System Health

## Overview

Phase 6O31 upgrades the Product Engine from **runtime-computed** `homeService` (category tree walk) to **persisted columns** on `ProductCategory` and `Product`, and adds a full **System Health Check** for admin operations.

No changes to customer UI, checkout, payment, or provider adapters.

---

## Product Architecture

### Before (6O30.3)

```text
Product.categoryId → Category tree → root slug → computed homeService (runtime)
```

### After (6O31)

```text
ProductCategory.homeService  (source of truth)
        ↓
Product.homeService          (persisted copy, indexed)
        ↓
API GET /products            (direct read, no tree walk)
```

### Database

| Model | Field | Type | Notes |
|-------|-------|------|-------|
| `ProductCategory` | `homeService` | `HomeServiceType` enum | Required, indexed |
| `Product` | `homeService` | `HomeServiceType` enum | Required, indexed, copied from category |

Enum values: `GAME_CARD`, `PHONE_CARD`, `TOPUP`, `DATA`

Migration: `20250626140000_phase_6o31_product_home_service_persist`

---

## Category Architecture

Category **owns** business classification via `homeService` column.

```text
Category
  id
  name
  slug
  homeService   ← canonical field
  parentId      ← optional hierarchy (organizational only)
```

Rules:

- Admin must set `homeService` when creating a category
- Parent category (if any) must share the same `homeService`
- Changing category `homeService` cascades to all products in that category

---

## homeService Flow

### Create Product

1. Admin selects category
2. Backend reads `category.homeService`
3. Product saved with same `homeService` — admin cannot override

### Update Product Category

1. New category resolved
2. `product.homeService` updated from new category

### Update Category homeService

1. Category updated
2. `UPDATE products SET homeService = … WHERE category_id = …`

### Public API

`GET /products` and `GET /products/categories` return persisted `homeService` — no runtime computation.

---

## ProductIntegrityService

Location: `src/modules/product/services/product-integrity.service.ts`

| Check | Severity | Auto Fix |
|-------|----------|----------|
| Product missing valid category | Error | No |
| Product.homeService ≠ Category.homeService | Error | Yes — sync from category |
| Category missing homeService | Error | Yes — infer from slug (repair) |
| Product without logo | Warning | No |
| Product without active variants | Warning | No |
| Product INACTIVE + Variant ACTIVE | Warning | Yes — disable variants |
| Duplicate slug / SKU | Error | No |
| Variant type wrong for homeService | Error | No |
| Variant without provider mapping | Warning | No |
| Provider cost > sell price | Error | No |
| Provider disabled + mapping ACTIVE | Error | Yes — disable mapping |
| Variant orphan (no product) | Error | No |

---

## System Health Check

### API

| Method | Path | Description |
|--------|------|-------------|
| GET | `/admin/system/health` | Summary (score, status) |
| GET | `/admin/system/health/report` | Last full report |
| POST | `/admin/system/health/run` | Run scan now |
| POST | `/admin/system/health/autofix` | Apply safe auto fixes |

Permission: `settings.manage`

### Domains

| Domain | Checks |
|--------|--------|
| Product | ProductIntegrityService |
| Provider | Inactive providers |
| Payment | No gateway enabled |
| Email | SMTP not configured |
| Queue | Worker heartbeat / Redis |
| Storage | Uploads directory |
| SEO | Published CMS pages missing SEO |

### Admin UI

- **Settings → System Health** — full report, filters (All/Error/Warning/OK), Auto Fix
- **Dashboard** — System Health widget (score + link)

### Cron

- Runs daily at **03:00** (worker process)
- Sends Telegram alert when errors found (if Telegram enabled)

---

## Auto Fix Rules

| Issue | Action |
|-------|--------|
| homeService mismatch | Sync product from category |
| Category missing homeService | Infer from slug, cascade products |
| Provider disabled + mapping active | Disable mapping |
| Product inactive + variants active | Disable variants |

Not auto-fixed: missing images, missing mappings, duplicate slugs, price violations.

---

## Future Extension

- Persist health report history in DB
- Email notifications alongside Telegram
- Per-product integrity webhooks
- Scheduled auto-fix for safe issues only
- Partner API health domain

---

## Build Marker

**6O31**

## Key Files

**Backend**

- `prisma/schema.prisma` — `HomeServiceType`, persisted columns
- `prisma/migrations/20250626140000_phase_6o31_product_home_service_persist/`
- `src/modules/product/entities/home-service.ts`
- `src/modules/product/services/product-integrity.service.ts`
- `src/modules/product/services/category.service.ts`
- `src/modules/product/services/product.service.ts`
- `src/modules/admin/services/system-health.service.ts`
- `src/modules/admin/services/system-health-cron.service.ts`
- `src/modules/admin/controllers/system-health.controller.ts`

**Admin**

- `apps/admin/app/settings/health/page.tsx`
- `apps/admin/app/dashboard/page.tsx`
