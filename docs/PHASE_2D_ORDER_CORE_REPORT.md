# Phase 2D — Order Core Report

> Date: 2026-06-18  
> Scope: B2C order creation, query, admin read, expiration foundation, audit  
> Not included: Payment Gateway, MegaPay, SePay, Provider API, Agent API, Frontend

---

## Executive Summary

| Overall | **FULL PASS** |
|---------|---------------|
| `npm run build` | **PASS** |
| `npm run test:order` | **PASS (11/11)** |
| Architecture | Controller → Service → Repository → Prisma |

---

## Module Structure

```
src/modules/order/
├── order.module.ts
├── controllers/
│   ├── order.controller.ts
│   └── order-admin.controller.ts
├── services/
│   ├── order.service.ts
│   ├── order-expiration.service.ts
│   └── order-audit.service.ts
├── repositories/
│   └── order.repository.ts
├── dto/
│   ├── create-order.dto.ts
│   ├── guest-order-lookup.dto.ts
│   ├── admin-order-query.dto.ts
│   └── update-order.dto.ts
└── entities/
    ├── order.constants.ts
    ├── order.mapper.ts
    ├── order-code.generator.ts
    └── order-state.machine.ts
```

---

## Order Creation Flow

Transaction (`prisma.$transaction`):

```
1. Validate variants ACTIVE (VariantRepository.findActiveById)
2. Lock price snapshot (PricingService.getCustomerPrice → unit_price)
3. Create FinancialTransaction (B2C_CHECKOUT, PENDING)
4. Create Order (WAITING_PAYMENT, fulfillment PENDING)
5. Create order_items (quantity per line — multi-qty = 1 row)
```

**Không gọi payment** — `payment_id` để NULL, phase Payment sẽ gắn sau.

### Checkout modes

| Mode | Auth | Required fields |
|------|------|-----------------|
| Customer | JWT (OptionalJwtAuthGuard) | `items[]` |
| Guest | No JWT | `items[]`, `guestEmail` |

### Invoice (VAT)

| Field | Rule |
|-------|------|
| `invoiceRequired` | Optional flag |
| `companyName`, `taxCode`, `address` | Required when `invoiceRequired = true` |
| Storage | `orders.invoice_metadata` JSON (migration `20250618120000`) |

---

## API Endpoints

### Customer (`/api/v1/orders`)

| Method | Path | Auth | Description |
|--------|------|------|-------------|
| POST | `/orders` | Optional JWT | Create order (customer or guest) |
| GET | `/orders` | JWT | List own orders |
| GET | `/orders/:id` | JWT | Order detail (own only) |
| GET | `/orders/lookup` | Public | Guest lookup (`orderCode` + `email`) |

### Admin (`/api/v1/admin/orders`)

| Method | Path | Permission | Description |
|--------|------|------------|-------------|
| GET | `/admin/orders` | `orders.read` | List with filters |
| GET | `/admin/orders/:id` | `orders.read` | Order detail |

**Filters:** `paymentStatus`, `fulfillmentStatus`, `dateFrom`, `dateTo`

---

## Status Machine

### Payment Status

| Status | Meaning |
|--------|---------|
| `WAITING_PAYMENT` | Order created, awaiting payment |
| `PAID` | Payment confirmed (future webhook) |
| `FAILED` | Payment failed |
| `EXPIRED` | Payment window elapsed |

### Fulfillment Status

| Status | Meaning |
|--------|---------|
| `PENDING` | Awaiting fulfillment |
| `PROCESSING` | Worker active |
| `COMPLETED` | Delivered |
| `WAIT_ADMIN_RETRY` | Provider fail, admin retry |
| `FAILED` | Permanent failure |

### Rules (enforced)

| Rule | Implementation |
|------|----------------|
| Cannot fulfill unpaid order | `assertCanFulfill()` / `assertFulfillmentTransition()` |
| Cannot modify completed order | `assertCanModifyOrder()` → `ConflictException` |

---

## Multi-Quantity

Example: Garena 100k × 10

```
1 orders row
1 order_items row (quantity = 10, unit_price snapshot)
→ Future: 10 card_records at fulfillment
```

---

## Order Expiration Foundation

`OrderExpirationService`:

```
WAITING_PAYMENT + payment_expires_at < now → EXPIRED
```

- `expireOrder(orderId)` — single order
- `expireDueOrders()` — batch scan
- Audit: `ORDER_EXPIRED`
- **Worker chưa tạo** — cron/BullMQ phase sau

Timeout: `system_settings.payment.timeout_minutes` (default 15)

---

## Audit Log

| Action | Trigger |
|--------|---------|
| `ORDER_CREATED` | After successful order creation |
| `ORDER_EXPIRED` | After expiration transition |

Extended `AuditService.recordEvent()` for generic audit targets (`AuditTargetType.ORDER`).

Guest/system actions use seeded `superadmin@cardon.vn` as audit actor.

---

## Schema Change

Migration `20250618120000_order_invoice_metadata`:

```sql
ALTER TABLE orders ADD COLUMN invoice_metadata JSONB NOT NULL DEFAULT '{}';
```

---

## Seed Update

Added permission:

```
orders.manage — Manage orders (status, notes)
```

Assigned to `ADMIN` and `SUPER_ADMIN`.

---

## Test Results

Command: `npm run test:order`

| Test | Result |
|------|--------|
| Authenticated customer order | **PASS** |
| Guest order | **PASS** |
| Guest without email reject | **PASS** |
| Multi quantity (qty=10, 1 item) | **PASS** |
| Inactive variant reject | **PASS** |
| Price snapshot | **PASS** |
| Cannot modify completed order | **PASS** |
| Guest lookup match | **PASS** |
| Guest lookup wrong email | **PASS** |
| Order expiration | **PASS** |
| State machine unpaid fulfill block | **PASS** |

```
Test Suites: 1 passed
Tests:       11 passed
```

---

## Validation

| Command | Result |
|---------|--------|
| `npm run build` | **PASS** |
| `npm run test:order` | **PASS (11/11)** |

---

## Intentionally Not Implemented

- Payment Gateway / MegaPay / SePay
- Provider API (eSale, iMedia)
- Agent API / agent orders
- Fulfillment worker / card_records creation
- Admin retry
- Expiration cron worker
- Frontend

---

## Next Phase (Not Started)

**Payment module** per `docs/03_PAYMENT.md`

---

**Phase 2D: COMPLETE — FULL PASS**
