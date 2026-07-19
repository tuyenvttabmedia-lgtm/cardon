# Phase 5C.9 — Operation Security Audit

**Ngày:** 2026-06-18  
**Trạng thái:** ✅ Hoàn thành (audit only)  
**Phạm vi:** Kiểm tra bảo mật các tính năng vận hành Phase 5C.8. **Không thêm feature, không đổi business logic.**

---

## Tóm tắt

| Check | Kết quả | Ghi chú |
|-------|---------|---------|
| CHECK 1 — Order detail | ⚠️ **Có gap** | Trace OK; PIN reveal thiếu quyền riêng; raw gateway JSON chưa sanitize |
| CHECK 2 — Global search | ⚠️ **Có gap** | MARKETING bị chặn; kết quả không lọc theo quyền caller |
| CHECK 3 — Customer management | ✅ **PASS** | Không lộ password/CMND; lock/reset an toàn |
| CHECK 4 — Staff management | ✅ **PASS** | SUPER_ADMIN only; bảo vệ self-disable & SUPER_ADMIN |
| CHECK 5 — Agent invite | ✅ **PASS** | Token an toàn; rejected/deleted agent không gọi API |
| CHECK 6 — Audit logs | ✅ **PASS** | Đủ action cho các luồng yêu cầu |

**Findings:** 3 gap (F-5C9-01 … F-5C9-03). Không sửa code trong phase này.

---

## Phương pháp

1. Đọc controller/guard/permission seed (`prisma/seed.mjs`)
2. Trace service → repository → mapper (order detail, search, customer, staff, agent invite)
3. Đối chiếu audit constants & `AdminAuditService` / `AgentAuditService`
4. Chạy regression:

```text
npm run build          → PASS (Docker node:22-alpine)
npm run build:web      → PASS
npm run build:partner  → PASS
npm run build:admin    → PASS
npm test               → 33/33 suites, 355/355 tests PASS
```

---

## CHECK 1 — Order detail security

**Endpoint:** `GET /api/v1/admin/orders/:id/detail`  
**Guard:** `@Permissions('orders.read')`  
**File:** `src/modules/admin/controllers/admin-operation.controller.ts`

### SUPPORT xem order trace

| Tab | SUPPORT (`orders.read` + `payments.view`) | Ghi chú |
|-----|-------------------------------------------|---------|
| Overview | ✅ | Customer email/phone, products, amount |
| Payment Trace | ✅ | Ref, gateway TX, bank TX, webhook |
| Provider Trace | ✅ | Payload qua `sanitizeProviderPayload()` |
| Card Delivery | ✅ | Serial giải mã; PIN masked mặc định |
| Audit Timeline | ✅ | Action + actor |

**Kết luận:** SUPPORT **có thể** xem đầy đủ trace vận hành.

### PIN — masked trừ khi được phép

| Kiểm tra | Kết quả |
|----------|---------|
| Mặc định `pinMasked = '******'` | ✅ `admin-order-detail.mapper.ts` |
| `?revealPins=true` hiện PIN thật | ⚠️ Chỉ cần `orders.read` |

**Finding F-5C9-01 (MEDIUM):** Query `revealPins=true` **không** yêu cầu permission riêng (ví dụ `orders.manage` hoặc `cards.reveal`). SUPPORT có `orders.read` → có thể giải mã PIN qua API hoặc nút "Hiện PIN" trên UI (`apps/admin/app/orders/[id]/page.tsx`, cũng chỉ `RequirePermission permission="orders.read"`).

**Khuyến nghị (phase sau):** Thêm permission `cards.reveal` hoặc giới hạn role ADMIN+; guard cả API lẫn UI.

### Secrets

| Nguồn | Sanitize? | Kết quả |
|-------|-----------|---------|
| Provider request/response | ✅ `SENSITIVE_KEY` regex | PASS |
| Payment `gatewayRawResponse` | ❌ Trả nguyên `gatewayResponse` JSON | ⚠️ |

**Finding F-5C9-02 (LOW–MEDIUM):** `gatewayRawResponse` trong payment trace **không** qua sanitize. Nếu gateway response chứa key nhạy cảm, SUPPORT có thể thấy qua tab Payment Trace.

**Không lộ:** `passwordHash`, `apiKeyHash`, `secretKeyEncrypted`, agent credentials trong order detail.

### Modify payment

| Endpoint modify payment | Permission | SUPPORT |
|-------------------------|------------|---------|
| `POST /admin/payments/:id/resolve` | `payments.review` | ❌ Không có quyền |

