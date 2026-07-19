# Phase 6O26.2 — Admin Card Delivery Detail

**Build marker:** `6O26.2`  
**Date:** 2026-06-18  
**Builds on:** Phase 6O26.1 (simple PIN security, no dispute module)

## Summary

Restores rich card delivery information on the admin order detail **Giao hàng** tab. ADMIN and SUPER_ADMIN see decrypted PIN inline; SUPPORT sees masked PIN. Customer-facing reveal flows are unchanged.

## Giao hàng tab (CARD)

Displays:

- Product, face value, quantity
- Per card: serial, PIN (with Copy), expire, provider, delivered at

## Giao hàng tab (TOPUP / DATA)

Displays:

- Phone number, carrier, package
- Provider transaction id, completed time

## API changes

### `GET /admin/orders/:id`

Returns order fields plus:

```json
{
  "delivery": {
    "type": "CARD",
    "productName": "Garena Card",
    "faceValue": "100000.00",
    "quantity": 1,
    "items": [{
      "productName": "Garena Card",
      "faceValue": "100000.00",
      "serial": "XXXXXXXXXXXX",
      "pin": "1234 5678 9999",
      "pinMasked": null,
      "expiredAt": "2027-12-31T00:00:00.000Z",
      "providerName": "Esale",
      "providerTransactionId": "PTX-1",
      "deliveredAt": "2026-06-01T..."
    }]
  }
}
```

### `GET /admin/orders/:id/detail`

Same `delivery` payload plus existing overview / payment / provider / journal sections.

### PIN rules

| Role | PIN in response |
|------|-----------------|
| ADMIN | Decrypted (grouped `1234 5678 9999`) |
| SUPER_ADMIN | Decrypted |
| SUPPORT / others | `pin: null`, `pinMasked: "************"` |

### Audit (no reason required)

When PIN is returned to ADMIN/SUPER_ADMIN, each card write:

- `card_access_logs` — `VIEW_PIN`, reason `admin_api`
- `audit_logs` — `CARD_PIN_VIEWED`

Fields: `adminId`, `orderId`, `cardId`, `createdAt`, `ip`, `userAgent`

## Tổng quan improvements

### Product table

| Sản phẩm | Loại | SL | Mệnh giá | Giá bán | Trạng thái giao |

Values from order item snapshot (`unitPrice`, `discount`, item status) — not live catalog.

### Pricing snapshot

Overview pricing uses persisted order fields:

- `faceValue`, `sellAmount`, `discountAmount`
- `paymentFeeAmount` (gateway fee)
- `providerCost`, `profit`, `customerPaid`

Legacy orders with zero snapshot fall back to `totalAmount` + line items.

## Removed

- `POST /admin/orders/:orderId/cards/:cardId/reveal-pin` (PIN now on GET)
- `CardPinRevealButton` modal (reason / password)
- PIN reveal history UI section

## Unchanged

- Customer `/orders/{id}`, `/account/cards`, customer "Xem mã" flow
- Payment, provider, ledger, finance modules
- No dispute module, PDF, pdfkit, or `card.pin.view` permission

## Verification

- [ ] `/admin/orders/{id}` → Giao hàng shows serial + PIN for SUPER_ADMIN
- [ ] SUPPORT → PIN masked
- [ ] Tổng quan product table + pricing snapshot non-zero for completed orders
- [ ] Footer build marker `6O26.2`

**CardOn build 6O26.2**
