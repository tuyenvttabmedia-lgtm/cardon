# Phase 6O30.2 UI HOTFIX — Mobile Alignment & Spacing Polish

**Build marker:** `6O30.2 UI HOTFIX`

UI-only hotfix after Phase 6O30.2. No database, API, or logic changes.

---

## Task 1 — Service Navigation (Mobile)

**File:** `apps/web/components/checkout/ServiceNavigation.tsx`

### Bug

On mobile, Thẻ game / Thẻ điện thoại appeared centered while Nạp cước / Nạp Data were left-aligned — inconsistent layout.

### Fix

Unified all 4 tabs to the same mobile layout:

```
[icon]  Title
        Subtitle
```

- Mobile: `flex-row items-start text-left`, `min-h-[52px]`, subtitle visible on all items
- Desktop (sm+): column centered layout unchanged
- Same padding, gap, and typography for every tab

---

## Task 2–3 — Footer Spacing

### Bug

Large white gap between last section (e.g. FAQ) and Footer on mobile — caused by stacked `pb-20` on `main` + `ServiceCheckoutPageLayout` (~160px total).

### Fix

| Location | Before | After |
|----------|--------|-------|
| `app/layout.tsx` main | `pb-20` | `page-footer-gap` → `pb-7` (28px) mobile |
| `ServiceCheckoutPageLayout` | `pb-20 md:pb-8` | removed (main handles gap) |
| `globals.css` `.page-shell` | `py-6` | `pt-6 md:py-8` (no extra mobile bottom) |
| `HuongDanPageClient` | extra `pb-12` | removed |

New utility `.page-footer-gap` = `pb-7 md:pb-8` (24–32px) applied once on `<main>`.

Footer keeps `pb-20` on mobile for fixed bottom nav clearance over footer content.

---

## Task 4 — Responsive Audit

Verified patterns at 320–414px:

- Service tabs: equal height, left-aligned icon + text stack
- No duplicate bottom padding stacks
- `overflow-x-hidden` on main preserved

---

## Deploy

```bash
docker compose -f docker-compose.local-full.yml --env-file .env.local-full build web
docker compose -f docker-compose.local-full.yml --env-file .env.local-full up -d web nginx
```

---

## Unchanged

Database, API, Payment, Checkout logic, Provider, CMS, SEO, routing.
