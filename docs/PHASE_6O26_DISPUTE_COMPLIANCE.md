# Phase 6O26 — Dispute & Compliance Center

**Build marker:** `6O26`  
**Scope:** Admin dispute investigation UX, secure PIN reveal with audit trail, evidence PDF export.  
**Out of scope (unchanged):** Checkout, payment callback, provider fulfillment.

---

## Summary

Phase 6O26 adds a compliance-focused **Tra soát** workflow for payment disputes, fraud reports, and bank/police investigation requests — without changing payment or fulfillment pipelines.

---

## Task 1 — Secure admin PIN reveal

- **Permission:** `card.pin.view` (not `cards.reveal` query param)
- **Endpoint:** `POST /admin/orders/:orderId/cards/:cardId/reveal-pin`
- **Body:** `{ reason: string, password?: string }` — reason required (min 5 chars); optional SUPER_ADMIN password confirm
- **Order detail list API:** Serial shown in clear; PIN masked as `**** **** 5678` (last 4 digits only)
- **Removed:** `?revealPins=true` on `GET /admin/orders/:id/detail` — PIN never returned in bulk detail response

### Admin UI

- Delivery tab: serial always visible
- Button **Xem mã thẻ** → modal with reason (and optional password for SUPER_ADMIN)
- PIN returned once in POST response only

---

## Task 2 — PIN access audit

**Table:** `card_access_logs`

| Field | Description |
|-------|-------------|
| id | UUID |
| cardId | Card record |
| orderId | Order |
| adminId | Admin user |
| action | `VIEW_PIN` |
| reason | Required justification |
| ip | Client IP |
| userAgent | Browser UA |
| createdAt | Timestamp |

Migration: `20250623240000_phase_6o26_dispute_compliance`

Also logs `CARD_PIN_VIEWED` in admin audit trail.

---

## Task 3 — Dispute tab (Tra soát)

**Route:** Order detail tab **Tra soát**  
**API:** `GET /admin/orders/:id/dispute`

Sections:

- **Customer:** account ID, email, phone, order IP, user agent
- **Payment:** gateway, method, transaction ID, bank reference, amount, payment time
- **Delivery:** CARD (product, face value, serial, masked PIN, view stats) / TOPUP-DATA (phone, provider ref, completed time)
- **Timeline:** categorized as payment / provider / delivery / customer_view

---

## Task 4 — Refund eligibility helper

Displayed on Tra soát tab:

| Scenario | Result |
|----------|--------|
| CARD not delivered | YES |
| CARD delivered, PIN not viewed | MANUAL REVIEW |
| PIN viewed | NO |
| TOPUP/DATA success | NO |
| Provider failed | YES |

Logic: `src/modules/admin/entities/admin-dispute.mapper.ts` → `computeRefundEligibility()`

---

## Task 5 — Export evidence PDF

- **Button:** Xuất hồ sơ tra soát
- **Endpoint:** `GET /admin/orders/:id/dispute/export-pdf`
- **Query:** `includePin=true` — SUPER_ADMIN only
- **Contents:** Order info, customer, payment proof, delivery proof, timeline, refund eligibility
- **Library:** `pdfkit`

---

## Task 6 — Permissions

| Permission | SUPER_ADMIN | ADMIN | SUPPORT |
|------------|-------------|-------|---------|
| `card.pin.view` | ✅ (all perms) | ✅ configurable | ❌ default |

Seed updated in `prisma/seed.mjs`.

---

## Task 7 — Verify

```bash
docker compose -f docker-compose.local-full.yml --env-file .env.local-full build api admin web
docker compose -f docker-compose.local-full.yml --env-file .env.local-full up -d api admin web
```

- http://admin.localhost/orders/{id} → tab **Tra soát**
- PIN reveal requires `card.pin.view` + reason
- PDF export downloads without PIN by default

**CardOn build 6O26**
