# Phase 6O.14 — Product Selector Compact UI

**Date:** 2026-06-23  
**Build marker:** `WEB_BUILD_VERSION=6O14`  
**Scope:** UI only — `ProductSelectorCard` + logo sizing + grid gaps.

---

## Problem

After removing product names from "Chọn loại thẻ", cards kept 110px height → excess whitespace. Logos are now full-canvas uploads and need less aggressive shrinking.

---

## Changes

### ProductSelectorCard heights

| Breakpoint | Before | After |
|------------|--------|-------|
| Mobile | 90px | **72px** |
| Tablet (md) | 90px | **76px** |
| Desktop (lg) | 110px | **82px** |

### Logo max size (`CustomerProductLogo`)

| Breakpoint | max-height | max-width |
|------------|------------|-----------|
| Mobile | 38px | 110px |
| Tablet (md) | 42px | 125px |
| Desktop (lg) | 48px | 145px |

- Logo wrapper: `h-auto`, flex center
- No product name in selector (unchanged)

### Card style

- `rounded-xl`, border, selected blue border
- Hover: `shadow-sm`, `-translate-y-px` (when enabled)
- Check icon: **18px** mobile, **20px** desktop

### Grid gaps

| Surface | Layout | Gap |
|---------|--------|-----|
| Homepage selector | 2 col mobile, 4 col desktop | 12px / 16px |
| `/nap-cuoc` carriers | 2 col mobile, 4 col sm+ | 12px / 16px |

**Unchanged:** `CategoryQuickSelect`, admin, order detail.

---

## Files changed

```
apps/web/components/product/ProductSelectorCard.tsx
apps/web/components/product/CustomerProductLogo.tsx
apps/web/components/home/HomePageClient.tsx
apps/web/components/topup/TopupPageClient.tsx
apps/web/lib/build-version.ts
docker-compose.local-full.yml
docs/PHASE_6O14_PRODUCT_SELECTOR_COMPACT.md
```

---

## Deploy

```powershell
docker compose -f docker-compose.local-full.yml --env-file .env.local-full up -d --build web
```

| Check | Result |
|-------|--------|
| http://localhost/ | OK |
| Build marker `<!-- CardOn build 6O14 -->` | Verified |
| Docker `cardon-local-full-web` | Recreated, started |

---

## Visual checklist

| Viewport | Cards compact, logo centered | Pass |
|----------|------------------------------|------|
| 375px | 72px height, 2-col gap 12 | ✅ |
| 768px | 76px height | ✅ |
| Desktop | 82px height, 4-col gap 16 | ✅ |
| Hover lift | shadow-sm + translate | ✅ |
