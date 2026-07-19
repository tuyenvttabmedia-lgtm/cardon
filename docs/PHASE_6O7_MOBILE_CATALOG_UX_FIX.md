# Phase 6O.7 — Mobile UX + Dynamic Catalog Assets

**Date:** 2026-06-18  
**Scope:** UAT mobile UX fixes and CMS-driven catalog assets. No payment, provider, or order logic changes.

---

## Summary

Phase 6O.7 addresses seven UAT items: mobile footer layout, compact header menu, CMS mobile bottom navigation, homepage FAQ binding, dynamic product/category images, product card polish, and deployment verification.

---

## Task 1 — Mobile Footer Redesign

**Problem:** On mobile, all footer columns stacked vertically in a single column.

**Fix:** `apps/web/components/layout/Footer.tsx`

- ≤767px (`max-md`): company info block is full width at the top.
- Link columns render in a **2-column grid** below company info.
- Desktop (`md+`) unchanged: company column + link columns in the existing 4-column grid.

---

## Task 2 — Mobile Header Menu UX

**Problem:** Full-height right drawer felt too large.

**Fix:** `apps/web/components/layout/MobileMenu.tsx`, `Header.tsx`

- Replaced drawer with a **compact dropdown panel** positioned below the header (`top: 72px`).
- Width: `calc(100% - 24px)`, auto height, content-driven.
- Includes nav links, divider, and auth actions:
  - **Guest:** Login / Register
  - **Logged in:** Account, Orders, Logout
- Header toggle button opens/closes the panel.

---

## Task 3 — CMS Mobile Bottom Navigation

**Backend**

- Added `cms.theme.mobile_nav` setting key.
- Default seed: Trang chủ, Mua thẻ, Nạp cước, Data, Tài khoản (requireLogin).
- Exposed via `GET /cms/theme` as `mobileNav`.

**Admin**

- Marketing → Appearance → **Mobile Navigation** editor with fields: label, icon, url, sortOrder, requireLogin, active.

**Frontend**

- `MobileBottomNav.tsx` loads items from `useThemeSettings().mobileNav`.
- Guests tapping login-required items go to `/login`.

---

## Task 4 — Homepage FAQ CMS Binding

**Fix:** `HomePageClient.tsx`, `FaqSection.tsx`

- Homepage uses `GET /cms/faq?category=homepage`.
- Shows max **5** items via `maxItems={5}`.
- Removed hardcoded fallback FAQ on homepage; content managed in Marketing → FAQ.

---

## Task 5 — Dynamic Product Images

**Schema migration:** `20250622120000_phase_6o7_catalog_assets`

| Model | Field |
|-------|-------|
| `ProductCategory` | `iconUrl` |
| `Product` | `logoUrl`, `bannerUrl` (optional) |

**Admin:** Product/category edit modals use Media Library picker (`MediaImageField`).

**Frontend**

- Homepage category tabs: `category.iconUrl` when matched by slug hints (fallback to emoji).
- Product cards: `product.logoUrl` with letter/color fallback only when empty.

---

## Task 6 — Product Card Mobile Polish

**Fix:** `HomePageClient.tsx`

- Logo centered, name below.
- Card: `rounded-[14px]`, `p-4` (16px), selected blue border.
- Grid: **2 columns** mobile, `auto-fill` minmax grid on desktop.

---

## Task 7 — Build & Deploy

### Commands run

```bash
npx prisma generate
npm run build          # NestJS API — pass
npm run build:web      # pass
npm run build:admin    # pass
npm test               # 385/394 pass (5 pre-existing failures, out of scope)
docker compose -f docker-compose.local-full.yml --env-file .env.local-full up -d --build
docker exec cardon-local-full-api npx prisma migrate deploy
```

### Local URLs

- Web: http://localhost
- Admin: http://admin.localhost

---

## Files Changed (high level)

| Area | Key files |
|------|-----------|
| Footer | `apps/web/components/layout/Footer.tsx` |
| Header menu | `MobileMenu.tsx`, `Header.tsx` |
| Bottom nav | `MobileBottomNav.tsx`, CMS theme backend + admin appearance |
| FAQ | `FaqSection.tsx`, `HomePageClient.tsx` |
| Catalog assets | `prisma/schema.prisma`, migration, product module, admin products |
| Product cards | `HomePageClient.tsx`, `CategoryQuickSelect.tsx`, `home-catalog.ts` |

---

## Verification checklist

- [ ] Mobile footer: company block full width, menu columns 2×2 grid
- [ ] Mobile header: compact dropdown below header with auth buttons
- [ ] Bottom nav reflects CMS settings (Appearance → Mobile Navigation)
- [ ] Homepage FAQ shows CMS items with category `homepage` (max 5)
- [ ] Product logos/icons from admin Media Library appear on homepage
- [ ] Product cards: centered logo, 14px radius, 2-col mobile grid
- [ ] Desktop footer and header unchanged

---

## Out of scope

Payment transaction logic, provider integration, ledger, and order flow were not modified.

Pre-existing test failures (payment webhook mocks, admin operation mapper) remain unchanged from prior phases.
