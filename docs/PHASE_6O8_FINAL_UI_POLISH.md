# Phase 6O.8 — Final Customer UI Polish & Local Deploy

**Date:** 2026-06-18  
**Build marker:** `WEB_BUILD_VERSION=6O8`  
**Scope:** Customer web UI only — no payment, order, provider, ledger, or RBAC changes.

---

## Summary of fixes

| Task | Area | Change |
|------|------|--------|
| 1 | Mobile header | 64px height, logo 36–40px / max 140px, actions `ml-auto flex gap-2` |
| 2 | Category icons | API `iconUrl` → `resolveAssetUrl()` → `<img>` with emoji fallback |
| 3 | Product logos | Desktop box 56px / image max 42×110px; mobile box 48px / image max 36px |
| 4 | Auth layout | Transparent brand logo, feature cards, gradient decor, centered form max 420px |
| 5 | Mobile bottom nav | Active indicator, floating “Mua thẻ” FAB, account sheet (guest/logged-in) |
| 6 | Regression | Breakpoints 375 / 430 / 1280 / 1440 on key pages |
| 7 | Deploy | Clean `.next`, rebuild images, `docker compose up -d`, verify localhost |

---

## Task 1 — Mobile header

**Files:** `apps/web/components/layout/Header.tsx`, `MobileMenu.tsx`

- Mobile `h-16` (64px); desktop `lg:h-[72px]`
- Layout: `[Logo] … [Bell][Menu]` with `ml-auto flex items-center gap-2` on actions
- Logo: `h-9 max-w-[140px] object-contain` mobile, `md:h-10 md:max-w-none` desktop
- Mobile menu dropdown offset `top-16`

### Screenshot checklist — Header

| Viewport | Check | Pass |
|----------|-------|------|
| 375px | Logo readable, not tiny square | ☐ |
| 375px | Bell + hamburger aligned right | ☐ |
| 430px | Same as 375, no overlap | ☐ |
| 768px | Transition to desktop nav OK | ☐ |
| 1280px | Full header menu visible | ☐ |

---

## Task 2 — Category icon data chain

**Files:**

- `apps/web/lib/assets.ts` — `resolveAssetUrl()` for `/uploads/...` paths
- `apps/web/lib/home-catalog.ts` — `resolveHomeCategoryIcons(products, categories)`
- `apps/web/components/home/CategoryQuickSelect.tsx` — `iconUrl` → `<img>`, else emoji
- `apps/web/components/home/HomePageClient.tsx` — wires icons from API

**API (unchanged):** `GET /products/categories` returns `{ id, name, slug, iconUrl }` via `product.mapper.ts`.

**Priority:** `category.iconUrl` (absolute URL) → tab emoji fallback. Hardcoded slug icon map removed.

### Screenshot checklist — Categories

| Check | Pass |
|-------|------|
| Admin-uploaded category icon visible on homepage tabs | ☐ |
| Relative `/uploads/...` paths resolve (not broken img) | ☐ |
| Tabs without icon show emoji fallback | ☐ |

---

## Task 3 — Product logo size

**File:** `apps/web/components/home/HomePageClient.tsx`

| Breakpoint | Logo box | Image |
|------------|----------|-------|
| Mobile | `h-12` (48px) | `max-h-9` (36px) |
| Desktop | `h-14` (56px) | `max-h-[42px] max-w-[110px]` |

Uses `resolveAssetUrl(p.logoUrl)` for CMS paths.

### Screenshot checklist — Product cards

| Check | Pass |
|-------|------|
| Garena / Zing logos clearly visible | ☐ |
| Selected state checkmark not clipped | ☐ |
| 2-col mobile grid intact | ☐ |

---

## Task 4 — Auth pages polish

**Files:** `apps/web/components/auth/AuthLayout.tsx`, `apps/web/app/login/LoginPageClient.tsx`

- Left panel (desktop only): transparent CardOn logo, title, subtitle, 3 feature cards, card mockup + gradient circles
- Right form: vertically centered, `max-w-[420px]`, hint “Đăng nhập để tiếp tục” on login
- Mobile: left panel hidden, theme logo above form

### Screenshot checklist — Auth

| Viewport | Page | Check | Pass |
|----------|------|-------|------|
| 1280px | `/login` | No white rectangle behind logo | ☐ |
| 1280px | `/login` | Feature cards + mockup visible | ☐ |
| 1280px | `/register` | Form centered, not empty right side | ☐ |
| 375px | `/login` | Form only, no left panel | ☐ |
| 375px | `/register` | No horizontal scroll | ☐ |

---

## Task 5 — Mobile bottom nav

**File:** `apps/web/components/layout/MobileBottomNav.tsx`

