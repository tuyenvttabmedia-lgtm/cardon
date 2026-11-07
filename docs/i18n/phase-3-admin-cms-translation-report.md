# Phase 3 — Admin CMS translation editor (VI/EN)

Ngày: 2026-11-05. Dừng để nghiệm thu. Không sang Phase 4. Không chạy migration production, không seed, không dịch máy.

## 1. Kiến trúc

Một `CmsPage`, category và tag vẫn là một bản ghi. Slug, ảnh, danh mục, tag và các thuộc tính dùng chung nằm ở bảng gốc. VI và EN là dòng `page_id + locale` (hoặc `category_id` / `tag_id` + locale). Không tạo slug `/en` trong database.

Phase 2 đã cho Public API có `locale` đọc bản dịch `vi` đã xuất bản, rồi mới fallback về cột gốc. Admin lúc đó chỉ ghi cột gốc, nên hai nguồn tiếng Việt có thể lệch.

Phase 3 giữ cột gốc và đồng bộ nguồn tiếng Việt trong cùng transaction với thao tác Admin:

- Lưu hoặc xuất bản trang, chuyên mục, tag tiếng Việt ghi cột gốc và upsert bản dịch `locale=vi`.
- Lưu tiếng Anh chỉ ghi dòng `locale=en`. Không đụng cột gốc và không đụng dòng `vi`.
- Public API Phase 2 không đổi quy tắc: bản EN `DRAFT` không ra ngoài; chưa có EN `PUBLISHED` thì fallback tiếng Việt và `fallback: true`.

## 2. File đã đổi

Backend:

- `src/modules/cms/repositories/cms.repository.ts`
- `src/modules/cms/services/cms.service.ts`
- `src/modules/cms/controllers/cms-admin.controller.ts`
- `src/modules/cms/dto/cms.dto.ts`
- `src/modules/cms/repositories/cms-translation.repository.spec.ts`
- `src/modules/cms/controllers/cms-admin.permissions.spec.ts`

Admin:

- `apps/admin/components/marketing/cms-editor/ProfessionalCmsManager.tsx`
- `apps/admin/components/marketing/cms-editor/EditorMetaSidebar.tsx`
- `apps/admin/app/marketing/categories/page.tsx`
- `apps/admin/app/marketing/tags/page.tsx`
- `apps/admin/services/api-client.ts`
- `apps/admin/types/api.ts`
- `apps/admin/lib/cms-translation.ts`
- `apps/admin/lib/cms-translation.test.ts`

Storefront không đổi trong phase này. Locale public vẫn là phần Phase 2.

## 3. API

Quyền vẫn là `cms.manage` trên cả controller. Route mới nằm trong guard đó.

| Method | Path | Việc làm |
| --- | --- | --- |
| `PUT` | `/admin/cms/pages/:id/translations/:locale` | `vi` gọi lại luồng sửa trang và mirror. `en` chỉ ghi bản dịch trang và SEO chữ. |
| `PUT` | `/admin/cms/categories/:id/translations/:locale` | `vi` cập nhật tên, giữ slug và các trường còn lại, rồi mirror. `en` chỉ ghi tên và mô tả. |
| `PUT` | `/admin/cms/tags/:id/translations/:locale` | `vi` cập nhật tên và mirror. `en` chỉ ghi tên, SEO title, SEO description. |

`GET/PATCH/POST` trang, chuyên mục, tag cũ giữ nguyên contract. `GET /admin/cms/categories` và danh sách trang admin kèm `translations` để editor đọc được cả hai ngôn ngữ. Public API không locale không nhận thêm field này.

Locale khác `vi|en` trả 400.

## 4. Schema và migration

Không có migration mới. Không thêm cột, không xóa cột gốc. Bảng Phase 2 được dùng lại:

- `cms_page_translations`, `cms_seo_translations`
- `cms_category_translations`, `cms_tag_translations`

Tag không có cột mô tả. Form tiếng Anh của tag dùng tên và hai trường SEO đã có, không tạo cột mới.

## 5. Đồng bộ tiếng Việt

Trong một `prisma.$transaction`:

1. Ghi `cms_pages` hoặc `cms_categories` hoặc `cms_tags`.
2. Nếu có SEO trang, ghi `cms_seo`.
3. Upsert bản dịch `locale=vi` từ đúng dòng vừa ghi.

Áp dụng cho tạo, sửa, xuất bản và cron xuất bản đúng giờ. Content automation đi qua `updatePage` nên cũng được mirror.

Bản `en` không nằm trong transaction đó. Sitemap và các luồng không gửi locale vẫn đọc cột gốc. Sau mỗi lần lưu tiếng Việt, cột gốc và bản `vi` cùng giá trị.

