# B2C Checkout Flow

> Phase 4 — End-to-end customer purchase. Aligns with `02_DATABASE_SCHEMA.md` and V2 architecture decisions.

## Overview

```
Customer
    ↓
Select variant (ProductEngine)
    ↓
Quantity / topup inputs
    ↓
Checkout (auth or guest + optional invoice)
    ↓
Create order + payment
    ↓
Payment gateway
    ↓
Webhook → queue
    ↓
Provider fulfillment
    ↓
Deliver PIN / topup result
    ↓
Email notification
    ↓
Order history (account or guest email)
```

All business logic in Service layer. Webhook never calls provider directly.

---

## Authenticated Customer Flow

```
1. Customer logged in (JWT, role: CUSTOMER)
2. Browse catalog → select variant (SKU)
3. Enter quantity (card) or phone/telco (topup)
4. Checkout review
5. Optional: request VAT invoice (company info)
6. Select payment gateway (MegaPay / SePay)
7. Create order → redirect to payment
8. Pay → webhook → fulfillment queue
9. Receive card PIN / topup result
10. Email confirmation
11. View in order history (/account/orders)
```

---

## Guest Flow

```
No account
    ↓
Select product + quantity
    ↓
Checkout form:
  - guest_email     (REQUIRED)
  - guest_phone     (optional)
    ↓
Optional invoice fields
    ↓
Payment
    ↓
Receive card / topup result via email
    ↓
Later: Register with same email
    ↓
OrderService.claimGuestOrders() → orders appear in history
```

| Field | Rule |
|-------|------|
| `orders.user_id` | NULL |
| `orders.is_guest_order` | true when no account |
| `orders.guest_email` | Required for guest |
| `orders.guest_phone` | Optional |
| `orders.invoice_required` | VAT invoice flag |
| `orders.customer_note` | Optional note |

See [14_AUTH_RBAC.md](./14_AUTH_RBAC.md) for claim flow.

---

## Card Purchase Flow

### Step-by-step

```
GET /api/v1/products/{sku}           ← variant detail + sell_price
    ↓
POST /api/v1/checkout/preview        ← validate stock, calculate total
    ↓
POST /api/v1/checkout/orders
    ↓
CheckoutService.createB2COrder()
    ↓
ProductEngine.getVariantBySku(sku)
ProductEngine.getCustomerPrice(variantId)
    ↓
Create order (payment_status: PENDING, fulfillment_status: PENDING)
Create order_item (quantity = N)
    ↓
PaymentService.createPayment() → payments row (payment_reference)
orders.payment_id = payments.id
    ↓
Return { order_code, payment_url }
    ↓
Customer pays at gateway
    ↓
Webhook → payments.status = SUCCESS, order.payment_status = PAID
    ↓
FulfillmentQueue.add({ orderId })
InvoiceQueue.add({ orderId, type: B2C_RECEIPT })  ← if no VAT invoice requested
    ↓
Worker → ProviderInterface.buyCard()
    ↓
Create N card_records (one per card)
    ↓
fulfillment_status = COMPLETED
    ↓
NotificationQueue → email with order link (no plain PIN in email)
    ↓
Customer views PIN on secure order detail page
```

### Multi-quantity example

Buy 10 Garena cards:

- 1 `orders` row
- 1 `order_items` row (`quantity = 10`)
- 10 `card_records` rows after fulfillment

---

## Topup Flow

### Checkout input

| Field | Required | Storage |
|-------|----------|---------|
| `phone_number` | Yes | `topup_transactions.phone_number` |
| `telco` | Yes | `topup_transactions.telco` |
| `amount` / variant | Yes | variant face_value → `topup_transactions.amount` |

```
Customer selects TOPUP variant (e.g. Mobifone 50K)
    ↓
Enter phone_number + telco (from variant metadata or selector)
    ↓
Create order + order_item (quantity = 1)
    ↓
Payment (same as card)
    ↓
Webhook → queue
    ↓
ProviderInterface.topup()
    ↓
Update topup_transactions (status, provider_reference, result_message)
    ↓
fulfillment_status = COMPLETED
    ↓
Email: "Topup successful" + result (no sensitive over-exposure)
```

Topup input collected at checkout, persisted when fulfillment creates `topup_transactions`.

---

## Payment Integration

Uses V2 payment model — `payment_reference` **only** on `payments`:

```
CheckoutService
    ↓
PaymentService.createPayment({ orderId, gateway, amount })
    ↓
payments.payment_reference = generated UUID
orders.payment_id = payments.id
    ↓
Gateway redirect / QR
```

Webhook flow unchanged from [03_PAYMENT.md](./03_PAYMENT.md).

---

## VAT Invoice at Checkout

Checkout optional step: **"Need invoice?"**

### If NO (default)

Standard B2C receipt generated on payment (async invoice queue).

### If YES

Collect at checkout:

| Field | Required |
|-------|----------|
| `company_name` | Yes |
| `tax_code` | Yes |
| `address` | Yes |
| `invoice_email` | Yes |

