# Phase 6O29 — Account UX, CMS & SEO Architecture Polish

Build marker: **6O29**

## Summary

Pre-UAT polish for account center navigation, CMS tags/categories, blog SEO URL structure, static pages, and dynamic sitemap.

**Unchanged:** Payment, Checkout, Provider Runtime, Fulfillment, Finance calculations.

---

## Task 1 — Account Navigation Fix

- Added `/tai-khoan/*` layout with shared `AccountLayoutClient`
- Explicit back links via `?from=orders|cards|topups|data` → `accountReturnPath()` (no `router.back()`)
- Legacy `/account/*` → 301 redirect to Vietnamese paths via `next.config.ts`

| Section | Path |
|---------|------|
| Thông tin | `/tai-khoan` |
| Lịch sử giao dịch | `/tai-khoan/lich-su-giao-dich` |
| Thẻ đã mua | `/tai-khoan/the-da-mua` |
| Nạp cước | `/tai-khoan/nap-cuoc` |
| Nạp Data | `/tai-khoan/nap-data` |
| Hỗ trợ | `/tai-khoan/ho-tro` |
| Đổi mật khẩu | `/tai-khoan/doi-mat-khau` |

---

## Task 2 — Account Menu: Nạp Data

Added menu item linking to `/tai-khoan/nap-data` with dedicated history page.

---

## Task 3 — Transaction History Filters

Lịch sử giao dịch filters: **Tất cả / Mua thẻ / Nạp cước / Nạp Data** (`CARD` / `TOPUP` / `DATA`).

Backend: `GET /account/orders?type=CARD|TOPUP|DATA`

---

## Task 4 — Marketing → Tags

- Delete with usage guard: `Tag đang được sử dụng bởi xx bài viết.`
- Hide / Show toggle (`isHidden` field)
- Duplicate slug/name validation on create/update

---

## Task 5 — Static Pages

Continued via Marketing → Trang tĩnh. Frontend renders from CMS at:

- `/gioi-thieu` (dedicated page + CMS fallback)
- `/huong-dan`, `/lien-he`
- `/chinh-sach-bao-mat`, `/dieu-khoan-su-dung`
- `/chinh-sach-thanh-toan`, `/chinh-sach-hoan-tien`

---

## Tasks 6–11 — Blog SEO URLs

| Before | After |
|--------|-------|
| `/tin-tuc?category=the-game` | `/tin-tuc/the-game` |
| `/tin-tuc/mua-the-garena` | `/tin-tuc/the-game/mua-the-garena-gia-re` |

- Routes: `app/tin-tuc/[category]/page.tsx`, `app/tin-tuc/[category]/[slug]/page.tsx`
- 301 redirect from `?category=` query on `/tin-tuc`
- Legacy `/tin-tuc/{slug}` → category page resolves post and redirects
- Breadcrumbs: Trang chủ → Tin tức → Danh mục → Bài viết
- Category CMS fields: SEO Title, Meta Description, Intro, Canonical, OG Image
- Dynamic sitemap includes `/tin-tuc`, category URLs, and article URLs

---

## Verification Checklist

- [x] Account navigation (explicit back paths)
- [x] Data history page + menu
- [x] Transaction type filters
- [x] Static pages CMS slugs
- [x] Category URL `/tin-tuc/{category}`
- [x] Article URL `/tin-tuc/{category}/{slug}`
- [x] Query string redirect
- [x] Breadcrumb hierarchy
- [x] Canonical metadata
- [x] Dynamic sitemap

---

## Deploy

```bash
docker compose -f docker-compose.local-full.yml --env-file .env.local-full up -d --build
```

Web: http://localhost | Admin: http://admin.localhost
