# Phase 5C.3 — Admin CMS Permission Audit

**Ngày:** 2026-06-18  
**Phạm vi:** Audit only — không thêm tính năng, không đổi business logic  
**Trạng thại tổng thể:** PASS (có ghi chú / khuyến nghị)

---

## CHECK 1 — `npm run build:admin`

### Kết quả: PASS (sau sửa lỗi build)

**Lệnh:** `npm run build --workspace=@cardon/admin` (Next.js 15.5.19)

**Lỗi ban đầu:**

```
components/marketing/CmsPageManager.tsx:56:7
Type error: Type '"DRAFT" | "PUBLISHED"' is not assignable to type '"DRAFT"'.
```

**Sửa (build-only):** `emptyForm.status` typed as `'DRAFT' | 'PUBLISHED'` thay vì `as const` thu hẹp chỉ `DRAFT`.

**Build sau sửa:** 17 routes static, compiled + typecheck OK.

> **Ghi chú môi trường:** Build chạy qua Docker `node:20-alpine` với `npm install` trong `apps/admin` (lockfile root chưa sync workspace admin).

---

## CHECK 2 — Marketing & role permissions

Nguồn sự thật: `prisma/seed.mjs` → `ROLE_PERMISSION_MATRIX`  
Frontend gate: `apps/admin/lib/permissions.ts` (nav) + `RequirePermission` (từng trang)  
Backend gate: `@Permissions()` + `PermissionsGuard` trên controller

### Ma trận seed (admin-relevant)

| Permission | SUPPORT | MARKETING | ACCOUNTANT | ADMIN | SUPER_ADMIN |
|------------|---------|-----------|------------|-------|-------------|
| `cms.manage` | — | ✅ | — | ✅ | ✅ |
| `orders.read` | ✅ | — | ✅ | ✅ | ✅ |
| `payments.view` | ✅ | — | ✅ | ✅ | ✅ |
| `payments.review` | — | — | ✅ | ✅ | ✅ |
| `finance.view` | — | — | ✅ | ✅ | ✅ |
| `products.manage` | — | — | — | ✅ | ✅ |
| `agents.credit` | — | — | ✅ | ✅ | ✅ |
| `users.read` | ✅ | — | ✅ | ✅ | ✅ |
| `agents.kyc.review` | ✅ | — | — | ✅ | ✅ |
| `admin.dashboard` | — | — | — | ✅ | ✅ |

### So sánh với kỳ vọng

#### MARKETING — PASS

| Kỳ vọng | Thực tế |
|---------|---------|
| ✅ articles, pages, banners, seo | Chỉ có `cms.manage`; toàn bộ `/admin/cms/*` và UI Marketing gated bằng permission này |
| ❌ finance | Không có `finance.view` → nav `/finance` ẩn, API `/admin/finance/*` 403 |
| ❌ payments | Không có `payments.view` / `payments.review` → nav `/payments` ẩn, API payments 403 |
| ❌ agent balance / credit | Không có `agents.credit` / `ledger.view`; `POST /admin/agents/:id/credit` yêu cầu role ADMIN/ACCOUNTANT/SUPER_ADMIN + `agents.credit` |

#### SUPPORT — PASS (minor UX note)

| Kỳ vọng | Thực tế |
|---------|---------|
| ✅ orders | `orders.read`, `orders.retry` — nav + API OK |
| ✅ customers / support | Không có module “Customers” riêng; proxy qua **Đại lý** (`users.read`) + KYC (`agents.kyc.review`) + retry đơn |
| ❌ seo settings | Không có `cms.manage` |
| ❌ finance | Không có `finance.view` |

**Ghi chú UX (không chặn PASS):** Nav **Thanh toán** yêu cầu `payments.review`, trong khi SUPPORT chỉ có `payments.view`. Trang `/payments` có section list gated `payments.view`, nhưng SUPPORT **không thấy menu** Thanh toán. Backend vẫn enforce đúng; đây là gap hiển thị nav, không phải lỗ hổng quyền.

#### ACCOUNTANT — PASS

| Kỳ vọng | Thực tế |
|---------|---------|
| ✅ finance, payments | `finance.view`, `finance.manage`, `payments.view`, `payments.review` |
| ❌ seo | Không `cms.manage` |
| ❌ products | Không `products.manage` |

#### ADMIN / SUPER_ADMIN — PASS

- ADMIN: full matrix trong seed (dashboard, CMS, catalog, finance, agents, audit, …)
- SUPER_ADMIN: tất cả permission codes

### Backend CMS endpoints (tất cả `@Permissions('cms.manage')`)

```
GET/POST  /admin/cms/pages
GET/PATCH /admin/cms/pages/:id
POST      /admin/cms/pages/:id/publish
GET/POST  /admin/cms/banners
PATCH     /admin/cms/banners/:id
POST      /admin/cms/banners/:id/disable
GET/PUT   /admin/cms/seo-settings
```

