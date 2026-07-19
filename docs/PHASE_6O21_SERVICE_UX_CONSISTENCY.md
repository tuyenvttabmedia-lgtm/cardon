# Phase 6O.21 — Service Trust Bar & Layout Consistency

**Build marker:** `6O21`  
**Scope:** Customer web UI only — no checkout logic, provider logic, payment, or catalog API changes.

## Goal

Unified trust messaging and section order across CARD (homepage), TOPUP (`/nap-cuoc`), and DATA (`/nap-data`) so switching services does not cause layout jump.

## Layout order (all service pages)

```
Hero banner
    ↓
Service selector (ServiceNavigation)
    ↓
ServiceTrustBar
    ↓
Checkout area
```

`ServiceTrustBar` lives inside `CheckoutShell` immediately after `ServiceNavigation`, so CARD / TOPUP / DATA share the same placement without per-page duplication.

## Task 1 — Shared ServiceTrustBar

**File:** `apps/web/components/service/ServiceTrustBar.tsx`

| # | Icon | Title | Description |
|---|------|-------|-------------|
| 1 | ⚡ | Giao mã tức thì | Nhận thẻ ngay sau thanh toán |
| 2 | 🔒 | Thanh toán an toàn | QR ngân hàng & chuyển khoản bảo mật |
| 3 | 🎧 | Hỗ trợ 24/7 | Luôn sẵn sàng hỗ trợ bạn |

**Removed from TOPUP/DATA:** per-page “Chiết khấu tốt” / “Gói data đa dạng” benefit blocks — those were service-specific marketing claims and caused inconsistent messaging when users switched tabs.

## Task 2 — Position consistency

| Page | Hero | Trust bar location |
|------|------|-------------------|
| `/` (CARD) | `HeroBanner` | `CheckoutShell` → after `ServiceNavigation` |
| `/nap-cuoc` | `PageHero` | Same |
| `/nap-data` | `PageHero` | Same |

## Task 3 — Animation polish

Desktop trust cards:

- `hover:-translate-y-0.5` (2px lift)
- `hover:shadow-md`
- `hover:border-blue-100`
- `transition-all duration-200`

Icon: `h-10 w-10 rounded-full bg-blue-50` (40px circle).

## Task 4 — Mobile optimize

- Vertical compact stack (`flex flex-col gap-2`)
- Icon + title only on mobile; description shown from `md:` breakpoint
- Reduced padding (`p-2.5`) so checkout stays above the fold

## Task 5 — Cleanup

Removed duplicate `BENEFITS` markup from:

- `components/topup/TopupPageClient.tsx`
- `components/topup/DataPageClient.tsx`

## Files changed

| File | Change |
|------|--------|
| `components/service/ServiceTrustBar.tsx` | **New** shared trust bar |
| `components/checkout/CheckoutShell.tsx` | Import + render `ServiceTrustBar` after nav |
| `components/topup/TopupPageClient.tsx` | Remove local benefits grid |
| `components/topup/DataPageClient.tsx` | Remove local benefits grid |

## Verify

- [ ] Homepage — Thẻ game / Thẻ điện thoại: trust bar between selector and checkout
- [ ] `/nap-cuoc`: same trust bar, no old benefit grid above checkout
- [ ] `/nap-data`: same trust bar, no old benefit grid above checkout
- [ ] Switching service tabs: no layout jump (trust bar always present)
- [ ] Desktop hover polish on trust cards
- [ ] Mobile compact stack does not push checkout too far down

## Related

See also `docs/PHASE_6O21_UNIFIED_CHECKOUT_SHELL.md` for CheckoutShell architecture from the same build marker.

## Hero banner sync (6O.21 follow-up)

**Problem:** Homepage had CMS slide banner (`HeroBanner`, 180px / 340px) while `/nap-cuoc` and `/nap-data` used compact `PageHero`, causing layout jump when switching service tabs.

**Fix:**

- `HeroBanner` accepts `variant: 'card' | 'topup' | 'data'` with shared `SERVICE_HERO_SHELL_CLASS` (fixed min-height).
- All service checkout pages use `ServiceCheckoutPageLayout` — same `site-container space-y-8 py-6 md:py-8` wrapper.
- CMS slide (`HOME_HERO`) is shown on all three routes when configured; per-service gradient fallback when not.

**Layout order (unchanged):**

```
HeroBanner (same height)
  → ServiceNavigation
  → ServiceTrustBar
  → Checkout
```
