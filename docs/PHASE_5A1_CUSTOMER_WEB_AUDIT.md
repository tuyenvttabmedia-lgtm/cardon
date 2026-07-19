# Phase 5A.1 — Customer Website Audit

> Date: 2026-06-19  
> Scope: `apps/web/` (customer site only)  
> Reference: [PHASE_5A_CUSTOMER_WEB_REPORT.md](./PHASE_5A_CUSTOMER_WEB_REPORT.md)  
> Out of scope: Agent Portal, Admin UI, tính năng mới

---

## Executive Summary

| Overall | **PASS** |
|---------|----------|
| Security-critical checks (2, 3, 5, 9) | **PASS** |
| `npm run build` (web) | **PASS** (8 routes, exit 0) |
| Critical fixes applied | **0** (không phát hiện lỗi nghiêm trọng) |

Website khách hàng đáp ứng yêu cầu **correctness** và **security** cho giai đoạn 5A.1. Các điểm còn lại là cải thiện UX/SEO, không chặn production customer site.

---

## Phương pháp audit

- Đọc mã nguồn frontend (`apps/web/`) và endpoint backend liên quan (`src/modules/order/`, `GlobalExceptionFilter`)
- Đối chiếu với test audit backend (`order.audit.spec.ts`)
- Chạy `npm run build` trong `apps/web/`
- Quét bundle production: không có `console.log`, không lộ secret server-side

---

## CHECK 1: Checkout integrity — **PASS**

### Yêu cầu

- Giá hiển thị trên frontend chỉ để **hiển thị**
- Giá thực tế lấy từ **backend price snapshot** khi tạo đơn

### Bằng chứng

| Layer | Hành vi |
|-------|---------|
| Frontend checkout | `lineTotal = variant.sellPrice × quantity` — chỉ render UI (`CheckoutPageClient.tsx`) |
| Payload tạo đơn | Chỉ gửi `{ variantId, quantity }` + `guestEmail` — **không** gửi giá (`CreateOrderDto`, `orderApi.create`) |
| Backend | `resolveLineItems()` gọi `pricingService.getCustomerPrice()` → snapshot `unitPrice` / `totalAmount` vào DB |

Backend và catalog API cùng nguồn `variant.sellPrice` (`PricingService.getCustomerPrice`).

### Sau khi tạo đơn

- `/checkout/success` và `/order/[code]` hiển thị `order.totalAmount` từ backend (`OrderStatusPanel`)
- Trang checkout **trước** khi bấm thanh toán vẫn hiển thị ước tính từ catalog — chấp nhận được vì backend là nguồn sự thật

### Ghi chú (không critical)

- Nếu admin đổi giá **giữa** lúc user mở trang và bấm checkout, UI có thể lệch vài giây so với giá snapshot thực tế. Khuyến nghị phase sau: sau `orderApi.create`, hiển thị `order.totalAmount` từ response.

---

## CHECK 2: Guest security — **PASS**

### Kịch bản: chỉ biết `order_code`

| Endpoint / UI | Kết quả |
|---------------|---------|
| `GET /orders/lookup?orderCode=X` (thiếu email) | Validation 400 (`GuestOrderLookupDto` bắt buộc `@IsEmail`) |
| `GET /orders/lookup/cards?orderCode=X` | Tương tự — cần email |
| `GET /orders/lookup` với email sai | `404 Order not found` — không lộ đơn tồn tại |
| `/order/[code]` không có `?email=` | Chỉ hiện form nhập email — **không** load đơn hay thẻ |

Repository `findByCodeForGuest` filter: `orderCode` + `guestEmail` (case-insensitive) + `isGuestOrder: true`.

Không có route public nào trả đơn/thẻ chỉ với `orderCode`.

---

## CHECK 3: Card reveal security — **PASS**

### Điều kiện hiển thị PIN

`paymentStatus === PAID` **AND** `fulfillmentStatus === COMPLETED`

| Layer | Enforcement |
|-------|-------------|
| Frontend UI | `canRevealCards()` trong `lib/utils.ts`; `OrderDetailClient` chỉ gọi API cards khi pass |
| Backend | `buildDeliveredCardsResponse()` → `403 ForbiddenException` nếu chưa đủ điều kiện |
| UI PIN | Mặc định ẩn (`••••••••`), toggle Hiện/Ẩn |

Gọi trực tiếp API cards khi chưa PAID+COMPLETED → backend từ chối, frontend không render panel.

---

## CHECK 4: Multi-tab checkout — **PASS**

- `useOrderPolling(orderCode, email, enabled)` — state cục bộ theo component instance
- Mỗi tab có URL riêng (`orderCode`, `email` trong query) → polling độc lập
- Không dùng global store / sessionStorage cho trạng thái đơn
- Cleanup `clearInterval` + flag `active` khi unmount — không leak timer

Không phát hiện shared state corruption giữa nhiều đơn trên nhiều tab.

### Ghi chú (không critical)

- User **đã đăng nhập** trên `/order/[code]` không polling — chỉ fetch một lần qua `orderApi.list()` + `getById()`. Không ảnh hưởng guest checkout / multi-tab guest.

---

## CHECK 5: Token handling — **PASS**

| Hạng mục | Triển khai |
|----------|------------|
| Lưu trữ | `localStorage`: `cardon_access_token`, `cardon_refresh_token`, `cardon_user` |
| Refresh | `apiRequest` retry 401 → `POST /auth/refresh` → cập nhật session |
| Refresh fail | `clearAuthSession()` |
| Logout | `clearAuthSession()` + `setUser(null)` (`useAuth`) |
| Leak trong bundle | Chỉ tên key storage; **không** embed JWT/secret thật |
| Console | **0** `console.log/warn/error` trong source `apps/web/{app,components,hooks,lib,services}` |

