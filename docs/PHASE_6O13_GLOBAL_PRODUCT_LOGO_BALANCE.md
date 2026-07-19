# Phase 6O.13 — Global Product Logo & Card Visual Balance

**Date:** 2026-06-23  
**Build marker:** `WEB_BUILD_VERSION=6O13`  
**Scope:** Customer UI only — shared product logo system for selectors.

---

## Summary

| Task | Deliverable |
|------|-------------|
| 1 Shared component | `CustomerProductLogo` + `ProductSelectorCard` |
| 2 Logo sizing | ~20–25% smaller; responsive max dimensions |
| 3 Text rules | CARD: logo only; TOPUP/DATA: logo or carrier text |
| 4 Categories | Unchanged (`CategoryQuickSelect`) |
| 5 Fallback | Letter square for cards; no emoji |
| 6 Brands | Centered, object-contain, consistent weight |
| 7 Deploy | `docker compose ... up -d --build web` |

---

## Task 1 — Shared components

**New files:**

- `apps/web/components/product/CustomerProductLogo.tsx`
- `apps/web/components/product/ProductSelectorCard.tsx`

**Applied to:**

| Surface | File |
|---------|------|
| Homepage quick checkout (`/#mua-the`) | `HomePageClient.tsx` |
| `/nap-cuoc` carrier selector | `TopupPageClient.tsx` |
| `/nap-cuoc` Data tab | `TopupPageClient.tsx` (`kind=data`) |

**Not applied to:** Admin, orders, invoices, `ProductCard` catalog listing, emails.

---

## Task 2 — Logo sizing

| Breakpoint | Card height | Logo area | Image max |
|------------|-------------|-----------|-----------|
| Mobile | 90px | 70px flex | 42×110px |
| Tablet (md) | 90px | 70px | 48×120px |
| Desktop (lg) | 110px | 70px | 52×130px |

`object-contain`, flex center both axes.

---

## Task 3 — Selector text rules

| Kind | With logo | Without logo |
|------|-----------|--------------|
| `card` (game/phone) | Logo only | Letter square (first initial) |
| `topup` / `data` | Logo only | Text: Viettel, Mobifone, etc. |

Accessibility: `aria-label` + `title` on `ProductSelectorCard` button.

---

## Task 4 — Category cards

`CategoryQuickSelect.tsx` unchanged — icon + category name retained.

---

## Task 5 — Fallback

CARD without logo:

```
rounded square + first letter (provider color)
```

No emoji fallback in product selectors.

---

## Task 6 — Visual balance checklist

| Brand | Context | Pass |
|-------|---------|------|
| Garena, Zing, Vcoin, Scoin, Gosu, Appota | Game selector | ☐ |
| Viettel, Vinaphone, Mobifone | Phone / topup | ☐ |
| Centered, no edge touch | All | ☐ |
| No stretch | All | ☐ |

---

## Task 7 — Deploy

```powershell
docker compose -f docker-compose.local-full.yml --env-file .env.local-full up -d --build web
```

| Check | Result |
|-------|--------|
| http://localhost/ | 200 |
| Build marker 6O13 | ✅ |

---

## Files changed

```
apps/web/components/product/CustomerProductLogo.tsx   (new)
apps/web/components/product/ProductSelectorCard.tsx  (new)
apps/web/components/home/HomePageClient.tsx
apps/web/components/topup/TopupPageClient.tsx
apps/web/lib/build-version.ts
docker-compose.local-full.yml
docs/PHASE_6O13_GLOBAL_PRODUCT_LOGO_BALANCE.md
```
