# Phase 6F.2 — Customer UX & Checkout Finalization

**Ngày hoàn thành:** 2025-06-21  
**Phạm vi:** Hoàn thiện trải nghiệm mua hàng khách hàng, validation checkout, bắt buộc đăng nhập trước thanh toán, chống double-submit, fraud trace, nâng cấp tài khoản, mobile nav.

**Không thay đổi:** payment gateway flow, provider fulfillment flow, agent API, ledger logic.

**Thay đổi:** customer UX, checkout behavior, account UI, frontend validation, fraud trace fields (backend minor).

---

## Tóm tắt

Phase 6F.2 hoàn thiện luồng mua hàng công khai sau redesign trang chủ (6F.1). Khách có thể duyệt và chọn sản phẩm không cần đăng nhập; **Thanh toán** yêu cầu tài khoản. Checkout được validate phía client, chống tạo đơn trùng, lưu trace phục vụ tra soát/khiếu nại. Trung tâm tài khoản `/account` được mở rộng thành 6 mục. Mobile bottom nav chuyển sang 5 tab theo spec.

---

## TASK 1 — Quick Checkout State Audit

| Hành vi | Triển khai |
|---------|------------|
| Đổi category | Reset product, variant, quantity=1; xóa lỗi/payment |
| Đổi provider (product) | Reset variant; reload mệnh giá |
| Chỉ ẩn khi INACTIVE | `filterProductsByHomeCategory` + `getActiveVariants` lọc `status === 'ACTIVE'` |
| Không ẩn vì stock/balance thấp | Không filter theo provider stock — fulfillment xử lý sau payment |

**File:** `apps/web/components/home/HomePageClient.tsx`, `apps/web/lib/home-catalog.ts`

**URL deep link:** `/?section=buy-card&category=game|topup` → scroll `#buy-card`

---

## TASK 2 — Checkout Validation

Validation trước khi gọi API (`apps/web/lib/checkout-validation.ts`):

| Điều kiện | Lỗi (tiếng Việt) |
|-----------|------------------|
| Chưa đăng nhập | Vui lòng đăng nhập để tiếp tục thanh toán |
| Chưa chọn product | Vui lòng chọn loại thẻ / nhà cung cấp |
| Chưa chọn variant | Vui lòng chọn mệnh giá |
| quantity &lt; 1 | Số lượng phải từ 1 trở lên |
| TOPUP thiếu SĐT | Vui lòng nhập số điện thoại cần nạp |
| TOPUP SĐT sai format | Số điện thoại không hợp lệ (VD: 0912345678) |

Email lấy từ tài khoản đã đăng nhập (input disabled trên UI).

---

## TASK 3 — Require Login Before Payment

- Guest: duyệt homepage, chọn thẻ/mệnh giá/số lượng.
- Click **Thanh toán** khi chưa login → modal `LoginRequiredModal`:
  - Tiêu đề: *Đăng nhập để tiếp tục giao dịch*
  - Mô tả: *Đăng nhập giúp bảo vệ giao dịch và hỗ trợ xử lý khiếu nại khi cần.*
  - Nút: **Đăng nhập** / **Tạo tài khoản**
- State checkout lưu `sessionStorage` (`checkout-persistence.ts`), restore sau login qua `?checkout=resume`.
- **Backend guest order giữ nguyên** — frontend không gửi `guestEmail` trên website công khai.

**Files:** `LoginRequiredModal.tsx`, `checkout-persistence.ts`, `LoginPageClient.tsx`, `RegisterPageClient.tsx`

---

## TASK 4 — Payment Submit Protection

- `payInFlightRef` + `checkoutLoading` chặn double-click.
- Nút disabled khi loading; label: **Đang tạo giao dịch...**
- Idempotency key vẫn dùng cho payment API (giữ flow cũ).

---

## TASK 5 — Customer Fraud Trace Preparation

**Schema:** `Order.clientTrace` (JSON) — migration `20250621140000_order_client_trace`

**Lưu khi tạo đơn:**

| Field | Nguồn |
|-------|-------|
| customerId | user.id |
| customerEmail | user.email (hoặc guestEmail backend) |
| phone | guestPhone (TOPUP) |
| ipAddress | Request header (X-Forwarded-For / socket) |
| userAgent | Request header |
| deviceInfo | Frontend `collectClientDeviceInfo()` |
| capturedAt | ISO timestamp |

**Không expose public:** `mapOrder()` không trả `clientTrace`. Chỉ admin order detail (`admin-order-detail.mapper.ts`) với quyền phù hợp.

**Files backend:** `request-client.util.ts`, `create-order.dto.ts`, `order.controller.ts`, `order.service.ts`, `order.repository.ts`

---

## TASK 6 — Header Login State

**Desktop header** (`Header.tsx` + `UserAccountDropdown.tsx`):

| Trạng thái | UI |
|------------|-----|
| Chưa login | Đăng nhập, Đăng ký |
| Đã login | Avatar + tên → dropdown: Thông tin tài khoản, Lịch sử giao dịch, Mã thẻ đã mua, Nạp cước, Bảo mật, Đăng xuất |

Cập nhật qua `AuthContext` — không refresh trang.

---

## TASK 7 — Customer Account Center Upgrade

**Layout:** `apps/web/app/account/layout.tsx` — sidebar 6 mục, responsive.

