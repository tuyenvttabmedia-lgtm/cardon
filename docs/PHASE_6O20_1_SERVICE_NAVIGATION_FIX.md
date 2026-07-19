# Phase 6O.20.1 — Homepage Service Navigation Fix

**Build marker:** `6O20.1`  
**Scope:** Customer web homepage navigation UI only — CARD/TOPUP/DATA checkout flows remain separate.

## Problem

After Phase 6O.19/6O.20, the homepage service selector only showed **Thẻ game** and **Thẻ điện thoại**, hiding **Nạp cước** and **Nạp Data** from service discovery.

## Solution

Restore all four service categories in the homepage selector as **navigation**, without merging checkout logic.

| Service | Homepage behavior |
|---------|-------------------|
| Thẻ game | Stay on `/`, CARD checkout, filter game cards |
| Thẻ điện thoại | Stay on `/`, CARD checkout, filter phone cards |
| Nạp cước | Crawlable link → `/nap-cuoc` |
| Nạp Data | Crawlable link → `/nap-data` |

## Task 1 — Service selector UI

- Four items using the compact 6O.20 card/segment style
- **Desktop:** 4 columns centered (`sm:grid-cols-4`, `rounded-full` container)
- **Mobile:** 2×2 grid (`grid-cols-2`, `rounded-2xl` container)
- Each item: icon + title; optional description on `sm+`

## Task 2 — Behavior

- CARD tabs: `<button>` with `onCardCategoryChange` — no route change
- TOPUP/DATA: Next.js `<Link href="/nap-cuoc">` and `<Link href="/nap-data">` — no homepage checkout rendered

## Task 3 — Active state

- Only CARD categories (`game`, `phone`) use selected gradient state
- TOPUP/DATA links never show active/selected styling on homepage

## Task 4 — Admin / catalog compatibility

- Tab list derived from `HOME_CATEGORY_TABS` in `home-catalog.ts`
- Visibility filtered by `getVisibleHomeServiceTabs(products)` — tabs hidden when no active products exist for that service type
- Icons resolved dynamically via `resolveHomeCategoryIcons(products, categories)` from CMS/API categories

### Service mapping helpers

```typescript
isHomeCardService(id)   // game | phone → homepage checkout
homeServiceNavHref(id)  // topup → /nap-cuoc, data → /nap-data
```

## Task 5 — SEO

TOPUP and DATA use real anchor tags via `next/link` (renders `<a href="...">`), crawlable without client-only `router.push`.

## Files changed

- `apps/web/lib/home-catalog.ts` — service nav helpers, rename Data → Nạp Data
- `apps/web/components/home/CategoryQuickSelect.tsx` — 4-item grid, Link vs button
- `apps/web/components/home/HomePageClient.tsx` — pass products, full category icons

## Verification

| Check | Expected |
|-------|----------|
| Homepage selector | 4 services visible |
| Click Thẻ game / Thẻ điện thoại | Stay on homepage, CARD checkout updates |
| Click Nạp cước | Navigate to `/nap-cuoc` |
| Click Nạp Data | Navigate to `/nap-data` |
| Payment / provider / order | Unchanged |

## Build & deploy

```bash
npm run build:web

docker compose -f docker-compose.local-full.yml --env-file .env.local-full build web
docker compose -f docker-compose.local-full.yml --env-file .env.local-full up -d web
```