Không có endpoint sửa payment trong `AdminOperationController`. **PASS.**

---

## CHECK 2 — Global search security

**Endpoint:** `GET /api/v1/admin/search?q=`  
**Guard:** `@Permissions('orders.read')`  
**Files:** `admin-operation.controller.ts`, `admin-search.service.ts`, `admin.repository.ts` → `globalSearch()`

### MARKETING

Seed: `MARKETING: ['cms.manage']` — **không** có `orders.read`.

→ Gọi `/admin/search` → **403 Forbidden**. **PASS.**

MARKETING không thể search payments, customers, transactions (provider TX).

### Role khác có `orders.read`

| Role | `orders.read` | Nhận full search (orders + customers + payments + provider TX) |
|------|---------------|----------------------------------------------------------------|
| SUPPORT | ✅ | ✅ (có thêm `customers.read`, `payments.view` — hợp lý) |
| ACCOUNTANT | ✅ | ⚠️ Nhận **customers** & **staff** dù **không** có `customers.read` |
| ADMIN | ✅ | ✅ (đủ quyền) |

**Finding F-5C9-03 (MEDIUM):** `AdminSearchService.search()` trả toàn bộ nhóm kết quả; **không** lọc theo permission của user gọi API. ACCOUNTANT có thể thấy email/username khách qua search trong khi `GET /admin/customers` bị chặn.

**Khuyến nghị (phase sau):** Inject `AuthenticatedUser` vào search; chỉ trả bucket khi caller có permission tương ứng (`customers.read`, `payments.view`, …).

### Không rò PIN / secret / identity

| Trường trong response search | Có trong payload? |
|------------------------------|-------------------|
| PIN / encryptedPin | ❌ |
| passwordHash / secret | ❌ |
| identityNumberEnc | ❌ |
| Card serial | ❌ (search không query card) |

Select an toàn: orderCode, email, phone, paymentReference, provider TX id. **PASS** về không leak dữ liệu nhạy cảm trực tiếp.

---

## CHECK 3 — Customer management security

**Files:** `admin-customer.service.ts`, `admin.repository.ts` → `findCustomers` / `findCustomerById`

### Admin không thấy password / CMND raw

| Trường | Trong select API? |
|--------|-------------------|
| `passwordHash` | ❌ |
| `identityNumberEnc` | ❌ |

`findCustomerById` chỉ: id, username, fullName, email, phone, status, timestamps, orders summary. **PASS.**

### Lock customer

| Hành vi | Implementation | Kết quả |
|---------|----------------|---------|
| Chặn login | `UserStatus.SUSPENDED` → `auth.service.ts` + `jwt.strategy.ts` | ✅ |
| Không xóa đơn | Lock chỉ `update status`; orders query `ACTIVE_ORDER_WHERE` | ✅ |

Audit: `ADMIN_CUSTOMER_LOCKED` qua `AdminAuditService.record()`. **PASS.**

### Reset password (admin)

Luồng `AdminCustomerService.resetCustomerPassword()`:

1. `TokenService.generateRefreshTokenValue()` — token ngẫu nhiên
2. Lưu `tokenHash` (SHA), `expiresAt` = +1 giờ
3. Gửi email qua `notifyPasswordReset` (chỉ raw token trong email, không trong API response)
4. Consumer dùng `auth.service.resetPassword()` — kiểm tra `usedAt: null`, `expiresAt`, đánh dấu `usedAt`, revoke refresh tokens

**PASS** — token flow an toàn, single-use.

---

## CHECK 4 — Staff management security

**Endpoint prefix:** `/admin/staff/*`  
**Guard:** `JwtAuthGuard` + `PermissionsGuard` + `RolesGuard` + `@Roles(SUPER_ADMIN)` + `@Permissions('users.manage')`

### Chỉ SUPER_ADMIN

| Action | SUPER_ADMIN | ADMIN / SUPPORT |
|--------|-------------|-----------------|
| List / create / update / disable staff | ✅ | ❌ 403 (RolesGuard) |
| Create ADMIN role | ✅ | ❌ |
| Create SUPER_ADMIN | ❌ Forbidden (service) | ❌ |

**PASS.**

### Bảo vệ đặc biệt

