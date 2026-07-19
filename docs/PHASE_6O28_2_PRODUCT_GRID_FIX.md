# Phase 6O28.2 — Product Grid Fix

**Build marker:** `6O28.2`  
**Date:** 2026-06-18  
**Scope:** Fix product selector grid regression. UI only — no checkout/payment logic changes.

---

## Root cause

Phase 6O28 put responsive grid classes in `lib/catalog-grid.ts`, but Tailwind `content` only scanned `app/` and `components/`. Classes **`grid-cols-3`** and **`lg:grid-cols-5`** were never compiled into CSS.

Result:
- **Mobile:** default single-column grid (missing `grid-cols-3`)
- **Desktop:** stuck at `md:grid-cols-4` from other pages (missing `lg:grid-cols-5`)

---

## Fix

### Single shared component

`components/catalog/CatalogSelectorGrid.tsx`

```tsx
grid grid-cols-3 gap-2 md:grid-cols-4 lg:grid-cols-5 lg:gap-3
```

Used by `CheckoutShell` for:
- Chọn loại thẻ
- Chọn nhà mạng
- Chọn mệnh giá
- Chọn gói Data

Also used by `ProductPageClient` (checkout flow).

### Card sizing

- `CatalogSelectCard`: added `min-w-0` on buttons (width from grid cell only)
- No fixed width / flex-basis on cards
- Height, border, hover, selected state, logo size unchanged

### Tailwind config

Added `./lib/**/*` to `content` paths to prevent future missed utilities.

### Removed

- `lib/catalog-grid.ts` (string constant approach)

---

## Responsive layout

| Breakpoint | Columns |
|------------|---------|
| Mobile (<768px) | 3 |
| Tablet (768–1023px) | 4 |
| Desktop (≥1024px) | 5 |

---

## Deploy

```powershell
docker compose --env-file .env.local-full -f docker-compose.local-full.yml build web
docker compose --env-file .env.local-full -f docker-compose.local-full.yml up -d web
```

Verify: `http://localhost` — HTML comment `<!-- CardOn build 6O28.2 -->`

---

**CardOn build 6O28.2**
