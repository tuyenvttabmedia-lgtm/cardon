# Phase 6O30.2 HOTFIX — Revenue Logic & Public URL Standardization

**Build marker:** `6O30.2 HOTFIX`

Hotfix after Phase 6O30.1. No new features, no database/API contract changes.

---

## Task 1 — Revenue Dashboard (Admin → Quản lý đơn hàng)

### Bug

Summary cards (Tổng doanh thu, Giá vốn NCC, Phí thanh toán, Lợi nhuận) aggregated **all** orders matching filters, including `WAITING_PAYMENT`, `FAILED`, `EXPIRED`, etc.

### Fix

`src/modules/admin/repositories/admin.repository.ts` → `aggregateOrdersAdmin()`:

| Metric | Logic |
|--------|--------|
| Tổng doanh thu | Sum `sellAmount` — **PAID only** |
| Giá vốn NCC | Sum `providerCost` — **PAID only** |
| Phí thanh toán | Sum `paymentFeeAmount` — **PAID only** |
| Lợi nhuận | `sellAmount - providerCost - paymentFeeAmount` — **PAID only** |
| Số đơn | Unchanged — all orders per current filter |
| Tỉ lệ thành công | Unchanged |

Payment status enum: `OrderPaymentStatus.PAID`.

---

## Task 2–4 — SEO Preview URLs

### Bug

Google/OG previews showed `http://admin.localhost/...` because admin Docker build set `NEXT_PUBLIC_SITE_URL=http://admin.localhost` and `getPublicBaseUrl()` preferred that env.

### Fix

New helper: `apps/admin/lib/public-url.ts`

| Function | Purpose | ENV priority |
|----------|---------|--------------|
| `getFrontendUrl()` | Customer site (previews) | `NEXT_PUBLIC_FRONTEND_URL` → `NEXT_PUBLIC_CUSTOMER_SITE_URL` → `WEB_PUBLIC_URL` → `http://localhost` |
| `getAdminUrl()` | Admin panel | `NEXT_PUBLIC_ADMIN_URL` → `NEXT_PUBLIC_SITE_URL` |
| `getApiUrl()` | API `/api/v1` | via `getApiBaseUrl()` |
| `buildPublicPageUrl(path)` | Full frontend URL for slug paths | uses `getFrontendUrl()` |

Updated:

- `SeoPanel.tsx` — Google Preview, OG previews, canonical fallback
- `OpenGraphPreview.tsx` — Facebook, Telegram, Zalo, X hostname
- `CmsPageManager.tsx`, `ArticleEditor.tsx` — legacy editor previews
- `site-url.ts` — re-exports from `public-url.ts` (backward compatible)

Docker admin build arg: `NEXT_PUBLIC_FRONTEND_URL=${ADMIN_NEXT_PUBLIC_FRONTEND_URL:-http://localhost}`

Production: set `ADMIN_NEXT_PUBLIC_FRONTEND_URL=https://cardon.vn` in `.env` — no code change.

---

## Verify

### Orders

3 PAID + 2 PENDING + 1 FAILED → revenue sums **3 PAID only**; order count shows **6** (no payment filter).

### CMS Preview

Marketing → Bài viết → Google Preview:

```
http://localhost/tin-tuc/{category}/{slug}
```

Not `http://admin.localhost/...`

---

## Deploy

```bash
docker compose -f docker-compose.local-full.yml --env-file .env.local-full build api admin web
docker compose -f docker-compose.local-full.yml --env-file .env.local-full up -d
```

---

## Unchanged

Database, Prisma, migrations, Payment, Checkout, Provider, CMS Editor UI, SEO Score, frontend website UI, API response shapes.
