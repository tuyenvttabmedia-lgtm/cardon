# Phase 6J — Admin Operation UX Fix

**Date:** 2026-06-21  
**Scope:** Sửa UX admin theo manual testing — **không** thay đổi payment flow, provider fulfillment, ledger, security core.

---

## Tóm tắt

| Task | Trạng thái |
|------|------------|
| 1. Hoàn thiện tiếng Việt admin | ✅ |
| 2. Sửa nút Làm mới Thanh toán | ✅ |
| 3. Reset mật khẩu / khóa khách hàng | ✅ |
| 4. UX quản lý sản phẩm (edit, hard delete) | ✅ |
| 5. CRUD danh mục sản phẩm | ✅ |
| 6. CMS Image Picker (MediaLibraryPicker) | ✅ |
| 7. Media Library hiển thị ảnh | ✅ |
| 8. Appearance / menu builder | ✅ |
| 9. UX quản lý đại lý | ✅ |
| 10. UX quản lý nhân sự | ✅ |
| 11. Polish (toast, loading, empty states) | ✅ |
| 12. Regression build/test | ✅ |

---

## TASK 1 — Tiếng Việt admin

- **`apps/admin/lib/i18n/vi.ts`**: bổ sung orders (tab, trace labels), customers, staff, agents, products, appearance, media, settings nav.
- **`apps/admin/app/orders/[id]/page.tsx`**: tab *Thanh toán / NCC / Giao thẻ / Nhật ký*, nút *Thử lại giao thẻ*, `Badge` với `status` prop.
- Nav settings: *Cổng thanh toán*, *Nhà cung cấp*, *Hệ thống*.

---

## TASK 2 — Thanh toán: Làm mới

- **`apps/admin/app/payments/page.tsx`**: nút *Làm mới* gọi `load()` (cả manual review + webhooks), loading state, toast success/error.

---

## TASK 3 — Quản lý khách hàng

**Backend** (`admin-customer.service.ts`):
- `POST /admin/customers/:id/reset-password` body `{ mode: 'link' | 'temp' }`
- `link`: trả `resetLink` (SMTP fail vẫn hiện link cho admin)
- `temp`: đặt mật khẩu tạm, trả `tempPassword`

**Frontend** (`customers/page.tsx`):
- Khóa / Mở khóa có confirm + toast
- Modal hiển thị link hoặc mật khẩu tạm sau reset

---

## TASK 4 & 5 — Sản phẩm & Danh mục

**Backend**:
- `ProductUsageService` — kiểm tra đơn hàng trước hard delete
- `DELETE /admin/products/categories/:id` — xóa vĩnh viễn nếu chưa dùng
- `DELETE /admin/products/:id`, `DELETE .../variants/:variantId`
- `PATCH` category/product/variant (đã có, UI mới dùng)

**Frontend** (`products/page.tsx`):
- Slugify tự động khi tạo danh mục/sản phẩm
- Modal **Sửa** category / product / variant
- Nút **Ngừng bán** (soft) vs **Xóa vĩnh viễn** (hard, khi chưa có đơn)
- Thông báo lỗi validation tiếng Việt

---

## TASK 6 — CMS Image Picker

- **`MediaImageField.tsx`**: preview + chọn từ thư viện + xóa — **không** input URL thủ công
- Áp dụng: bài viết, trang, banner, appearance (logo/favicon/OG), SEO

---

## TASK 7 — Media Library

- **`cms-media-storage.service.ts`**: lưu URL relative `/uploads/...` (không gắn `APP_PUBLIC_URL` sai host)
- **Nginx** `uploads-proxy.conf` trên localhost, admin, partner, cardon.vn
- Preview admin qua `mediaFullUrl()` + proxy `/uploads/` → API static

---

## TASK 8 — Appearance

- **`theme-normalize.ts`** (admin) + **`cms.service.ts`** (backend): chuẩn hóa menu thiếu `label`
- **`useThemeSettings.ts`** (web): lọc item invalid, fallback `DEFAULT_HEADER_MENU`

---

## TASK 9 — Đại lý

**Backend**:
- `POST /admin/agents/:id/reactivate`
- `PATCH /admin/agents/:id` — company, contact, rateLimit
- `DELETE /admin/agents/:id` — chỉ khi không có giao dịch

**Frontend**: suspend/reactivate, form sửa, xóa, hint quy trình đăng ký → KYC → credentials

---

## TASK 10 — Nhân sự

**Backend**:
- `POST /admin/staff/:id/enable`
- `DELETE /admin/staff/:id` — soft delete; không xóa self / SUPER_ADMIN

**Frontend**: vai trò tiếng Việt, enable/delete, toast

---

## TASK 11 — Visual polish

- **`ToastProvider`** toàn app admin (`layout.tsx`)
- Loading / empty states / toast trên payments, customers, products, agents, staff

---

## TASK 12 — Regression

| Lệnh | Kết quả |
|------|---------|
| `npm test` | **39/39 suites PASS** (384 tests) |
| `npm run build` | **PASS** |
| `npm run build:admin` | **PASS** |

---

## Files chính đã thay đổi

| Layer | Files |
|-------|-------|
| i18n/UI | `vi.ts`, `Toast.tsx`, `MediaImageField.tsx`, `theme-normalize.ts`, `slugify.ts` |
| Admin pages | `orders/[id]`, `payments`, `customers`, `products`, `agents`, `staff`, `appearance`, `banners`, `seo`, `CmsPageManager` |
| API client | `api-client.ts` |
| Backend admin | `admin-customer.service`, `admin-agent.service`, `admin-staff.service`, controllers |
| Backend product | `product-usage.service`, hard delete endpoints |
| Backend CMS | `cms-media-storage.service`, `cms.service` theme normalize |
| Infra | `infra/nginx/conf.d/snippets/uploads-proxy.conf`, nginx server blocks |
| Web | `useThemeSettings.ts` |

---

## Không thay đổi (theo yêu cầu)

- Payment flow / webhook / manual review logic
- Provider fulfillment / retry
- Ledger / agent credit
- JWT / RBAC / permission guards core

---

## Ghi chú triển khai

1. **Rebuild nginx** sau khi pull: `docker compose ... up -d --build nginx`
2. **Media cũ** có thể còn URL absolute — upload mới dùng path relative
3. Reset password khách: dùng mode `temp` trên local khi SMTP chưa cấu hình

**Verdict:** Admin operation UX **PASS** — sẵn sàng manual acceptance lần 2.