### Ghi chú bảo mật (accepted risk)

- JWT trong `localStorage` dễ bị đọc nếu XSS. Phase hiện tại chấp nhận cho SPA B2C; phase sau cân nhắc httpOnly cookie nếu threat model yêu cầu.

---

## CHECK 6: Payment UX — **PASS** (minor UX gaps)

| Luồng | Trạng thái UI |
|-------|---------------|
| **MegaPay** | `window.location.href = pay.paymentUrl` sau tạo payment |
| **SePay QR** | `SepayQrDisplay` — image QR + fallback link; nút chuyển sang `/checkout/success` |
| **Chờ thanh toán** | Badge `WAITING_PAYMENT` (warning) + polling 5s trên success/order |
| **Hết hạn** | Badge `EXPIRED` (danger) qua `paymentStatusLabel` |
| **Thất bại** | Badge `FAILED` (danger) |

Trạng thái thanh toán phản ánh đúng qua `OrderStatusPanel`. Chưa có banner riêng cho EXPIRED/FAILED (chỉ badge) — đủ cho audit correctness, cải thiện UX ở phase sau.

### Ghi chú MegaPay

- Redirect rời site; user cần quay lại `/order/[code]?email=...` thủ công hoặc qua return URL cổng (nếu cấu hình backend). Không phải lỗi bảo mật.

---

## CHECK 7: Mobile responsive — **PASS** (partial nav)

| Trang | Responsive |
|-------|------------|
| Homepage | `Hero`: `text-4xl md:text-5xl`, `flex-wrap` CTA |
| Product | `grid gap-8 lg:grid-cols-2` |
| Checkout | `max-w-2xl`, form full-width |
| Order lookup | `max-w-md` / `max-w-2xl`, form stack |

Layout dùng Tailwind breakpoints (`sm:`, `md:`, `lg:`) nhất quán.

### Ghi chú (không critical)

- Header ẩn nav links trên mobile (`hidden md:flex`) — chưa có menu hamburger. User vẫn vào catalog qua CTA homepage/footer.

---

## CHECK 8: SEO — **PASS** (partial dynamic product)

`lib/seo.ts` cung cấp cho mọi trang chính:

- `title`, `description`
- `alternates.canonical`
- `openGraph` (type, locale `vi_VN`, url, siteName, title, description)
- `twitter.card`

| Trang | Metadata |
|-------|----------|
| `/`, `/cards`, `/checkout`, `/login`, … | Static `buildMetadata()` |
| `/product/[slug]` | `generateMetadata` — title từ slug, **chưa** fetch tên/mô tả sản phẩm thật từ API |

Canonical/OG có trên HTML build (ví dụ homepage trong `.next/server/app/index.html`).

Khuyến nghị phase sau: server-side fetch product cho OG title/description động.

---

## CHECK 9: Error handling — **PASS**

| Nguồn lỗi | Frontend | Backend response |
|-----------|----------|------------------|
| Provider / payment pending | Message từ `ApiClientError.message` | Structured `{ success: false, error: { code, message } }` |
| Network fail | `"Không tải được..."` / `"Yêu cầu thất bại"` | — |
| 500 internal | Generic message | `"Internal server error"` — **không** stack trace |
| Prisma / validation | Safe messages | Không lộ SQL/schema |

`GlobalExceptionFilter` chỉ log stack server-side; client không nhận stack.

Frontend không render raw exception object hay `error.stack`.

---

## CHECK 10: Build production — **PASS**

```bash
cd apps/web && npm run build
# Next.js 15.5.19 — Compiled successfully — 8 routes — EXIT 0
```

| Kiểm tra | Kết quả |
|----------|---------|
| Build lỗi TypeScript/lint | Không |
| `console.*` trong source app | Không |
| Secret server (JWT_SECRET, DATABASE_URL, …) trong client chunks | Không |
| Env leakage | Chỉ `NEXT_PUBLIC_*` defaults (`getApiBaseUrl`, `getSiteUrl`) — public config |

---

## Critical issues & fixes

| ID | Mô tả | Mức | Hành động |
|----|-------|-----|-----------|
| — | Không phát hiện lỗi critical | — | **Không sửa code** |

---

## Recommendations (non-blocking)

1. **Checkout:** Hiển thị `order.totalAmount` từ response sau tạo đơn (tránh lệch giá khi catalog đổi).
2. **MegaPay:** Trang return hoặc redirect tự động về `/checkout/success?orderCode&email` sau thanh toán.
3. **Auth order page:** Bật polling cho user đăng nhập (parity với guest).
4. **Mobile nav:** Hamburger menu cho `/cards`, nạp tiền.
5. **SEO product:** Fetch metadata sản phẩm server-side cho OG/title chính xác.
6. **Payment UX:** Banner hướng dẫn khi `EXPIRED` / `FAILED` (tạo đơn mới, liên hệ hỗ trợ).

---

## Kết luận

Phase **5A.1 Customer Website Audit: PASS**.

Website khách hàng sẵn sàng cho production với:

- Giá do backend snapshot, frontend không tin cậy giá client
- Guest không xem được đơn/thẻ chỉ với mã đơn
- PIN gated PAID + COMPLETED (frontend + backend)
- Token lifecycle an toàn cơ bản, không lộ secret trong build
- Error handling an toàn

**Dừng tại audit.** Không triển khai Agent Portal / Admin UI.

---

## Previous phases

| Phase | Status |
|-------|--------|
| Customer Website (5A) | PASS |
| Backend Production | PASS |
