# Phase 6O26.4 — PIN Audit Accuracy Fix

**Build marker:** `6O26.4`  
**Date:** 2026-06-18  
**Builds on:** Phase 6O26.3 (order filters, PIN UI polish)

## Problem

`CARD_PIN_VIEWED` was written whenever `GET /admin/orders/:id` (or `/detail`) returned a decrypted PIN. Opening an order page did not mean the admin actually viewed the PIN.

## Solution

Audit only on explicit human actions:

| Action | Audit |
|--------|-------|
| Open order detail | *(none)* |
| Click **[Xem mã]** | `CARD_PIN_VIEWED` |
| Click **[Copy]** | `CARD_PIN_COPIED` |

## API changes

### Unchanged behavior

- `GET /admin/orders/:id` and `GET /admin/orders/:id/detail` still decrypt and return PIN for ADMIN/SUPER_ADMIN when card is DELIVERED
- Other roles still receive masked PIN only
- No password/reason modal

### Removed

- Automatic `CARD_PIN_VIEWED` on order detail GET

### Added

```
POST /admin/orders/:orderId/cards/:cardId/pin-viewed
```

- Roles: ADMIN, SUPER_ADMIN
- Permission: `orders.read`
- Validates card belongs to order and is DELIVERED
- Writes `card_access_logs` (`VIEW_PIN`) and `audit_logs` (`CARD_PIN_VIEWED`)
- Fields: `adminId`, `orderId`, `cardId`, `ip`, `userAgent`, `createdAt`

### Unchanged

```
POST /admin/orders/:orderId/cards/:cardId/pin-copied
```

Still creates `CARD_PIN_COPIED` on copy.

## Admin UI

**[Xem mã]** click:

1. Reveals PIN from existing response state (no reload, no re-decrypt)
2. Calls `POST .../pin-viewed`

**[Copy]** unchanged — clipboard + `POST .../pin-copied`

SUPPORT / other roles: masked PIN, no buttons.

## Example timeline

```
10:00  Admin opens order detail     → no audit log
10:01  Admin clicks Xem mã          → CARD_PIN_VIEWED
10:02  Admin clicks Copy            → CARD_PIN_COPIED
```

## Verify (localhost)

```bash
docker compose --env-file .env.local-full \
  -f docker-compose.local-full.yml build api admin

docker compose --env-file .env.local-full \
  -f docker-compose.local-full.yml up -d api admin
```

| Check | Expected |
|-------|----------|
| SUPER_ADMIN opens `/orders/{id}` | No VIEW log |
| Click Xem mã | VIEW log created |
| Click Copy | COPY log created |
| SUPPORT | No PIN buttons |
| Footer build marker | `6O26.4` |

## Files touched

- `src/modules/admin/services/admin-order-detail.service.ts`
- `src/modules/admin/controllers/admin-operation.controller.ts`
- `apps/admin/components/orders/CardPinField.tsx`
- `apps/admin/services/api-client.ts`
- `apps/admin/lib/build-version.ts`
