# Phase 5C.8 — Operation & Account Completion

**Ngày:** 2026-06-20  
**Trạng thái:** ✅ Hoàn thành  
**Phạm vi:** Công cụ vận hành thực tế + tài khoản khách hàng. **Không đổi** payment flow, provider fulfillment, ledger logic.

---

## Tóm tắt

| Task | Kết quả |
|------|---------|
| TASK 1 — Admin order detail (5 tabs) | ✅ `/admin/orders/:id/detail` |
| TASK 2 — Global search | ✅ `/admin/search?q=` + topbar |
| TASK 3 — Customer management | ✅ `/admin/customers` |
| TASK 4 — Admin staff (SUPER_ADMIN) | ✅ `/admin/staff` |
| TASK 5 — Customer `/account` | ✅ Profile, password, orders, cards, topups |
| TASK 6 — Agent registration control | ✅ `agentRegistrationMode` + invites |
| TASK 7 — Permissions | ✅ Seed cập nhật |
| TASK 8 — Tests | ✅ 33 suites, 346 tests |

---

## TASK 1 — Advanced Order Detail

**API:** `GET /api/v1/admin/orders/:id/detail?gatewayTransaction=&revealPins=`

| Tab | Nội dung |
|-----|----------|
| Overview | orderCode, customer, email, phone, products, amount |
| Payment Trace | MegaPay/SePay ref, gateway TX, bank TX, webhook, raw JSON |
| Provider Trace | provider, requestId, attempts, cost, response, retry history |
| Card Delivery | card count, serial, PIN masked (`revealPins=true` để hiện) |
| Audit Timeline | order/payment/provider/admin actions |

**UI:** `apps/admin/app/orders/[id]/page.tsx`

---

## TASK 2 — Global Search

**API:** `GET /api/v1/admin/search?q=`

Tìm: order_code, email, phone, username, payment_reference, provider TX, gateway TX.

**UI:** `GlobalSearchBar` trong admin header.

---

## TASK 3 — Customer Management

**API:**

| Method | Path | Permission |
|--------|------|------------|
| GET | `/admin/customers` | `customers.read` |
| GET | `/admin/customers/:id` | `customers.read` |
| PATCH | `/admin/customers/:id` | `customers.manage` |
| POST | `/admin/customers/:id/lock` | `customers.manage` |
| POST | `/admin/customers/:id/unlock` | `customers.manage` |
| POST | `/admin/customers/:id/reset-password` | `customers.manage` |

Không expose: password, `identityNumberEnc`.

**UI:** `apps/admin/app/customers/page.tsx`

---

## TASK 4 — Admin Staff (SUPER_ADMIN)

**API:** `/admin/staff` — create, update, disable, reset password

Roles: SUPPORT, MARKETING, ACCOUNTANT, ADMIN

Rules:
- Không tạo/sửa SUPER_ADMIN qua API
- Không disable chính mình
- Audit mọi action

**UI:** `apps/admin/app/staff/page.tsx`

---

## TASK 5 — Customer Account Dashboard

**API:** `/api/v1/account/*` (CUSTOMER role)

| Route | Chức năng |
|-------|-----------|
| GET/PATCH `/account/profile` | Xem/sửa fullName, phone |
| POST `/account/change-password` | Đổi MK + revoke sessions |
| GET `/account/orders` | Lịch sử đơn |
| GET `/account/cards` | Thẻ đã mua (serial/PIN) |
| GET `/account/topups` | Placeholder |

**Web:** `apps/web/app/account/*`

---

## TASK 6 — Agent Registration Control

**Setting:** `agentRegistrationMode` trong System Settings

| Mode | Mặc định | Hành vi |
|------|----------|---------|
| `INVITE_ONLY` | ✅ | Cần invite token |
| `PUBLIC_APPROVAL` | | Mở đăng ký + KYC admin approve |
| `DISABLED` | | Từ chối register |

**Invite:** `POST /admin/agent-invites` → link partner

**Schema:** `agent_invites` table

---

## TASK 7 — Permissions

| Permission | SUPPORT | MARKETING | ACCOUNTANT | ADMIN | SUPER_ADMIN |
|------------|---------|-----------|------------|-------|-------------|
| `customers.read/manage` | ✅ | — | — | ✅ | ✅ |
| `users.manage` | — | — | — | — | ✅ |
| `orders.read` | ✅ | — | ✅ | ✅ | ✅ |
| `payments.view` | ✅ | — | ✅ | ✅ | ✅ |
| `cms.manage` | — | ✅ | — | ✅ | ✅ |
| `finance.*` | — | — | ✅ | ✅ | ✅ |
| `settings.manage` | — | — | — | — | ✅ |

---

## Verification

```
npm run build          ✅
npm run build:web      ✅  (18 routes incl. /account/*)
npm run build:partner  ✅
npm run build:admin    ✅  (24 routes incl. customers, staff, orders/[id])
npm test               ✅  33 suites, 346 tests
```

**Tests mới:** `src/modules/admin/admin-operation.spec.ts`

---

## Files chính

| Layer | Files |
|-------|-------|
| Backend | `admin-order-detail.mapper.ts`, `admin-operation.controller.ts`, `admin-customer.service.ts`, `admin-staff.service.ts`, `admin-search.service.ts`, `account.controller.ts`, `agent-invite.service.ts` |
| Schema | `prisma/migrations/20250620140000_phase_5c8_operations/` |
| Admin UI | `orders/[id]`, `customers`, `staff`, `GlobalSearchBar` |
| Web UI | `app/account/*` |
| Seed | `customers.read`, `customers.manage`, `users.manage` |

---

## Kết luận

Phase 5C.8 hoàn tất: admin có công cụ tra cứu đơn/payment/provider, quản lý khách hàng & nhân sự, global search; khách hàng có dashboard `/account`; agent registration có kiểm soát invite/mode. Payment, provider fulfillment, ledger **không thay đổi**.
