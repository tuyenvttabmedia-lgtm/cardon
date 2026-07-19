# Phase 6O.16 — CARD / TOPUP / DATA Flow Separation + Esale Alignment

**Date:** 2026-06-23  
**Build marker:** `WEB_BUILD_VERSION=6O16`  
**Scope:** Customer flow separation, navigation, Esale topup adapter, admin variant hints.

**Not modified:** payment core, ledger, wallet, provider credential storage, existing CARD order fulfillment.

---

## TASK 1 — Homepage CARD only

- `CategoryQuickSelect` shows **Thẻ game** + **Thẻ điện thoại** only (2 columns).
- Removed Nạp cước / Data from homepage purchase block.
- `HomePageClient` only loads CARD variants; no phone field on homepage checkout.

---

## TASK 2 — `/nap-cuoc` TOPUP only

- Removed DATA tab.
- Flow: **SĐT → nhà mạng (logo) → mệnh giá TOPUP → thanh toán**.
- Amounts loaded from catalog TOPUP variants (sorted by face value).
- Order: `guestPhone` + `customerNote: Nạp số: {phone} | {telco}`.

---

## TASK 3 — `/nap-data`

- New route: `/nap-data` (`DataPageClient`).
- Flow: **SĐT → nhà mạng (Viettel/Mobi/Vina) → gói DATA → thanh toán**.
- Order: `guestPhone` + `customerNote: Nạp data: {phone} | {packageCode}`.

---

## TASK 4 — Navigation

**Header defaults:** Mua thẻ · Nạp cước · Nạp Data · Tin tức  

**Mobile bottom nav:** Data → `/nap-data` (was `/nap-cuoc?type=data`).

---

## TASK 5 — EsaleTopupAdapter

New: `src/modules/provider/adapters/esale/esale-topup.adapter.ts`

- `topup()` → POST `{topupApiUrl}topup`
- `checkTransaction()` → POST `checktransaction`
- `getBalance()` → POST `getbalance`

`ESaleProvider` delegates topup/checkTransaction (TOPUP kind) to adapter.

`parseTopupProductCode` supports aliases: `VIETTEL_TOPUP`, `MOBI_TOPUP`, etc.

---

## TASK 6 — Topup lifecycle

Existing pipeline unchanged (no payment changes):

```
Payment success → FulfillmentDispatch → topup_queue → TopupService → EsaleTopupAdapter
```

TOPUP and DATA variants both route to `topup_queue`.

---

## TASK 7 — Admin product hints

Variant type select: **CARD / TOPUP / DATA** with helper text:

| Type | Hint |
|------|------|
| CARD | Trả về PIN/serial |
| TOPUP | Yêu cầu số điện thoại |
| DATA | Yêu cầu SĐT + gói data |

---

## Files changed (summary)

```
apps/web/lib/home-catalog.ts
apps/web/lib/topup-flow.ts (new)
apps/web/components/home/CategoryQuickSelect.tsx
apps/web/components/home/HomePageClient.tsx
apps/web/components/topup/TopupPageClient.tsx
apps/web/components/topup/DataPageClient.tsx (new)
apps/web/app/nap-data/page.tsx (new)
apps/web/lib/checkout-validation.ts
apps/web/hooks/useThemeSettings.ts
apps/web/lib/mobile-nav.defaults.ts
src/modules/cms/entities/cms-theme.defaults.ts
src/modules/provider/adapters/esale/esale-topup.adapter.ts (new)
src/modules/provider/adapters/esale/esale.provider.ts
src/modules/provider/adapters/esale/esale.mapper.ts
src/modules/provider/provider.module.ts
apps/admin/app/products/page.tsx
apps/admin/lib/i18n/vi.ts
```

---

## Verify

| Check | Expected |
|-------|----------|
| `/` purchase block | CARD categories only |
| `/nap-cuoc` | No DATA tab, TOPUP flow |
| `/nap-data` | Separate DATA page |
| Build marker | `6O16` ✅ |

---

## Deploy

```powershell
docker compose -f docker-compose.local-full.yml --env-file .env.local-full up -d --build api web admin
```
