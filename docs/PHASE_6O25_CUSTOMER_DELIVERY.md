# Phase 6O.25 — Customer Delivery Experience

**Build marker:** `6O25`  
**Date:** 2025-06-23  
**Scope:** Post-payment customer UX — timeline, secure PIN delivery, guest lookup, email templates, notifications.  
**Out of scope (unchanged):** Payment, Provider, Ledger, Pricing, Reconciliation.

---

## Summary

Phase 6O.25 completes the customer-facing delivery experience after checkout: visual order timelines, secure card PIN reveal with audit trail, guest order lookup with rate limiting, editable marketing email templates, account order history tabs, and customer notifications for key lifecycle events.

---

## Task 1 — Customer Order Tracking UI

- **Component:** `apps/web/components/order/OrderTimeline.tsx`
- **Backend:** `src/modules/order/entities/order-timeline.builder.ts`
- Builds CARD vs TOPUP/DATA step labels from `order_events` + order state
- CARD: Thanh toán → Đang lấy mã → Đã nhận mã → Email đã gửi
- TOPUP/DATA: Thanh toán → Đang gửi yêu cầu nạp → Nhà mạng xác nhận → Hoàn thành
- Mobile-first vertical timeline with completed / active / pending states

---

## Task 2 — Card Delivery Page

- **Route:** `/orders/{id}` (`apps/web/app/orders/[id]/`)
- Shows product name, serial, masked PIN (`************`), **Xem mã** button
- PIN reveal via `POST /orders/:id/cards/:cardId/reveal-pin`
- Logs `PIN_VIEWED` order event on each reveal

---

## Task 3 — Security for PIN View

- PIN **never** returned in list endpoints (`/account/cards`, `/orders/*/cards`, delivery summary)
- Access: logged-in customer (order owner) **or** guest email verification
- **Tracking:** `CardRecord.firstViewedAt`, `viewCount`, `pinFirstViewedAt`, `pinViewCount`
- Migration: `phase_6o25_customer_delivery`

---

## Task 4 — Email Templates

- **Model:** `EmailTemplate` (code, subject, htmlBody, textBody, variables)
- **Seeded templates:** `PAYMENT_SUCCESS`, `CARD_DELIVERED`, `TOPUP_SUCCESS`, `DATA_SUCCESS`
- **Variables:** `{{customerName}}`, `{{orderCode}}`, `{{items}}`, `{{total}}`
- **Admin:** Marketing → Email Templates (`/marketing/email-templates`)
- **API:** `GET/PUT /admin/cms/email-templates`
- Dispatch prefers DB template, falls back to hardcoded registry

---

## Task 5 — Guest Order Lookup

- **Route:** `/tra-cuu-don-hang`
- **API:** `GET /orders/lookup` and `GET /orders/lookup/delivery`
- Inputs: email + order code → status, timeline, delivery info
- **Rate limit:** 5 attempts / 15 min (`@Throttle` on lookup endpoints)

---

## Task 6 — Customer Account Order History

- **Route:** `/tai-khoan/don-hang` (alias of account orders)
- **Tabs:** Tất cả | Đang xử lý | Hoàn thành
- **API:** `GET /account/orders?tab=all|processing|completed`
- Displays order code, amount, status, date; links to `/orders/{id}`

---

## Task 7 — Notifications

Customer in-app notifications (existing system):

| Event | Type |
|-------|------|
| Payment confirmed | `PAYMENT_SUCCESS` |
| Card ready | `CARD_DELIVERED` |
| Order complete | `ORDER_DELIVERED` |
| Needs support | `ORDER_NEED_SUPPORT` |

Email channel: payment, card delivered, topup/data success templates.  
Future: Zalo/SMS hooks reserved in notification architecture.

---

## API Endpoints (new / changed)

| Method | Path | Description |
|--------|------|-------------|
| GET | `/orders/lookup` | Guest lookup + timeline + delivery (rate limited) |
| GET | `/orders/lookup/delivery` | Same as lookup |
| GET | `/orders/:id/delivery` | Auth or guest email query |
| POST | `/orders/:id/cards/:cardId/reveal-pin` | Secure PIN reveal + audit |
| GET | `/orders/:id/cards` | Masked cards only (no PIN) |
| GET | `/account/orders?tab=` | Filtered order history |
| GET/PUT | `/admin/cms/email-templates` | Template CRUD |

---

## Schema Changes

- `OrderEventType`: +`PIN_VIEWED`, `TOPUP_SUCCESS`, `DATA_SUCCESS`, `ORDER_DELIVERED`, `ORDER_NEED_SUPPORT`
- `CardRecord`: +`firstViewedAt`, `viewCount`, `pinFirstViewedAt`, `pinViewCount`
- `email_templates` table

---

## Test Checklist

1. **Buy CARD** → `/orders/{id}` → Xem mã → PIN shown; `PIN_VIEWED` logged
2. **Refresh page** → Xem mã again → PIN still available via reveal API
3. **Guest lookup** → `/tra-cuu-don-hang` with email + order code
4. **Email resend** → Admin resend still works (`POST /admin/orders/:id/resend-email`)
5. **TOPUP/DATA** → Timeline shows nạp steps (not card steps)

---

## Files Touched (high level)

- `prisma/schema.prisma`, migration `20250623230000_phase_6o25_customer_delivery`
- `src/modules/order/*` — delivery service, timeline, controller
- `src/modules/cms/*` — email template admin
- `src/modules/notification/*` — DB templates, new notification types
- `src/modules/auth/*` — account orders tab filter, masked cards list
- `apps/web/*` — timeline, delivery pages, tra cứu, account tabs
- `apps/admin/app/marketing/email-templates`

**CardOn build 6O25**