- Items: Trang chủ · Mua thẻ (FAB) · Nạp cước · Data · Tài khoản (CMS-driven)
- Active: blue icon + text + top bar indicator
- Center “Mua thẻ”: 48×48 gradient circle, white icon, label below
- Account tap → sheet:
  - **Guest:** Đăng nhập / Đăng ký
  - **Logged in:** Thông tin tài khoản, Lịch sử giao dịch, Đơn hàng, Đăng xuất

### Screenshot checklist — Bottom nav

| Check | Pass |
|-------|------|
| FAB “Mua thẻ” elevated center | ☐ |
| Active route shows blue + top indicator | ☐ |
| Guest account sheet | ☐ |
| Logged-in account sheet | ☐ |
| Safe area padding on notched devices | ☐ |

---

## Task 6 — Full UI regression

### Pages

| Route | 375 | 430 | 1280 | 1440 |
|-------|-----|-----|------|------|
| `/` | ☐ | ☐ | ☐ | ☐ |
| `/login` | ☐ | ☐ | ☐ | ☐ |
| `/register` | ☐ | ☐ | ☐ | ☐ |
| `/blog` | ☐ | ☐ | ☐ | ☐ |
| Product checkout (home flow) | ☐ | ☐ | ☐ | ☐ |

### Global checks

| Check | Pass |
|-------|------|
| No horizontal scroll | ☐ |
| Header logo correct size | ☐ |
| Category / product icons not tiny | ☐ |
| Footer + bottom nav not overlapping content | ☐ |

---

## Task 7 — Local deploy

### Commands

```powershell
Remove-Item -Recurse -Force apps\web\.next, apps\admin\.next -ErrorAction SilentlyContinue

# Local npm (when Node available on host):
npm run build
npm run build:web
npm run build:admin

docker compose -f docker-compose.local-full.yml --env-file .env.local-full build --no-cache web admin api

docker compose -f docker-compose.local-full.yml --env-file .env.local-full up -d

# If 502 after web recreate, restart nginx:
docker compose -f docker-compose.local-full.yml --env-file .env.local-full up -d --force-recreate nginx
```

### Verification (2026-06-23)

```powershell
curl.exe -s -o NUL -w "%{http_code}" http://localhost/          # 200
curl.exe -s http://localhost/ | Select-String "CardOn build 6O8"  # FOUND
curl.exe -s http://localhost/api/v1/products/categories         # iconUrl present
```

| Check | Expected | Pass |
|-------|----------|------|
| Homepage HTTP 200 | 200 | ✅ |
| `/login` HTTP 200 | 200 | ✅ |
| `/register` HTTP 200 | 200 | ✅ |
| `/blog` HTTP 200 | 200 | ✅ |
| HTML build comment | `CardOn build 6O8` | ✅ |
| Categories API includes `iconUrl` | yes (`local-demo-cards` has upload path) | ✅ |
| Auth left panel (desktop) | title, features, no white logo box | ✅ (browser snapshot) |
| Login form hint | "Đăng nhập để tiếp tục" | ✅ |
| Mobile bottom nav FAB | 🛒 Mua thẻ elevated | ✅ (browser snapshot) |
| nginx recreated after web | no 502 | ✅ |

**Host npm:** Node/npm not on PATH in agent shell; `web`/`admin`/`api` compiled inside Docker (`npm run build` runs in Dockerfile.frontend / Dockerfile.api).

---

## Files changed (Phase 6O.8)

```
apps/web/components/layout/Header.tsx          (6O.7 carry + 6O8 verify)
apps/web/components/layout/MobileMenu.tsx
apps/web/components/layout/MobileBottomNav.tsx
apps/web/components/home/CategoryQuickSelect.tsx
apps/web/components/home/HomePageClient.tsx
apps/web/components/auth/AuthLayout.tsx
apps/web/app/login/LoginPageClient.tsx
apps/web/lib/assets.ts
apps/web/lib/home-catalog.ts
apps/web/lib/build-version.ts
docker-compose.local-full.yml                 (WEB_BUILD_VERSION 6O8)
docs/PHASE_6O8_FINAL_UI_POLISH.md
```

---

## Notes

- Host `npm` was unavailable in the agent shell; Docker multi-stage builds compile web/admin inside containers (equivalent to `npm run build` / `build:web` / `build:admin`).
- Fixed TypeScript build error: `Product.category` nested type omits `iconUrl`; icon resolution uses `categories` list via `byId.get(categoryId)`.
- Category icons require admin upload on `ProductCategory.iconUrl`; emoji shows until set. API confirms `local-demo-cards` → `/uploads/products/...png`.
- Product `logoUrl` must be set per product in admin for card logos to appear.
