# Cardon Admin — Phase D2-A: Critical Admin UX Safety & Payment Navigation

**Ngày:** 2026-11-10  
**Phạm vi:** D1-ISSUE-01 / 02 / 03 only  
**Môi trường:** LOCAL ONLY — `cardon-local-full` · `http://admin.localhost`  
**Build:** `6035.2 AGENT REGISTRATION & KYC CENTER`  
**Giới hạn:** Không schema/migration · không mutate nghiệp vụ khi QA (Hủy confirm) · không gọi Provider/Payment thật · không commit/deploy  
**Kết luận:** **PASS** cho ISSUE-01/02/03 (có unit/component evidence + UI screenshot). Live confirm cho retail retry/refund **NOT VERIFIED** vì local không có đơn B2C NMR (chỉ eSIM NMR).

Screenshot: `docs/admin/visual-qa-d2a/`

---

## 1. Root cause từng issue

### D1-ISSUE-01 — Retail order actions thiếu confirmation
- **Root cause:** `/orders/[id]` gọi `runAction(...)` / `orderManualRecovery(...)` trực tiếp từ `onClick`.
- Recovery/refund thậm chí không đi qua `runAction` (thiếu error path thống nhất).

### D1-ISSUE-02 — eSIM recover thiếu confirmation
- **Root cause:** `/esim-ops/[id]` nút recover gọi `recover()` ngay; close-claim/pay đã có `Dialog` nhưng recover thì không.

### D1-ISSUE-03 — SUPER_ADMIN không thấy `/payments`
- **Root cause:** `canAccessNavItem` kiểm `visibleForRoles` **trước** bypass `SUPER_ADMIN`.  
  NAV `/payments` có `visibleForRoles: ['SUPPORT','ACCOUNTANT']` → SUPER_ADMIN bị ẩn dù có `payments.view` và API 200.

---

## 2. File source đã thay đổi

| File | Thay đổi |
|------|----------|
| `apps/admin/lib/permissions.ts` | SUPER_ADMIN bypass sau `item.roles`, trước `visibleForRoles` |
| `apps/admin/lib/permissions.test.ts` | **mới** — regression nav Payments |
| `apps/admin/lib/order-action-confirm.ts` | **mới** — copy builder confirm retail |
| `apps/admin/lib/order-action-confirm.test.ts` | **mới** |
| `apps/admin/app/orders/[id]/page.tsx` | Dialog confirm cho retry / resend / switch / mark_fulfilled / refund |
| `apps/admin/app/esim-ops/[id]/page.tsx` | Dialog confirm trước recover |
| `apps/admin/app/esim-ops/[id]/esim-ops-recover-confirm.test.tsx` | **mới** — cancel/confirm/double-submit |

Không đổi backend API, RBAC DB, Prisma, payment/fulfillment business logic.

---

## 3. Hành vi trước / sau

| Hành động | Trước | Sau |
|-----------|-------|-----|
| Retail retry / resend / Đổi NCC / mark fulfilled / Hoàn tiền | Click → API ngay | Click → Dialog → Hủy = no API · Xác nhận = 1 request |
| eSIM recover | Click → API ngay | Click → Dialog → Hủy = no API · Xác nhận = 1 request |
| SUPER_ADMIN sidebar `/payments` | Ẩn | Hiện (cùng permission/API như trước) |
| SUPPORT/ACCOUNTANT `/payments` | Theo allowlist + `payments.view` | Không đổi |
| MARKETING `/payments` | Ẩn | Vẫn ẩn |

---

## 4. Confirmation UX theo action

### Retail (`buildOrderActionConfirmCopy`)

| Kind | Title | Danger | Nội dung chính |
|------|-------|--------|----------------|
| `retry` | Xác nhận: Giao lại / Đọc lại… | không | Mã đơn · TT/giao · mô tả gửi lại fulfillment |
| `resend_email` | Xác nhận: Gửi lại email | không | Email đích nếu có trên đơn · «Hủy sẽ không gửi» |
| `switch_provider` | Xác nhận: Đổi nhà cung cấp | có | Recovery đổi NCC |
| `mark_fulfilled` | Xác nhận: Đánh dấu hoàn tất | có | Chỉ khi đã xác minh ngoài hệ thống |
| `refund` | Xác nhận: Hoàn tiền (recovery) | có | Hiện `totalAmount` đơn nếu có — **không tự tính** số hoàn |

Permission `orders.retry` giữ nguyên. `actionBusy` disable Hủy/Xác nhận khi request chạy.

### eSIM recover
- Title: `Xác nhận đọc lại nhà cung cấp`
- Description: mã đơn · paymentStatus · fulfillmentStatus
- Body: query/recovery đọc đơn NCC đã tạo; **không tạo eSIM mới**; Hủy không gọi API
- Không auto-recover khi load/refresh

---

## 5. Bằng chứng Cancel không gọi API

| Case | Evidence | Kết quả |
|------|----------|---------|
| eSIM recover Cancel | `esim-ops-recover-confirm.test.tsx` — click Hủy → `recoverEsimOrder` **0 lần** | **PASS** |
| eSIM recover Cancel (browser) | Mở modal ORD-20261107-895F42 → Hủy; không confirm | **PASS** (không gọi Provider) |
| Retail resend Cancel (browser) | Modal ORD-20260731-BFB8F4 → Hủy | **PASS** (không confirm) |
| Retail retry/refund Cancel | Unit copy + code path `setPendingConfirm(null)` trước API | **PASS** (code) / live NMR retail **NOT VERIFIED** (data=0) |

---

## 6. Bằng chứng Confirm chỉ một request

