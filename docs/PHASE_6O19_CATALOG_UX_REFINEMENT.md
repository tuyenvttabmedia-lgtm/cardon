# Phase 6O.19 — Catalog UX Refinement (CARD / TOPUP / DATA)

**Date:** 2026-06-18  
**Build marker:** `6O19`  
**Scope:** Customer catalog UI density and fintech-style selection UX.  
**Out of scope:** API, database, provider, payment, order, pricing logic.

---

## Summary

| Task | Status | Notes |
|------|--------|-------|
| Compact category selector | **PASS** | max-w 600px, inline icon+text, 52–56px height |
| Product logo sizing | **PASS** | 64–72px cards, smaller logos |
| Show products by default | **PASS** | Variants visible without pre-selecting brand/carrier |
| Compact denomination cards | **PASS** | 72px, 3–4 columns, face value + sell price |
| DATA package cards | **PASS** | 80px, 2–3 columns, compact layout |
| Micro-interactions | **PASS** | hover shadow, transition, selected scale 1.01 |
| Shared CatalogSelectCard | **PASS** | logo / denomination / data variants |

---

## Shared component

`apps/web/components/catalog/CatalogSelectCard.tsx`

| Export | Use |
|--------|-----|
| `CatalogLogoCard` | Product / carrier logos (CARD, TOPUP, DATA) |
| `CatalogDenomCard` | Face value + sell price (CARD, TOPUP) |
| `CatalogDataPackageCard` | Data package layout |

Common behavior:

- `transition-all duration-200`
- `hover:shadow-sm`
- Selected: blue border, light blue bg (denomination: solid blue), `scale-[1.01]`

`ProductSelectorCard` now delegates to `CatalogLogoCard`.

---

## Category selector (Homepage)

`CategoryQuickSelect`:

- Container: `max-w-[600px] mx-auto`
- Desktop height: 56px (`h-14`)
- Mobile height: 52px (`h-[52px]`)
- Layout: icon + label inline, 2 columns
- Removed large descriptions for density

---

## Default catalog visibility

Helper: `apps/web/lib/catalog-variants.ts`

- `collectCatalogVariants()` aggregates variants from all products in scope
- Product/carrier selection **filters** the list (toggle off = show all)
- Variant selection does not clear unrelated lists
- Invalid variant cleared only when filtered out of catalog

### Behavior by flow

| Flow | On load | Filter |
|------|---------|--------|
| CARD (Home) | All products + all denominations in category | Product logo |
| TOPUP | All carriers + all denominations | Carrier logo |
| DATA | All carriers + all packages | Carrier logo |

---

## Sizing reference

### Logo cards

| | Desktop | Mobile |
|---|---------|--------|
| Card height | 72px | 64px |
| Logo max | 100×36px | 82×30px |

### Denomination cards

- Height: 72px
- Grid: 2 → 3 → 4 columns
- Face value prominent, sell price below

### DATA packages

- Height: 80px
- Grid: 2 mobile / 3 desktop
- Row 1: package name | face value
- Row 2: capacity / duration
- Row 3: sell price

---

## Files changed

- `apps/web/components/catalog/CatalogSelectCard.tsx` (new)
- `apps/web/lib/catalog-variants.ts` (new)
- `apps/web/components/home/CategoryQuickSelect.tsx`
- `apps/web/components/product/CustomerProductLogo.tsx`
- `apps/web/components/product/ProductSelectorCard.tsx`
- `apps/web/components/home/HomePageClient.tsx`
- `apps/web/components/topup/TopupPageClient.tsx`
- `apps/web/components/topup/DataPageClient.tsx`

---

## Build & deploy

```bash
npm run build:web
docker compose -f docker-compose.local-full.yml up -d --build web
```

Build marker: `6O19`
