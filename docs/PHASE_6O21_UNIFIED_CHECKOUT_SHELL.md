# Phase 6O.21 — Unified CheckoutShell + Hybrid Service Navigation

**Build marker:** `6O21`  
**Scope:** Customer web UI architecture — no database, order, payment, provider, ledger, fulfillment, or pricing engine changes.

## Goal

CARD / TOPUP / DATA feel like one smooth app while keeping separate SEO routes and business logic.

## Architecture

```
ServiceNavigation (shared, all pages)
        ↓
CheckoutShell (mode: CARD | TOPUP | DATA)
        ↓
Mode-specific flow UI + shared payment/summary panels
```

### Service registry (`lib/checkout-services.ts`)

Central config for all purchase services. Future services (Google Play, Steam Wallet, Software License) add one registry entry + catalog filter — no layout duplication.

| Service ID | Mode | Route | Navigation |
|------------|------|-------|------------|
| game | CARD | `/#mua-the` | Inline on `/` |
| phone | CARD | `/?category=phone#buy-card` | Inline on `/` |
| topup | TOPUP | `/nap-cuoc` | Link + prefetch |
| data | DATA | `/nap-data` | Link + prefetch |

## Task 1 — CheckoutShell

**File:** `components/checkout/CheckoutShell.tsx`

Props: `mode`, `initialCategory`, `title`, `description`, `anchorId`, `serviceUnavailable`

| Mode | Flow |
|------|------|
| CARD | Category → logo → variant → quantity → email → payment |
| TOPUP | Phone → carrier → amount → payment |
| DATA | Phone → carrier → package → payment |

Supporting files:
- `components/checkout/CheckoutSummaryPanels.tsx` — card + telco summary sidebars
- `components/checkout/CheckoutShell.tsx` — unified state, validation, pay handler

## Task 2 — ServiceNavigation

**File:** `components/checkout/ServiceNavigation.tsx`

- Used inside CheckoutShell (homepage, `/nap-cuoc`, `/nap-data`)
- CARD on homepage: `<button>` local category switch
- CARD on other routes: crawlable `<Link href="/#mua-the">`
- TOPUP/DATA: `<Link href="..." prefetch>`

Replaces `CategoryQuickSelect.tsx` (removed).

## Task 3 — Smooth transitions

- Category switch on homepage: `transition-opacity duration-200` with brief fade (`contentVisible` state)
- Content keyed by `transitionKey` (`CARD-game`, `CARD-phone`, `TOPUP`, `DATA`)
- `CheckoutSkeleton` while products load

## Task 4 — Route architecture

| Route | Page client | CheckoutShell mode |
|-------|-------------|-------------------|
| `/` | `HomePageClient` | CARD |
| `/nap-cuoc` | `TopupPageClient` | TOPUP |
| `/nap-data` | `DataPageClient` | DATA |

SEO metadata unchanged on each route. Page heroes / benefits remain page-specific wrappers.

## Task 5 — Active service state

| Page | Active tab |
|------|------------|
| `/` (game default) | Thẻ game |
| `/` (phone selected) | Thẻ điện thoại |
| `/nap-cuoc` | Nạp cước |
| `/nap-data` | Nạp Data |

Selected: blue gradient, shadow, icon scale highlight.

## Task 6 — Prefetch

`prefetch: true` on TOPUP and DATA links in service registry.

## Verification

| Check | Expected |
|-------|----------|
| Homepage → Thẻ game / phone | CARD checkout, opacity transition |
| Homepage → Nạp cước | Client nav to `/nap-cuoc`, topup tab active |
| Homepage → Nạp Data | Client nav to `/nap-data`, data tab active |
| SEO routes | `/`, `/nap-cuoc`, `/nap-data` still exist |
| Business logic | Unchanged validation, order create, payment |

## Build & deploy

```bash
npm run build:web

docker compose -f docker-compose.local-full.yml --env-file .env.local-full build web
docker compose -f docker-compose.local-full.yml --env-file .env.local-full up -d web
```