MARKETING ✅ | SUPPORT ❌ | ACCOUNTANT ❌ | ADMIN ✅

---

## CHECK 3 — CMS security

### Article editor — script injection

| Lớp | Đánh giá |
|-----|----------|
| Admin UI | Nội dung nhập qua `<Textarea>` — React escape, **không** `dangerouslySetInnerHTML` trong admin |
| API / DB | `content` lưu raw string; **không** có sanitize/strip HTML server-side trong `CmsService` |
| DTO | `CreateCmsPageDto.content` — `@MinLength(1)` only, **không** `@MaxLength` |

**Kết luận:** Admin panel an toàn khi hiển thị. Rủi ro XSS **khi render public** nếu storefront hiển thị HTML thô — nằm ngoài phạm vi admin build; **khuyến nghị** (không implement trong phase này): sanitize khi publish hoặc escape khi render web.

### SEO fields — length validation

| Field | MaxLength (DTO) | PASS |
|-------|-----------------|------|
| `siteTitle` | 128 | ✅ |
| `metaDescription` | 256 | ✅ |
| `googleAnalyticsId` | 64 | ✅ |
| `googleTagManagerId` | 64 | ✅ |
| `searchConsoleVerification` | 256 | ✅ |
| `sitemapBaseUrl` / `ogImageUrl` | 512 | ✅ |
| Page SEO `metaTitle` | 128 | ✅ |
| Page SEO `metaDescription` | 256 | ✅ |

ValidationPipe global (NestJS) áp dụng khi gọi API.

### robots.txt — safe editing

| Kiểm tra | Kết quả |
|----------|---------|
| Lưu trữ | System setting key `cms.seo.robots_txt` — plain text |
| MaxLength DTO | **Không** có `@MaxLength` trên `robotsTxt` — có thể gửi payload rất lớn |
| Injection đặc biệt | Không execute code; chỉ ảnh hưởng file robots khi public serve |
| Admin UI | Textarea monospace — không eval |

**Kết luận:** Chấp nhận được cho admin nội bộ; **khuyến nghị** thêm `@MaxLength(8192)` hoặc tương đương (future phase, không làm trong 5C.3).

---

## CHECK 4 — Product delete UX

### Delete = soft delete only — PASS

**UI:** Nút **Xóa** → `productAdminApi.disableProduct/Category/Variant` → `POST .../disable`

**Backend** (`ProductRepository.softDelete`):

```typescript
status: INACTIVE,
deletedAt: new Date(),
```

Không hard delete; không ảnh hưởng `OrderItem` FK (`onDelete: Restrict`).

### Restore — PASS

- UI: **Khôi phục** khi `status !== ACTIVE`
- API: `POST .../restore` → `status: ACTIVE`, `deletedAt: null`

### Order snapshot sau khi xóa sản phẩm — PASS

- `OrderItem.unitPrice`, `totalAmount` snapshotted lúc tạo đơn (`ORDER_IMMUTABILITY_RULES.snapshottedAtCreation`)
- Test documented: `order.audit.spec.ts` — giá đơn cũ không đổi khi pricing thay đổi sau
- `OrderItem.variantId` giữ reference; variant/product inactive vẫn đọc được qua admin order detail (Restrict, không cascade delete)

---

## Tóm tắt findings

| # | Mức | Mô tả | Hành động 5C.3 |
|---|-----|-------|----------------|
| 1 | Fixed | TS build error `CmsPageManager` status type | ✅ Đã sửa |
| 2 | Info | SUPPORT có `payments.view` nhưng nav cần `payments.review` | Ghi nhận — không sửa (audit only) |
| 3 | Info | CMS `content` không sanitize server-side | Ghi nhận — public render cần escape/sanitize |
| 4 | Low | `robotsTxt` không MaxLength | Ghi nhận — khuyến nghị phase sau |
| 5 | Info | Không có module “Customers” riêng; SUPPORT dùng agents/orders | Phù hợp kiến trúc hiện tại |

---

## Files tham chiếu audit

```
prisma/seed.mjs                          — ROLE_PERMISSION_MATRIX
apps/admin/lib/permissions.ts            — NAV_ITEMS + canAccessNavItem
src/modules/cms/controllers/cms-admin.controller.ts
src/modules/cms/dto/cms.dto.ts
src/modules/product/repositories/product.repository.ts
src/modules/order/entities/order-idempotency.rules.ts
apps/admin/components/marketing/CmsPageManager.tsx  — build fix
```

---

## Kết luận

**Phase 5C.3 HOÀN THÀNH.**

- ✅ Build admin pass
- ✅ Permission matrix khớp kỳ vọng (backend enforce đúng)
- ✅ CMS security: SEO length OK; content/robots có ghi chú khuyến nghị
- ✅ Product soft delete + restore + order snapshot verified

**Không deploy.** Dừng sau audit.