| Rule | Code | Kết quả |
|------|------|---------|
| Không disable chính mình | `disableStaff`: `adminId === id` → Forbidden | ✅ |
| Không disable SUPER_ADMIN | `staff.role === SUPER_ADMIN` → Forbidden | ✅ (bao gồm SUPER_ADMIN cuối cùng) |
| Không sửa SUPER_ADMIN | `updateStaff`: role SUPER_ADMIN → Forbidden | ✅ |
| Không gán SUPER_ADMIN | `dto.role === SUPER_ADMIN` → Forbidden | ✅ |
| Không tạo SUPER_ADMIN qua API | `createStaff` reject SUPER_ADMIN | ✅ |

Self-downgrade: SUPER_ADMIN không thể PATCH chính mình vì mọi user có `role === SUPER_ADMIN` đều bị chặn sửa. **PASS.**

Audit: `ADMIN_STAFF_CREATED`, `ADMIN_STAFF_UPDATED`, `ADMIN_STAFF_DISABLED`, `ADMIN_STAFF_PASSWORD_RESET`. **PASS.**

---

## CHECK 5 — Agent invite security

### Invite token

| Thuộc tính | Implementation | File |
|------------|----------------|------|
| Random | `randomBytes(32).toString('hex')` | `admin-agent-invite.service.ts` |
| Expires | `expiresAt` = now + `expiresInDays` (default 7) | ✅ |
| Single use | `usedAt` set trong `consumeInvite()`; validate `usedAt: null` | `agent-invite.service.ts` |
| Lưu DB | Chỉ `tokenHash` (SHA-256), không lưu raw | ✅ |

**PASS.**

### Rejected agents — không access API

`AgentApiAuthService.authenticate()`:

- `status !== ACTIVE || !apiEnabled` → `AGENT_INACTIVE`
- `rejectKyc()` set `AgentStatus.REJECTED`, `apiEnabled: false`

**PASS.**

### Deleted agents — soft delete only

- Schema `Agent.deletedAt`; mọi query agent repo filter `deletedAt: null`
- Không có endpoint hard-delete agent trong codebase
- Suspend = `SUSPENDED` + `apiEnabled: false` (soft operational disable)

**PASS** (pattern soft delete; không có hard delete).

Audit invite: `ADMIN_AGENT_INVITE_CREATED`. **PASS.**

---

## CHECK 6 — Audit logs

| Sự kiện yêu cầu | Action constant | Service ghi log |
|-----------------|-----------------|-----------------|
| Staff create | `ADMIN_STAFF_CREATED` | `AdminStaffService.createStaff` |
| Role change | `ADMIN_STAFF_UPDATED` | `AdminStaffService.updateStaff` |
| Customer lock | `ADMIN_CUSTOMER_LOCKED` | `AdminCustomerService.lockCustomer` |
| Agent approval | `KYC_APPROVED` | `AgentAuditService.recordKycApproved` (target AGENT) |
| Admin reset password (customer) | `ADMIN_CUSTOMER_PASSWORD_RESET` | `AdminCustomerService.resetCustomerPassword` |

Tất cả ghi qua `AuditService.recordEvent()` → bảng audit. Agent approval nằm agent audit namespace (cùng hệ thống, khác action prefix admin). **PASS.**

---

## Bảng findings

| ID | Mức | Mô tả | File liên quan |
|----|-----|-------|----------------|
| **F-5C9-01** | MEDIUM | `revealPins=true` chỉ cần `orders.read`; SUPPORT reveal PIN | `admin-operation.controller.ts`, `orders/[id]/page.tsx` |
| **F-5C9-02** | LOW–MEDIUM | `gatewayRawResponse` không sanitize | `admin-order-detail.mapper.ts` |
| **F-5C9-03** | MEDIUM | Global search không lọc bucket theo permission caller | `admin-search.service.ts`, `admin-operation.controller.ts` |

---

## Regression

```text
npm run build          → PASS
npm run build:web      → PASS
npm run build:partner  → PASS
npm run build:admin    → PASS
npm test               → 33 suites, 355 tests PASS
```

*(Chạy trong Docker `node:22-alpine` — host Windows không có Node/npm.)*

---

## Kết luận

Phase 5C.9 xác nhận **phần lớn** ranh giới bảo mật vận hành đúng thiết kế: customer/staff/agent invite/audit logs **PASS**; MARKETING bị chặn search **PASS**; SUPPORT không sửa payment **PASS**.

**3 gap** cần xử lý ở phase follow-up (không sửa trong 5C.9):

1. **PIN reveal** — tách permission hoặc giới hạn role
2. **Payment raw JSON** — sanitize tương tự provider payload
3. **Search scoping** — lọc kết quả theo permission thực tế của caller

**Không có thay đổi code trong phase này.**
