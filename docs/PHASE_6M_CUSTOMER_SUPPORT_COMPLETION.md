# Phase 6M — Customer Support & Operation Completion

**Status:** COMPLETE (implementation)  
**Date:** 2025-06-21  
**Scope constraint:** No changes to payment, provider, ledger, or pricing modules.

---

## Summary

Phase 6M delivers customer support tickets, in-app notifications, admin support management, FAQ CMS, and operational hooks required for real card-selling operations.

---

## TASK 1 — Support Ticket System

### Database

- Migration: `prisma/migrations/20250621200000_phase_6m_support_tickets/`
- Tables:
  - `support_tickets` — `ticket_code`, `customer_id`, `order_id` (nullable), `subject`, `status`, `priority`, timestamps
  - `support_ticket_messages` — conversation thread with optional `attachment_url`
- Enums: `SupportTicketStatus` (OPEN / PROCESSING / RESOLVED), `SupportTicketPriority`, `SupportMessageAuthorType`

### Backend

- Module: `src/modules/support/`
- Customer API (`/account/support/*`):
  - `GET /account/support/tickets` — list
  - `GET /account/support/tickets/:id` — detail + replies
  - `POST /account/support/tickets` — create (optional `orderId`)
  - `POST /account/support/tickets/:id/messages` — customer reply
  - `POST /account/support/upload` — screenshot upload → `/uploads/support/`

### Customer UI

- `/account/support` — full ticket UI: create, select order, upload screenshot, view replies
- Account sidebar: **Hỗ trợ**

---

## TASK 2 — Admin Support Management

### Permission & roles

- Permission: `support.manage` (seed + `prisma/seed.mjs`)
- Roles: **SUPPORT**, **ADMIN**, **SUPER_ADMIN**

### Admin API

- `GET /admin/support/tickets` — list + filter (`status`, `priority`, `ticketCode`)
- `GET /admin/support/tickets/:id` — conversation
- `POST /admin/support/tickets/:id/reply` — staff reply
- `PATCH /admin/support/tickets/:id/close` — resolve ticket

### Admin UI

- Nav: **Hỗ trợ** → `/support/tickets`
- Page: `apps/admin/app/support/tickets/page.tsx`

---

## TASK 3 — Order Support Button

- Order detail (`OrderDetailClient.tsx`): button **Cần hỗ trợ** (logged-in customers)
- Prefills support form with: order code, payment status, fulfillment status, `orderId`

---

## TASK 4 — Notification Center (Customer)

Uses existing `notifications` table (`Notification` model).

### Backend

- `GET /account/notifications`
- `GET /account/notifications/unread-count`
- `PATCH /account/notifications/:id/read`
- `PATCH /account/notifications/read-all`
- Customer in-app types: `PAYMENT_SUCCESS`, `CARD_DELIVERED`, `SUPPORT_REPLY`
- Triggered from `NotificationService` on payment success, card delivery, support reply

### Customer UI

- `NotificationBell` in header (desktop + mobile)
- Shows payment success, card delivered, support reply with links

---

## TASK 5 — Admin Notification

In-app admin alerts via `enqueueSystemAdminAlert` / `enqueueSystemStaffAlert`:

| Event | Type | Notes |
|-------|------|-------|
| New contact form | `NEW_CONTACT` | Contact + email admin |
| New support ticket | `NEW_SUPPORT_TICKET` | ADMIN + SUPPORT roles |
| Provider failure | `ADMIN_RETRY_REQUIRED` | Existing hook |
| Manual payment review | `MANUAL_PAYMENT_REVIEW` | Existing hook |

---

## TASK 6 — FAQ CMS

### Storage

- System setting key: `cms.faq.items` (JSON array)
- Fields: `question`, `answer`, `category`, `sortOrder`

### API

- Public: `GET /cms/faq?category=`
- Admin: `GET/PUT /admin/cms/faq`

### Admin UI

- Marketing → **FAQ** (`/marketing/faq`)

### Customer usage

- Homepage — category `general`
- Contact — category `contact`
- Hướng dẫn — category `guide`
- Component: `FaqSection` / `FaqAccordion` with CMS fallback

---

## TASK 7 — Verification

Run locally (Node.js required):

```bash
npx prisma generate
npx prisma migrate deploy   # applies support_tickets migration
npm run build
npm run build:web
npm run build:admin
npm test
```

Optional re-seed (dev only) for `support.manage` + default FAQ:

```bash
node prisma/seed.mjs
```

> **Note:** Automated build/test execution was not available in the agent environment (Node/npm not on PATH). Run the commands above in your dev environment to confirm.

---

## Files added / changed (high level)

| Area | Key paths |
|------|-----------|
| Schema | `prisma/schema.prisma`, migration `20250621200000_phase_6m_support_tickets` |
| Support module | `src/modules/support/**` |
| Notifications | `notification.repository.ts`, `notification.service.ts`, `notification-queue.producer.ts`, `account.controller.ts` |
| Contact alert | `contact.service.ts` |
| FAQ CMS | `cms.constants.ts`, `cms.repository.ts`, `cms.service.ts`, CMS controllers |
| Seed | `prisma/seed.mjs` — `support.manage`, FAQ defaults |
| Web | `/account/support`, `NotificationBell`, order support button, FAQ components |
| Admin | `/support/tickets`, `/marketing/faq`, nav permissions |

---

## Out of scope (unchanged)

- Payment flows and gateways
- Provider integration / fulfillment logic
- Ledger / finance posting
- Pricing engine
