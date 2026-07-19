# Phase 6O26.3 — Admin Order Operation Polish

**Build marker:** `6O26.3`  
**Date:** 2026-06-18  
**Builds on:** Phase 6O26.2 (Giao hàng tab, delivery payload, simple PIN security)

## Summary

Polishes admin order operations: smart filters, filtered summary cards, enriched list columns, and final PIN UX with role + delivery gating. Keeps 6O26.1/6O26.2 constraints — no pdfkit, no dispute module, no reveal endpoint, no `card.pin.view` permission.

## Task 1 — Order list filters

**Route:** `GET /admin/orders`, `GET /admin/orders/summary`

| Filter | Query param | Notes |
|--------|-------------|-------|
| Search | `q` | Order code, customer email/phone, payment ref, gateway/bank tx id, provider tx id |
| Date presets | `dateFrom`, `dateTo` | UI presets: today, yesterday, 7 days, this/last month |
| Custom range | `fromDate`, `toDate` (aliases) | Same as `dateFrom` / `dateTo` |
| Payment | `paymentFilter` | `PENDING` → `WAITING_PAYMENT`, `PAID`, `FAILED`, `REFUNDED` |
| Delivery | `deliveryStatus` | `PROCESSING`, `DELIVERED` → `COMPLETED`, `FAILED`, `NEED_SUPPORT` |
| Product type | `productType` | `CARD`, `TOPUP`, `DATA` |
| Provider | `providerId` | UUID |

Serial number search is not supported (encrypted at rest).

## Task 2 — Summary cards

**Route:** `GET /admin/orders/summary` (same filters as list)

| Card | Source (order snapshot) |
|------|-------------------------|
| Tổng doanh thu | `SUM(customerPaid)` |
| Giá vốn NCC | `SUM(providerCost)` |
| Phí thanh toán | `SUM(paymentFeeAmount)` |
| Lợi nhuận | `customerPaid - providerCost - gatewayFee` |
| Số đơn | `_count` |
| Tỉ lệ thành công | `COMPLETED / total × 100` |

Values follow the active filter set (e.g. June date range → June-only totals).

## Task 3 — Order list columns

List items (`AdminOrderListItem`) expose snapshot fields:

- Mã đơn, khách hàng, loại (CARD/TOPUP/DATA/MIXED)
- Thanh toán (`customerPaid`), giá vốn, lãi (green if > 0, amber if ≤ 0)
- PT thanh toán (`methodDisplayName` / `paymentMethodCode`)
- Trạng thái giao (`fulfillmentStatus`), ngày tạo

## Task 4 — PIN UI (Giao hàng tab)

| Role | UI |
|------|-----|
| ADMIN, SUPER_ADMIN | Masked `**** **** {last4}`, [Xem mã] reveals client-side (no extra API), [Copy] after reveal |
| SUPPORT, ACCOUNTANT, MARKETING | Masked only, no buttons |

## Task 5 — Backend PIN rules

**Routes:** `GET /admin/orders/:id`, `GET /admin/orders/:id/detail`

Return `pin` only when:

- Role ∈ `{ ADMIN, SUPER_ADMIN }`
- Card `status = DELIVERED`

Otherwise: `pin: null`, `pinMasked: "************"` (partial mask when admin but not yet delivered).

## Task 6 — Audit

| Event | Trigger |
|-------|---------|
| `CARD_PIN_VIEWED` | PIN returned in order detail response (admin + delivered cards) |
| `CARD_PIN_COPIED` | `POST /admin/orders/:orderId/cards/:cardId/pin-copied` |

Stored: `adminId`, `orderId`, `cardId`, `ip`, `userAgent`, `createdAt`  
Also written to `card_access_logs` (`VIEW_PIN`, `COPY_PIN`).

## Migration

`20250625120000_phase_6o263_order_operations` — adds `COPY_PIN` to `CardAccessAction` enum.

## Verify (localhost)

```bash
docker compose --env-file .env.local-full \
  -f docker-compose.local-full.yml build api admin

docker compose --env-file .env.local-full \
  -f docker-compose.local-full.yml up -d api admin
```

| URL | Check |
|-----|-------|
| `http://admin.localhost/dashboard` | Loads |
| `http://admin.localhost/orders` | Summary cards + filters + table |
| `http://admin.localhost/orders/{id}` | Giao hàng tab, PIN UI by role |

**Role tests:**

- SUPER_ADMIN / ADMIN: [Xem mã], Copy → `CARD_PIN_COPIED`
- SUPPORT: PIN masked, no reveal/copy controls

Footer build marker: `6O26.3`
