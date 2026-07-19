# Phase 6O.20 — Catalog UX Regression Fix + Premium Selector Polish

**Build marker:** `6O20`  
**Scope:** Customer web UI only — no database, payment logic, provider, order, or pricing engine changes.

## Summary

Fixes the Phase 6O.19 regression where all product variants were shown together on catalog pages, and polishes category selector, payment method cards, and product card interactions.

## Task 1 — Denomination loading regression

### Problem
When no product was selected, `collectCatalogVariants()` fell back to aggregating variants from **all** products in the category — mixing Garena, Zing, Scoin, etc.

### Fix
- `collectCatalogVariants()` returns `[]` when `productFilter` is missing.
- **Homepage / mua thẻ:** auto-select first product in category on load and category change; reset variant when product changes; product click always selects (no toggle-off).
- **Nạp cước:** default carrier Viettel (or first available); bind `product` to selected carrier; reset variant on carrier change; phone auto-detect also updates product.
- **Nạp data:** default first available carrier; bind `product` to carrier; reset variant on carrier change.

### Files
- `apps/web/lib/catalog-variants.ts`
- `apps/web/components/home/HomePageClient.tsx`
- `apps/web/components/topup/TopupPageClient.tsx`
- `apps/web/components/topup/DataPageClient.tsx`

## Task 2 — Premium category selector

Replaced full-width grid with centered segmented control:
- `w-fit mx-auto`, white background, border, `rounded-full`, `p-1.5`, `shadow-sm`
- Buttons: `h-[42px]`, `px-5` mobile / `px-8` desktop, inline icon + label
- Active: blue gradient, white text, subtle shadow + scale
- Inactive: white, `hover:bg-blue-50`

### File
- `apps/web/components/home/CategoryQuickSelect.tsx`

## Task 3 — Compact payment method cards

- Desktop `58px`, mobile `54px` height, `p-3` padding
- Icon left, name + fee right; removed extra description spacing
- Grid: 2 columns desktop; 1–2 columns on narrow mobile (`min-[420px]:grid-cols-2`)
- Selected: blue border, light blue background, check badge
- Shared compact layout for desktop picker and mobile buttons

### File
- `apps/web/components/checkout/PaymentPanel.tsx`

## Task 4 — Product logo scale

Logo images use `max-w-[85%] max-h-[85%] object-contain` inside unchanged card heights (64px mobile / 72px desktop).

### File
- `apps/web/components/product/CustomerProductLogo.tsx`

## Task 5 — Visual polish

- Product/denom/data cards: `hover:-translate-y-px hover:shadow-md`
- Selected logo/data cards: blue border + check badge
- Selected denomination cards: check badge on blue background

### File
- `apps/web/components/catalog/CatalogSelectCard.tsx`

## Regression checklist

| Page | Action | Expected |
|------|--------|----------|
| Homepage | Load | First game product selected; only its denominations |
| Homepage | Select Zing | Only Zing denominations |
| Nạp cước | Load | Viettel selected; only Viettel denominations |
| Nạp data | Load | First carrier selected; only its packages |
| All | Payment sidebar | Compact method cards |
| Homepage | Category tabs | Centered segmented control, not full width |

## Build & deploy

```bash
npm run build:web

docker compose -f docker-compose.local-full.yml --env-file .env.local-full build web
docker compose -f docker-compose.local-full.yml --env-file .env.local-full up -d web
```

**Important:** Always pass `--env-file .env.local-full` so `NEXT_PUBLIC_API_URL` is baked correctly at build time.