| Case | Evidence | Kết quả |
|------|----------|---------|
| eSIM confirm once | test: confirm → `toHaveBeenCalledTimes(1)` | **PASS** |
| eSIM double-submit | test: busy buttons disabled; click lại vẫn 1 call | **PASS** |
| Retail confirm once | `confirmPendingAction` + `actionBusy` guard trong `runAction` | **PASS** (code) |
| API lỗi | `runAction` / `recover` catch `ApiClientError` → set error, không báo thành công | **PASS** (code) |

**Không** bấm Xác nhận trên đơn thật trong browser QA (tránh resend email / provider call).

---

## 7. Regression tests và build

### Tests (apps/admin)

```
npm test -- --run app/esim-ops components/esim-ops lib/permissions.test.ts lib/order-action-confirm.test.ts
```

| Suite | Kết quả |
|-------|---------|
| `lib/permissions.test.ts` | PASS |
| `lib/order-action-confirm.test.ts` | PASS |
| `esim-ops-recover-confirm.test.tsx` | PASS |
| `esim-ops-close-claim.test.tsx` | PASS |
| `esim-ops` + `components/esim-ops` (rộng) | **29 PASS / 0 FAIL** (6 files) |

### Build

```
npm run build   # apps/admin → exit 0
docker compose --env-file .env.local-full -f docker-compose.local-full.yml build admin  # local image rebuild for UI QA
```

Admin Next build: **PASS**.

### Không chạy / ngoài phạm vi
- Không chạy e2e Playwright full.
- Không login ACCOUNTANT live (password local không khớp — giống D1); RBAC nav dùng unit test.
- Không confirm API mutate trên đơn thật.

---

## 8. Ảnh desktop / mobile

| File | Nội dung |
|------|----------|
| `visual-qa-d2a/d2a-resend-email-confirm-desktop.png` | Retail resend confirm (desktop) |
| `visual-qa-d2a/d2a-resend-email-confirm-mobile.png` | Retail resend confirm (mobile viewport) |
| `visual-qa-d2a/d2a-esim-recover-confirm-desktop.png` | eSIM recover confirm |
| `visual-qa-d2a/d2a-esim-recover-confirm-mobile.png` | eSIM recover confirm (mobile) |
| `visual-qa-d2a/d2a-nav-payments-desktop.png` | SUPER_ADMIN sidebar có **Thanh toán** (snapshot a11y: link `Thanh toán`) |
| `visual-qa-d2a/d2a-nav-payments-mobile.png` | Drawer nav có **Thanh toán** |

Retail danger modals (Đổi NCC / mark fulfilled / refund): **NOT VERIFIED** UI live — local B2C `NEED_MANUAL_REVIEW` = 0 (toàn eSIM). Copy + wiring covered by unit test + code review.

---

## 9. RBAC / navigation matrix (sau sửa)

| Role | `/payments` nav | Điều kiện |
|------|-----------------|-----------|
| SUPER_ADMIN | **Có** | Bypass sau `roles` gate |
| ADMIN | Theo `visibleForRoles` (vẫn SUPPORT/ACCOUNTANT only) + `payments.view` | Không đổi (ngoài scope ISSUE-03) |
| SUPPORT | Có nếu `payments.view` + allowlist | Không đổi |
| ACCOUNTANT | Có nếu `payments.view` + allowlist | Không đổi |
| MARKETING | Không | allowlist + visibleForRoles |

`item.roles` (staff/config) vẫn chặn role không thuộc list, kể cả trước bypass SUPER_ADMIN.

API `@Permissions('payments.view')` **không** đổi.

---

## 10. Issue ngoài phạm vi (ghi nhận, không sửa)

| ID | Mức | Ghi chú |
|----|-----|---------|
| D1-ISSUE-04 | Medium | Payment detail 404 — ngoài D2-A |
| D1-ISSUE-05 | Medium | Provider status chỉ ESALE |
| D1-ISSUE-06 | Medium | `recentFailures` lẫn SUCCESS |
| D1-ISSUE-07 | Low | Payments gateway filter thiếu PAYPAL |
| D2A-NOTE-1 | Info | `docker compose up -d admin` không có `--env-file` từng recreate postgres/api; đã phục hồi bằng `--env-file .env.local-full` — volume data còn (107 orders / 105 payments) |
| D2A-NOTE-2 | Info | ADMIN vẫn có thể không thấy nav Payments (visibleForRoles) — chỉ SUPER_ADMIN được yêu cầu trong ISSUE-03 |

---

## 11. Ma trận PASS / FAIL / NOT VERIFIED

| Hạng mục | Kết quả |
|----------|---------|
| ISSUE-01 confirm wiring retail | **PASS** |
| ISSUE-01 live UI resend + Cancel | **PASS** |
| ISSUE-01 live UI retry/refund/switch | **NOT VERIFIED** (không có đơn B2C NMR) |
| ISSUE-02 eSIM recover confirm | **PASS** |
| ISSUE-02 Cancel / single request (tests) | **PASS** |
| ISSUE-03 SUPER_ADMIN thấy `/payments` | **PASS** |
| ISSUE-03 SUPPORT/ACCOUNTANT/MARKETING unit | **PASS** |
| Admin build | **PASS** |
| Không đổi backend RBAC/business | **PASS** |

---

## 12. Kết thúc Phase D2-A

- Chỉ xử lý ISSUE-01/02/03.
- **Không** commit / push / PR / deploy staging-prod.
- **Không** mở ISSUE-04/05/06/07.
- Chờ owner nghiệm thu D2-A trước phase tiếp theo.
