# BUILD 6033.6 — CUSTOMER CENTER COMPLETION

**Build:** `6033.6 CUSTOMER CENTER COMPLETION`  
**Prior build:** `6033.4.2 PLATFORM STABILIZATION HOTFIX`  
**Scope:** Customer Portal business layer only — aggregation over Order, Payment, Notification engines.

---

## Goal

Complete Customer Center at `customer.localhost` for real retail customers. Reuses existing engines; no business logic rewrite.

---

## Do Not Modify

Payment Engine, Provider Engine, Ledger Engine, Webhook Engine, Order Engine, Partner Portal, Admin Portal.

---

## Backend — Customer Center Module

**Path:** `src/modules/customer-center/`  
**Namespace:** `GET/POST/PATCH/DELETE /api/v1/customers/me/*`  
**Auth:** JWT + `CUSTOMER` role only

| Endpoint | Purpose |
|----------|---------|
| `GET /customers/me/dashboard` | Stats + recent orders/pins/notifications |
| `GET /customers/me/orders` | Paginated list + search |
| `GET /customers/me/orders/:id` | Detail + timeline + payment + email history |
| `POST /customers/me/orders/:id/resend-email` | Resend PIN email |
| `GET /customers/me/pins` | PIN warehouse (paginated) |
| `GET /customers/me/notifications` | Grouped notifications |
| `DELETE /customers/me/notifications/:id` | Delete notification |
| `GET /customers/me/search` | Global search |
| `GET/PATCH /customers/me/profile` | Account |
| `POST /customers/me/change-password` | Security |
| `GET /customers/me/security/sessions` | Active sessions |
| `POST /customers/me/security/revoke-others` | Logout other devices |
| `POST /customers/me/support/tickets/:id/close` | Close ticket |

Delegates to: `AccountService`, `OrderDeliveryService`, `NotificationService`, Prisma aggregation.

---

## Frontend — Customer Portal

**Host:** `customer.localhost`  
**Routes:**

| Route | Module |
|-------|--------|
| `/dashboard` | Bảng điều khiển |
| `/orders` | Danh sách đơn + tìm kiếm + CSV |
| `/orders/[id]` | Chi tiết + timeline + PIN + email |
| `/pins` | Kho PIN — reveal, copy, TXT |
| `/notifications` | Nhóm: Đơn hàng, PIN, Khuyến mãi, Hệ thống |
| `/profile` | Tài khoản |
| `/security` | Mật khẩu + phiên |
| `/support` | Phiếu hỗ trợ |

**API client:** `apps/web/lib/customer-portal/api.ts`

---

## Security

- PIN masked until explicit reveal via existing `POST /orders/:id/cards/:cardId/reveal-pin`
- All queries scoped to `userId`
- No admin endpoints exposed

---

## Deployment

```bash
docker compose -f docker-compose.local-full.yml --env-file .env.local-full build api web
docker compose -f docker-compose.local-full.yml --env-file .env.local-full up -d --force-recreate api web
```

Verify: http://customer.localhost — footer **Build 6033.6 CUSTOMER CENTER COMPLETION**

---

## Route Conflict Fix

Next.js cannot host two pages at `/orders/[id]`. Removed `(customer)/orders/[id]/page.tsx` and merged into `apps/web/app/orders/[id]/page.tsx`:

- **customer.localhost** → `CustomerOrderDetailClient` (via `x-cardon-portal` header)
- **localhost** → existing `OrderDeliveryClient` (guest/authenticated delivery)

`apps/web/app/orders/[id]/layout.tsx` wraps customer portal pages with `CustomerShell`.

---

## Verification (2026-06-18)

| Check | Result |
|-------|--------|
| `docker compose build api web` | PASS |
| `docker compose up -d --force-recreate api web` | PASS |
| http://customer.localhost/login | HTTP 200, Vietnamese UI |
| `POST /api/v1/auth/login` (customer@test.local) | PASS |
| `GET /customers/me/dashboard` | PASS |
| `GET /customers/me/orders` | PASS |
| `GET /customers/me/pins` | PASS |
| `GET /customers/me/notifications` | PASS |
| `GET /customers/me/search` | PASS |
| Build label | `6033.6 CUSTOMER CENTER COMPLETION` |

**Test credentials:** `customer@test.local` / `LocalTest2026!`

---

## Acceptance Checklist

- [x] Dashboard completed
- [x] Orders + detail + timeline
- [x] PIN warehouse
- [x] Notifications grouped
- [x] Account + Security
- [x] Support tickets
- [x] 100% Vietnamese UI
- [x] Build label 6033.6
- [x] Docker verify (post-build)
- [x] API endpoints verified
- [x] Localhost PASS (login + auth redirect)
