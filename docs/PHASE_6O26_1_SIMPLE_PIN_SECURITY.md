# Phase 6O26.1 — Simple PIN Security

**Build marker:** `6O26.1`  
**Date:** 2026-06-18  
**Replaces:** Phase 6O26 (Dispute & Compliance Center)

## Summary

Phase 6O26 introduced dispute/compliance features that broke admin (API crash from missing `pdfkit`). Phase 6O26.1 rolls back that complexity and keeps only practical PIN viewing for dispute support inside the order detail **Giao hàng** tab.

## What was removed

| Removed | Reason |
|---------|--------|
| Tra soát tab / dispute module | Not needed — dispute info lives on order detail |
| `GET /admin/orders/:id/dispute` | Removed |
| PDF export (`pdfkit`) | Removed — caused API startup failure |
| `AdminDisputeService` | Removed |
| `card.pin.view` permission check | Replaced with role check |
| Partial PIN mask (`**** **** 5678`) | Replaced with fixed `************` |

## What was kept

- `card_access_logs` table and migration `20250623240000_phase_6o26_dispute_compliance`
- `POST /admin/orders/:orderId/cards/:cardId/reveal-pin`
- Audit logging (`VIEW_PIN` action + admin audit trail)
- Serial visible on order detail; PIN never returned in GET responses

## PIN reveal flow

**Who can reveal:** `ADMIN`, `SUPER_ADMIN` only. `SUPPORT` cannot.

**UI (Giao hàng tab):**

- Product name, face value, serial (visible)
- PIN: `************`
- Button **Xem mã** → modal with required reason + optional admin password
- After reveal: real PIN shown inline; history refreshed

**API:**

```
POST /admin/orders/:orderId/cards/:cardId/reveal-pin
Body: { reason: string (min 5), password?: string }
Response: { cardId, pin, revealedAt }
```

**GET responses never include `pin`.** Card objects include:

- `hasPin: boolean`
- `pinViewed: boolean` (true if admin revealed via audit log)
- `pinMasked: "************"`

## PIN reveal history

Order detail includes `pinRevealHistory`:

```json
{
  "id": "...",
  "cardId": "...",
  "viewedBy": "Admin Name",
  "viewedByEmail": "admin@example.com",
  "reason": "Tra soát ngân hàng #12345",
  "viewedAt": "2026-06-18T..."
}
```

Shown on the **Giao hàng** tab — no separate Tra soát module.

## Audit log (`card_access_logs`)

Each reveal writes:

| Field | Value |
|-------|-------|
| adminId | Admin who revealed |
| orderId | Order |
| cardId | Card |
| action | `VIEW_PIN` |
| reason | User-provided reason |
| ip | Client IP |
| userAgent | Client UA |
| createdAt | Timestamp |

## Admin regression fix

**Root cause:** `AdminDisputeService` imported `pdfkit`, which was not installed in the production Docker image after `npm prune`. API failed to start → Dashboard showed "Không tải được tổng quan", Orders showed "Lỗi tải đơn hàng".

**Fix:** Remove dispute service, PDF export, and `pdfkit` dependency entirely.

## Unchanged (per scope)

- Payment, Provider, Ledger, Finance modules
- Order lifecycle
- Sidebar UX from 6O25.2
- Seed role matrix (no modifications)

## Verification checklist

- [ ] `/admin` — dashboard loads
- [ ] `/admin/orders` — order list loads
- [ ] `/admin/orders/{id}` — detail with Giao hàng tab
- [ ] `/admin/finance` — finance pages load
- [ ] `/admin/providers` — providers load
- [ ] SUPER_ADMIN — can reveal PIN with reason
- [ ] SUPPORT — no Xem mã button, API returns 403

**CardOn build 6O26.1**