| Mục | Route | Nội dung |
|-----|-------|----------|
| Thông tin tài khoản | `/account` | username, email (read-only), fullName, phone (edit), createdAt |
| Lịch sử giao dịch | `/account/orders` | Tất cả đơn + payment/fulfillment status, amount, date |
| Thẻ đã mua | `/account/cards` | Chỉ PAID+COMPLETED; serial, PIN mask/reveal, copy |
| Nạp cước | `/account/topups` | Placeholder bảng (chuẩn bị) |
| Bảo mật | `/account/password` | Đổi mật khẩu; revoke sessions sau đổi |
| Hỗ trợ | `/account/support` | Khiếu nại giao dịch (chuẩn bị) |

Labels tiếng Việt: `apps/web/lib/order-labels.ts`

---

## TASK 8 — Mobile Bottom Navigation

**5 tab** (`MobileBottomNav.tsx`):

| Tab | Hành động |
|-----|-----------|
| Trang chủ | `/` |
| Mua thẻ | `/?section=buy-card&category=game` |
| Nạp cước | `/?section=buy-card&category=topup` |
| Khuyến mãi | `/blog?category=khuyen-mai` |
| Tài khoản | `/account` (logged) hoặc `/login` (guest) |

Sticky checkout bar: `bottom-[4.25rem]`; homepage `pb-28` khi có variant — không che nav và nút thanh toán.

---

## TASK 9 — Responsive Audit

| Breakpoint | Kiểm tra |
|------------|----------|
| 375px | Bottom nav 5 tab, sticky checkout, modal login |
| 430px | Grid provider, form inputs full width |
| 768px | Chuyển desktop summary / mobile sticky |
| 1024px | Header menu đầy đủ, account sidebar |
| 1440px | `max-w-site` container 1200px |

**TypeScript:** `tsc --noEmit` apps/web **PASS** trên agent.

---

## TASK 10 — Security Checks

| Kiểm tra | Kết quả |
|----------|---------|
| Khách không xem đơn người khác | `findByIdForUser` scope `userId`; account API `@UseGuards(JwtAuthGuard)` |
| PIN chỉ sau PAID+COMPLETED | `listPurchasedCards` filter payment+fulfillment; `getCustomerOrderCards` throws Forbidden |
| Không lộ trace public | `clientTrace` không trong `OrderView` |
| Storage | Token/user trong localStorage (auth chuẩn); checkout pending chỉ sessionStorage (xóa sau restore) — không lưu PIN/serial |

---

## TASK 11 — Build & Tests

```bash
npm install
npm run build          # nest build
npm run build:web      # next build
npm run build:admin    # next build admin
npm test
```

**Kết quả agent (2025-06-21):**

| Kiểm tra | Kết quả |
|----------|---------|
| `prisma generate` | OK |
| `tsc -p tsconfig.build.json` (backend) | OK |
| `tsc --noEmit` (apps/web) | **PASS** |
| `nest build` | OK (`dist/main.js`) |
| `jest` (full suite) | **367 passed**, 34 suites |
| `npm install` | Không chạy được — npm không có trong PATH agent |
| `npm run build:web` / `build:admin` | Fail — thiếu `@next/swc-win32-x64-msvc` (cần `npm install` trên máy local) |
| `tsc --noEmit` (apps/admin) | Fail — thiếu `@tiptap/*` (cần `npm install` workspace) |

> **Khuyến nghị local:** Chạy `npm install` tại root, sau đó `npm run build:web` và `npm run build:admin`. Apply migration: `npx prisma migrate deploy`.

---

## Files chính

```
apps/web/components/home/HomePageClient.tsx
apps/web/lib/checkout-validation.ts
apps/web/lib/checkout-persistence.ts
apps/web/lib/order-labels.ts
apps/web/lib/home-catalog.ts
apps/web/components/checkout/LoginRequiredModal.tsx
apps/web/components/layout/Header.tsx
apps/web/components/layout/UserAccountDropdown.tsx
apps/web/components/layout/MobileBottomNav.tsx
apps/web/app/account/**
apps/web/app/login/LoginPageClient.tsx
apps/web/app/register/RegisterPageClient.tsx

src/common/utils/request-client.util.ts
src/modules/order/dto/create-order.dto.ts
src/modules/order/controllers/order.controller.ts
src/modules/order/services/order.service.ts
src/modules/order/repositories/order.repository.ts
src/modules/admin/entities/admin-order-detail.mapper.ts
prisma/schema.prisma
prisma/migrations/20250621140000_order_client_trace/
```

---

## QA thủ công đề xuất

1. Guest: chọn Garena → mệnh giá → **Thanh toán** → modal login xuất hiện.
2. Login → state restore → thanh toán SePay → một đơn duy nhất (double-click test).
3. TOPUP: SĐT sai → lỗi tiếng Việt; SĐT đúng → tạo đơn.
4. Header dropdown sau login; logout không refresh cứng.
5. `/account`: sửa họ tên/SĐT; xem đơn; thẻ đã mua — PIN ẩn mặc định.
6. Mobile 375px: bottom nav không che nút Thanh toán.
7. Admin order detail: xem `clientTrace` (IP, UA, device).

---

**Trạng thái:** Phase 6F.2 hoàn thành theo phạm vi yêu cầu. Build Next.js cần xác nhận trên môi trường local có npm đầy đủ.