Set `orders.invoice_required = true` and collect company fields at checkout.

Company fields stored in `invoices.metadata` when invoice is generated:

```typescript
{
  "company_name": "...",
  "tax_code": "...",
  "address": "...",
  "invoice_email": "..."
}
```

```
Payment SUCCESS
    ↓
InvoiceQueue.add({ orderId, type: B2C_RECEIPT, vat: true })
    ↓
InvoiceService.generate with metadata tax fields
```

VAT invoice replaces simple receipt — not both.

---

## Customer-Facing Status Messages

### Normal processing

| fulfillment_status | Customer sees |
|---------------------|---------------|
| PENDING | "Processing payment..." |
| PROCESSING | **"Order processing"** |
| COMPLETED | "Completed" + view card/result |
| WAITING_ADMIN_RETRY | **"Order processing"** (same as PROCESSING) |

**Critical rule:** When provider fails after payment success, customer sees **"Order processing"** — **never expose provider error details**.

```
Payment success + provider fail
    ↓
fulfillment_status = WAITING_ADMIN_RETRY
    ↓
Customer UI: "Order processing"
    ↓
Admin retries internally
    ↓
Customer notified on COMPLETED
```

No auto-refund. No error message to customer.

### Payment failed

| payment_status | Customer sees |
|---------------|---------------|
| FAILED | "Payment failed. Please try again." |
| PENDING (timeout) | "Payment pending" + poll or retry |

---

## Email Notifications

| Event | Recipient | Content |
|-------|-----------|---------|
| Order COMPLETED (card) | guest_email or user email | Order link; **no PIN in email** |
| Order COMPLETED (topup) | same | Success + reference |
| Payment SUCCESS | same | Payment confirmation |
| Email verification | user | Verify link |

Sent via `notification` queue — async.

---

## Order History

### Authenticated

```
GET /api/v1/account/orders
GET /api/v1/account/orders/:order_code
GET /api/v1/account/orders/:order_code/cards   ← decrypt PIN server-side
```

### Guest (before register)

Access via signed link in email: `/orders/track?code={order_code}&token={signed_token}`

Token derived from order_code + guest_email hash — expires configurable.

### After register + claim

Guest orders linked to account — visible in standard history.

---

## CheckoutService (Reference)

```typescript
class CheckoutService {
  preview(dto: CheckoutPreviewDto): Promise<CheckoutPreview>;
  createB2COrder(dto: CreateB2COrderDto, user?: User): Promise<CheckoutResult>;
  getOrderForCustomer(orderCode: string, context: CustomerContext): Promise<OrderDetail>;
  trackGuestOrder(orderCode: string, token: string): Promise<OrderDetail>;
}
```

```
CheckoutController
    ↓
CheckoutService
    ↓
ProductEngineService | OrderRepository | PaymentService
```

---

## Error Handling

| Scenario | payment_status | fulfillment_status | Customer message |
|----------|---------------|---------------------|------------------|
| Payment expired | EXPIRED | PENDING | Order expired |
| Payment failed | FAILED | PENDING | Payment failed |
| Payment success, provider OK | PAID | COMPLETED | Completed |
| Payment success, provider fail | PAID | WAITING_ADMIN_RETRY | **Order processing** |
| Payment success, provider timeout | PAID | WAITING_ADMIN_RETRY | **Order processing** |
| Invalid SKU / inactive variant | — | — | Product unavailable (before order) |

Internal admin alerts fire on `WAITING_ADMIN_RETRY` — customer not notified of failure.

---

## Database Schema

> **Merged into [`02_DATABASE_SCHEMA.md`](./02_DATABASE_SCHEMA.md)** — orders (guest, invoice_required, customer_note), order_items, topup_transactions.

VAT invoice company fields stored in `invoices.metadata` when `orders.invoice_required = true`.

---

## Sequence Diagram (Card — Authenticated)

```
Customer    CheckoutAPI    PaymentGW    Webhook    Queue    Provider
   |             |              |           |         |          |
   |-- preview ->|              |           |         |          |
   |<- total ----|              |           |         |          |
   |-- create -->|              |           |         |          |
   |             |-- create payment ------->|         |          |
   |<- pay url --|              |           |         |          |
   |-- pay ------------------->|           |         |          |
   |             |              |-- webhook>|         |          |
   |             |              |           |-- job ->|          |
   |             |              |           |         |-- buy -->|
   |             |              |           |         |<- cards -|
   |<- email ----|              |           |         |          |
   |-- view order|              |           |         |          |
```

---

## Related Docs

- [03_PAYMENT.md](./03_PAYMENT.md)
- [06_ORDER_FULFILLMENT.md](./06_ORDER_FULFILLMENT.md)
- [10_INVOICE_SYSTEM.md](./10_INVOICE_SYSTEM.md)
- [14_AUTH_RBAC.md](./14_AUTH_RBAC.md)
- [15_PRODUCT_ENGINE.md](./15_PRODUCT_ENGINE.md)
