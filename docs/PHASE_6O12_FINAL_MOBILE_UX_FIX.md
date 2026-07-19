# Phase 6O.12 — Final Mobile Footer & Product Card UX Fix

**Date:** 2026-06-23  
**Build marker:** `WEB_BUILD_VERSION=6O12`  
**Scope:** UI only — no payment, order, provider, or schema changes.

---

## Summary

| Task | Change |
|------|--------|
| 1 Product selector | Logo-only cards; name via `aria-label` / `title` only |
| 2 Mobile footer | Single 2×2 CMS grid; removed Kết nối injection + company full-width block |
| 3 Responsive | Footer `pb-20` on mobile clears bottom nav |
| 4 Deploy | `docker compose ... up -d --build web` |

---

## Task 1 — Checkout product card (logo only)

**File:** `apps/web/components/home/HomePageClient.tsx`  
**Section:** "Chọn loại thẻ"

| Breakpoint | Card height | Logo max |
|------------|-------------|----------|
| Mobile | 90px | 56px (`max-h-14`) |
| Desktop | 110px | 70px × 160px |

- Product name **hidden visually** (removed label span)
- Accessibility: `aria-label={p.name}`, `title={p.name}`, `aria-pressed`
- Logo image: `alt=""` + `aria-hidden` (name on button)
- Logo centered on both axes (`items-center justify-center`)
- Product name unchanged everywhere else (admin, orders, SEO, etc.)

---

## Task 2 — Mobile footer layout

**Files:** `apps/web/components/layout/Footer.tsx`, `apps/web/lib/footer-config.ts`

**Removed:**
- Separate mobile company full-width block
- `padFooterLinkColumnsForMobile()` / `FOOTER_CONNECT_COLUMN` (Facebook, Zalo, Kết nối)

**Mobile (≤767px):**
```
grid-cols-2 gap-x-8 gap-y-8
[Company]  [Services]
[Policies] [Support]
```
Renders `footerColumns` from CMS only — no synthetic columns.

**Desktop:** unchanged 4-column layout (`lg:grid-cols-4`).

**Bottom nav clearance:** `pb-20 md:pb-0` on `<footer>`.

---

## Task 3 — Responsive checklist

| Viewport | Check | Pass |
|----------|-------|------|
| 375px | Footer 2×2, no orphan full-width column | ☐ |
| 375px | Product cards logo-only, centered | ☐ |
| 430px | Same as 375 | ☐ |
| 768px | Desktop footer layout | ☐ |
| Desktop | 4-col footer, logo cards 110px | ☐ |
| All | No horizontal scroll | ☐ |
| Mobile | Copyright visible above bottom nav | ☐ |

---

## Task 4 — Deploy

```powershell
docker compose -f docker-compose.local-full.yml --env-file .env.local-full up -d --build web
```

Verify:
```powershell
curl.exe -s http://localhost/ | Select-String "CardOn build 6O12"
```

| Check | Result |
|-------|--------|
| http://localhost/ | 200 |
| Build marker 6O12 | ✅ verified |

---

## Files changed

```
apps/web/components/home/HomePageClient.tsx
apps/web/components/layout/Footer.tsx
apps/web/lib/footer-config.ts
apps/web/lib/build-version.ts
docker-compose.local-full.yml
docs/PHASE_6O12_FINAL_MOBILE_UX_FIX.md
```
