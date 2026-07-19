# Phase 6O27 — Operation Guard & Delivery Export

**Build marker:** `6O27`  
**Date:** 2026-06-18  
**Builds on:** Phase 6O26.4 (PIN audit accuracy)

## Summary

Adds pre-UAT operation safety: order amount limits, multi-channel provider alerts (Admin UI + Telegram + Email), and bulk card delivery tools with export audit.

## Task 1 — Order amount limits

**Settings → Order** (`/admin/settings/order`)

| Field | Key | Default |
|-------|-----|---------|
| Guest max order amount | `guestMaxOrderAmount` | 0 = unlimited |
| Customer max order amount | `customerMaxOrderAmount` | 0 = unlimited |

Storage: `system_settings` key `settings.order`

Validation:
- Backend `OrderService.createOrder()` — hard block with `Đơn hàng vượt giới hạn cho phép`
- Frontend checkout — warning + block before pay (`customerPaid` / `totalPayment`)
- Public limits via `GET /cms/site-config` → `orderLimits`

## Task 2 — Provider low balance alerts

Uses existing `ProviderBalanceCronService` (5 min sync).

Channels:
- **Admin UI** — in-app notifications (`GET /admin/notifications`)
- **Telegram** — `settings.telegram` (enabled, bot token, chat ID)
- **Email** — existing admin alert email

Alert types:
| Type | Trigger |
|------|---------|
| `LOW_BALANCE` | Balance &lt; threshold on sync |
| `PROVIDER_ERROR` | Balance sync API failure |
| `MANUAL_REVIEW_ORDER` | Order needs admin retry |

Telegram message includes provider, balance/threshold or error, timestamp.

## Task 3 — Provider alert config

**Providers → {id} → Alert Settings**

Per-provider (`provider_balances`):
- `lowBalanceThreshold`
- `alertAdminEnabled`
- `alertTelegramEnabled`
- `alertEmailEnabled`

API: `GET/PUT /admin/providers/:id/alert-settings`

## Task 4 — Bulk card delivery

**Order detail → Giao hàng** (CARD, quantity &gt; 1, ADMIN/SUPER_ADMIN):

- **[Copy tất cả mã thẻ]** — bulk clipboard format
- **[Xuất Excel]** — `.xlsx` download

Excel columns: STT, Product, Face Value, Serial, PIN, Provider, Delivered Time

## Task 5 — Export security

- Export/copy tools: ADMIN + SUPER_ADMIN only
- Export creates audit `CARD_EXPORT` with `adminId`, `orderId`, `cardCount`, `ip`, `userAgent`
- SUPPORT: no PIN export UI

## Migration

`20250618140000_phase_6o27_operation_guard` — provider alert channel columns on `provider_balances`

## Verify

```bash
docker compose --env-file .env.local-full \
  -f docker-compose.local-full.yml build api admin

docker compose --env-file .env.local-full \
  -f docker-compose.local-full.yml up -d api admin
```

| Test | Expected |
|------|----------|
| Order 11M, limit 10M | Blocked |
| Esale low balance + Telegram enabled | Telegram message |
| Order 50 cards export | Valid xlsx + CARD_EXPORT audit |
| Build marker | `6O27` |

## Key files

**API:** `settings.constants.ts`, `settings-store.service.ts`, `settings-admin.service.ts`, `order.service.ts`, `notification.service.ts`, `telegram-notification.service.ts`, `provider-health.service.ts`, `provider-balance.repository.ts`, `admin-provider.service.ts`, `admin-order-detail.service.ts`, `admin-notification.service.ts`

**Admin:** `app/settings/order/page.tsx`, `app/settings/telegram/page.tsx`, `app/providers/[id]/page.tsx`, `components/orders/CardDeliveryTools.tsx`, `components/layout/AdminNotificationBell.tsx`

**Web:** `CheckoutShell.tsx`, `cms-api.ts`, `cms.service.ts`
