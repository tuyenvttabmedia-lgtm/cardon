# Phase 5C.2 — Admin UX + CMS SEO — Báo cáo hoàn thành

**Ngày:** 2026-06-18  
**Trạng thái:** HOÀN THÀNH (code)  
**Phạm vi:** Admin panel (`apps/admin`) + module CMS backend (`src/modules/cms`)  
**Không thay đổi:** logic payment / order / agent business

---

## Tóm tắt

Phase 5C.2 nâng cấp trải nghiệm quản trị viên tiếng Việt, thêm module Marketing/CMS đầy đủ, cải thiện UX catalog sản phẩm (soft delete, khôi phục, form tách tab), và API SEO settings.

---

## TASK 1 — Việt hóa Admin UI

| Hạng mục | Trạng thái |
|----------|------------|
| Menu sidebar | ✅ `lib/permissions.ts` + `lib/i18n/vi.ts` |
| Nút / hành động | ✅ `vi.app.*` (Lưu, Xóa, Khôi phục, Lọc, …) |
| Trạng thái enum | ✅ `Badge status={...}` + `translateStatus()` — backend giữ English |
| Thông báo lỗi | ✅ Dùng `vi.*.loadError`, `vi.app.requestFailed` |
| Bảng / tiêu đề cột | ✅ Tất cả pages admin |

**Files i18n:**
- `apps/admin/lib/i18n/vi.ts` — chuỗi tiếng Việt đầy đủ
- `apps/admin/lib/i18n/index.ts` — `translateStatus()`, `translateRole()`, `t()`

**Pages đã Việt hóa:** dashboard, orders, payments, products, agents, providers, finance, audit, login, marketing/*

---

## TASK 2 — CMS module UI (Marketing)

Menu **Marketing** với 4 trang con:

| Route | Chức năng |
|-------|-----------|
| `/marketing/articles` | Quản lý bài viết (`BLOG_POST`) |
| `/marketing/pages` | Quản lý trang tĩnh (`PAGE`) |
| `/marketing/banners` | Quản lý banner |
| `/marketing/seo` | Cài đặt SEO toàn site |

**Components:**
- `components/marketing/MarketingNav.tsx`
- `components/marketing/CmsPageManager.tsx`

**Permission:** `cms.manage`

---

## TASK 3 — SEO Settings

Trang `/marketing/seo` hỗ trợ:

- Tiêu đề website (`siteTitle`)
- Meta description mặc định
- Google Analytics ID
- Google Tag Manager ID
- Mã xác minh Search Console
- Trình soạn `robots.txt`
- Bật/tắt sitemap + URL gốc sitemap
- Ảnh OpenGraph mặc định

**API:** `GET/PUT /admin/cms/seo-settings`

---

## TASK 4 — Article Manager (CRUD)

`CmsPageManager` hỗ trợ đầy đủ:

| Field | Ghi chú |
|-------|---------|
| title | Tiêu đề |
| slug | Đường dẫn |
| content | Nội dung (textarea) |
| thumbnail | `featuredImage` URL |
| category | Chỉ bài viết |
| tags | Mảng, nhập cách nhau bởi dấu phẩy |
| SEO title / description | `metaTitle`, `metaDescription` |
| status | `DRAFT` / `PUBLISHED` |

**API:** `GET/POST /admin/cms/pages`, `PATCH /:id`, `POST /:id/publish`

---

## TASK 5 — Product UX

| Yêu cầu | Triển khai |
|---------|------------|
| "Disable" → "Xóa" | UI dùng `vi.app.delete`; backend vẫn `POST .../disable` (soft delete) |
| Khôi phục | Nút **Khôi phục** + `POST .../restore` (product, category, variant) |
| Lọc inactive | `statusFilter=active\|inactive\|all` trên `GET /admin/products` |

---

## TASK 6 — Product Form (tách tab)

Trang `/products` có 3 tab:

1. **Sản phẩm** — danh mục, danh sách SP, filter trạng thái, tạo/xóa/khôi phục
2. **Biến thể (mệnh giá)** — SKU, loại CARD/TOPUP, mệnh giá, giá bán
3. **Liên kết nhà cung cấp** — chọn provider, mã SP provider, giá vốn, ưu tiên

Form có mô tả ngắn hướng dẫn admin không kỹ thuật.

---

## TASK 7 — Build

**Script:** `npm run build:admin` → `npm run build --workspace=@cardon/admin`

**Ghi chú môi trường agent:** Node.js không có sẵn trong shell agent tại thời điểm báo cáo (`where node` → not found). Cần chạy build trên máy dev:

```powershell
cd C:\Users\MyHome\Projects\cardon
npm run build:admin
```

**Lint IDE:** Không phát hiện lỗi linter trên `apps/admin`.

---

## Backend (catalog + CMS only)

### CMS module mới
- `src/modules/cms/` — controller, service, repository, DTO
- Migration: `prisma/migrations/20250619120000_cms_page_category_tags/migration.sql`
- Schema: `CmsPage.category`, `CmsPage.tags` (Json)

### Product admin (không đụng order/payment/agent logic)
- `ListAdminProductsQueryDto.statusFilter`
- `product.repository.findManyAdmin(filter)` + `restore()`
- Endpoints restore: product, category, variant

---

## File chính đã thêm/sửa

### Frontend
```
apps/admin/lib/i18n/vi.ts
apps/admin/lib/i18n/index.ts
apps/admin/lib/permissions.ts
apps/admin/components/ui/Form.tsx          (+ Textarea)
apps/admin/components/ui/Display.tsx       (+ StatusLabel)
apps/admin/components/marketing/*
apps/admin/app/marketing/**/page.tsx
apps/admin/app/products/page.tsx           (refactor tabs)
apps/admin/app/{orders,payments,...}/page.tsx
apps/admin/services/api-client.ts          (+ cmsAdminApi, restore/filter)
apps/admin/types/api.ts                    (+ CmsPage, CmsSeoSettings, …)
```

### Backend
```
src/modules/cms/**
src/modules/product/**                     (restore + filter only)
prisma/schema.prisma
prisma/migrations/20250619120000_cms_page_category_tags/
```

---

## Kiểm tra thủ công đề xuất

1. Đăng nhập admin → xác nhận menu tiếng Việt
2. Marketing → tạo bài viết nháp → xuất bản
3. SEO → lưu GA/GTM/robots.txt
4. Sản phẩm → xóa SP → lọc "Đã xóa" → khôi phục
5. Biến thể → thêm mapping provider
6. `npm run build:admin` trên máy local

---

## Kết luận

Phase 5C.2 **HOÀN THÀNH** theo phạm vi yêu cầu. Không deploy. Không thay đổi logic nghiệp vụ payment/order/agent.