Nếu upsert bản dịch `vi` lỗi, callback transaction ném lỗi trước khi trả kết quả. Prisma rollback cả ghi cột gốc trong transaction đó. Test mô phỏng lỗi ở bước SEO và xác nhận hàm trả lỗi, không trả page đã commit.

## 6. Trạng thái VI/EN

Trang và bài viết:

- Trạng thái trang (`cms_pages.status`) và trạng thái bản `vi` được ghi cùng một giá trị.
- Trạng thái bản `en` riêng. Nút lưu nháp ghi `DRAFT`. Nút xuất bản ghi `PUBLISHED`. Lưu không tự chuyển `DRAFT` thành `PUBLISHED`.
- `EN=DRAFT` và trang đang `PUBLISHED`: public `locale=en` fallback tiếng Việt, `fallback: true`.
- Chỉ `EN=PUBLISHED` mới được public trả nội dung Anh.
- Trang gốc còn `DRAFT` thì public không trả trang, kể cả khi bản EN đã xuất bản.

Chuyên mục và tag không có cột trạng thái bản dịch từ Phase 2. Lưu tiếng Anh là public đọc được ngay nếu thực thể gốc đang được public dùng. UI nói rõ điều này. Không thêm migration chỉ để có nháp cho category/tag.

## 7. Test

`npx jest` các suite CMS liên quan: 16 passed.

- Mirror VI trang và SEO trong một transaction, không ghi `en`.
- Lỗi mirror SEO làm transaction thất bại.
- Ghi EN trang không gọi update page và không ghi dòng `vi`.
- Ghi EN category không update category gốc.
- Ghi EN tag không update tag gốc.
- Xuất bản lại vẫn giữ `publishedAt` cũ.
- Resolver Phase 2: draft EN không ra public, published EN ra public, thiếu EN thì fallback.
- Controller admin vẫn gắn quyền `cms.manage`, kể cả ba route dịch.

`npx vitest run lib/cms-translation.test.ts` trong admin: 3 passed.

- Nhãn Chưa có / Bản nháp / Đã xuất bản.
- Payload EN không có slug và không chứa nội dung Việt khi chỉ có dòng EN.
- Đọc page có cả hai locale thì draft EN không lấy title Việt.

Chưa gọi HTTP lên API Docker local vì image API chưa được build lại với code Phase 3. Không ghi bản tiếng Anh vào database local.

## 8. Typecheck và build

- `tsc --noEmit` API, admin, web: passed.
- `npm run build` admin: passed, 73 trang.
- `npm run build` web: passed, 55 trang.

Build production ghi đè `.next` đang được dev server dùng, nên cả hai cổng trả 500. Đã tắt process cũ và chạy lại `npm run dev`: storefront `http://localhost:3001`, admin `http://localhost:3003`.

## 9. Giao diện Admin

Editor bài viết và trang tĩnh (`ProfessionalCmsManager`) có tab Tiếng Việt và English.

- Tab Việt giữ form, sidebar, SEO và nút lưu/xuất bản cũ.
- Tab English có title, excerpt, content, SEO title, SEO description, SEO keywords, OG title, OG description.
- Sidebar slug, ảnh, danh mục, tag bị khóa khi đang ở English.
- Hai bản nằm ở state riêng. Đổi tab không xóa bản chưa lưu.
- Autosave 30 giây chỉ chạy ở tab Việt.
- Chưa có dòng EN thì hiện cảnh báo và không copy nội dung Việt.
- Phải lưu trang Việt trước khi lưu English.

Danh mục: tab Việt giữ form cũ. Tab English chỉ tên và mô tả. Tag: tab English là tên và hai trường SEO, vì tag không có mô tả.

Chưa chụp được màn editor. Trang admin local dừng ở “Đang tải...” vì chưa đăng nhập trong browser kiểm thử.

## 10. Việc còn lại và rủi ro

- API Docker local vẫn là image cũ. Admin mới gọi route translation sẽ 404 cho đến khi image API được build lại. Không build image và không deploy production trong phase này.
- Chuyên mục và tag tiếng Anh không có trạng thái nháp. Lưu là public có thể đọc.
- Bản EN của chuyên mục không dịch intro và meta. Public Phase 2 sẽ để trống các trường đó trên locale `en`, không chép tiếng Việt vào.
- Script hoặc seed ghi thẳng Prisma, không qua service, sẽ không mirror. Phase này không chạy seed.
- Chưa có nội dung tiếng Anh thật. `/en` vẫn fallback.
- Không làm FAQ, banner, theme, canonical, hreflang, sitemap, middleware, thanh toán, đơn hàng, eSIM.

Dừng tại Phase 3.
