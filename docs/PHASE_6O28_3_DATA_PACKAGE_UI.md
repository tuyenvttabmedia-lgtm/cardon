# Phase 6O28.3 — DATA Package UI Optimization

**Build marker:** `6O28.3`  
**Date:** 2026-06-18  
**Scope:** Dedicated layout and card design for DATA packages. CARD/TOPUP denomination grids unchanged.

---

## Problem

DATA packages reused `CatalogSelectorGrid` (5/4/3 columns) and a compressed horizontal card layout, causing truncated names and unreadable cards.

---

## Solution

### Task 1 — CARD / TOPUP denominations (unchanged)

`CatalogSelectorGrid`: **3 / 4 / 5** columns (mobile / tablet / desktop)

Used for:
- Chọn loại thẻ
- Chọn nhà mạng
- Chọn mệnh giá (CARD & TOPUP)

### Task 2 — DATA dedicated grid

New `CatalogDataPackageGrid`:

```
grid grid-cols-2 gap-2.5 md:grid-cols-3 md:gap-3 lg:grid-cols-4
```

| Viewport | Columns |
|----------|---------|
| Mobile | 2 |
| Tablet | 3 |
| Desktop | 4 |

### Task 3 — DATA card redesign

`CatalogDataPackageCard` vertical layout:

1. **Package name** (e.g. DW20) — `break-words`, no truncate
2. **Quota + validity** (e.g. 4 GB / 3 ngày)
3. **Giá trị:** face value
4. **Giá bán:** sell price

### Task 4 — Card sizing

- DATA cards: `min-h-[116px]` (was fixed `h-20`)
- Padding `px-3 py-3`, relaxed line-height
- Hover / selected states unchanged

---

## Files changed

| File | Change |
|------|--------|
| `CatalogDataPackageGrid.tsx` | New 2/3/4 column grid |
| `CatalogSelectorGrid.tsx` | Comment — denominations only |
| `CatalogSelectCard.tsx` | Taller DATA cards, redesigned content |
| `data-variant-display.ts` | `packageName`, `quotaLabel`, `faceValueLabel` |
| `CheckoutShell.tsx` | DATA uses `CatalogDataPackageGrid` |

---

## Deploy

```powershell
docker compose --env-file .env.local-full -f docker-compose.local-full.yml build web
docker compose --env-file .env.local-full -f docker-compose.local-full.yml up -d web
```

Verify: `http://localhost/nap-data` — build comment `<!-- CardOn build 6O28.3 -->`

---

**CardOn build 6O28.3**
