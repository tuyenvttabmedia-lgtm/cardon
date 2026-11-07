# Phase 2 — CMS translation data model và Public API theo locale

Ngày: 2026-11-05. Phạm vi dừng ở dữ liệu dịch và luồng đọc public. Chưa có Admin editor, chưa có bản tiếng Anh, chưa chạy migration production.

## 1. Schema trước và sau

Trước phase này, nội dung CMS nằm trên cột gốc:

| Model | Bảng | Nội dung chữ | Không có |
| --- | --- | --- | --- |
| `CmsPage` | `cms_pages` | `title`, `excerpt`, `content`, `status` | locale |
| `CmsSeo` | `cms_seo` | meta, OG, `canonical_url`, `robots`, `structured_data`, `og_image` | locale |
| `CmsCategory` | `cms_categories` | `name`, `description`, `intro`, meta | locale |
| `CmsTag` | `cms_tags` | `name`, meta | locale |

Slug và quan hệ (`category_id`, `cms_page_tags`) giữ nguyên. FAQ và banner không đổi.

Sau phase này, bốn bảng bản sao được thêm cạnh bảng gốc. Cột gốc không bị đổi tên, không bị xóa, không bị `UPDATE` trong migration.

## 2. Migration và bảng

Migration: `prisma/migrations/20261105120000_cms_content_translations/migration.sql`

Enum: `CmsContentLocale` = `vi | en`. Trạng thái bản dịch trang dùng lại `CmsPageStatus`.

| Bảng | Khóa | Hành vi |
| --- | --- | --- |
| `cms_page_translations` | unique `(page_id, locale)`, index `(page_id, locale, status)` | FK `cms_pages.id` `ON DELETE CASCADE` |
| `cms_seo_translations` | unique `(page_id, locale)`, index `(page_id, locale)` | chỉ các trường chữ: meta, focus, OG title/description, canonical. Không có `og_image`, `robots`, `structured_data` |
| `cms_category_translations` | unique `(category_id, locale)` | name, description, intro, meta, canonical. Không có `og_image_url` |
| `cms_tag_translations` | unique `(tag_id, locale)` | name, meta title, meta description |

`CREATE TABLE IF NOT EXISTS`, constraint bọc `duplicate_object`, index `IF NOT EXISTS`, backfill `ON CONFLICT DO NOTHING`.

Đã áp migration này trên Postgres local Docker `cardon-local-full-postgres` (`127.0.0.1:5433`, database `cardon`). Đây là migration pending duy nhất. Không chạy trên production. File `.env` trỏ `localhost:5432` không được dùng vì đó không phải database CardOn.

## 3. Số bản ghi backfill

Đếm trên database local sau migration, và sau khi chạy lại đúng file SQL:

| Nguồn gốc | Bản `vi` | Bản `en` |
| --- | ---: | ---: |
| 106 `cms_pages` | 106 | 0 |
| 106 `cms_seo` | 106 | 0 |
| 5 `cms_categories` | 5 | 0 |
| 123 `cms_tags` | 123 | 0 |

Lần chạy lại: `INSERT 0 0` cho cả bốn bảng. So khớp `vi` với cột gốc: 0 page lệch title/content/status, 0 SEO lệch meta title/description. Không có dòng `en`.

## 4. Nguồn đọc và fallback

Không có đồng bộ hai chiều. Admin vẫn ghi vào cột gốc. Luồng public có `locale` không ghi gì.

| Query | Nguồn thân bài | `contentLocale` | `fallback` |
| --- | --- | --- | --- |
| Không có `locale` | Cột gốc, đúng response cũ. Không thêm field locale | không có | không có |
| `locale=vi`, bản `vi` `PUBLISHED` | Bảng dịch | `vi` | `false` |
| `locale=vi`, thiếu bản `vi` hoặc bản `vi` không `PUBLISHED` | Cột gốc | `vi` | `true` |
| `locale=en`, bản `en` `PUBLISHED` | Chỉ bản `en` cho title, excerpt, content | `en` | `false` |
| `locale=en`, bản `en` `DRAFT`/`ARCHIVED` hoặc không có | Bản `vi` đã xuất bản, nếu không có thì cột gốc | `vi` | `true` |

SEO khi nội dung là tiếng Việt: trường chữ lấy bản dịch `vi` nếu có giá trị, ô trống giữ SEO gốc. `og_image`, `robots`, `structured_data` luôn lấy từ `cms_seo`.

SEO khi nội dung là tiếng Anh: không chép meta/OG tiếng Việt vào bài Anh. Ô chữ trống dùng title/excerpt tiếng Anh cho meta title, meta description, OG title, OG description. Keyword để trống. `canonical_url` luôn giữ bản gốc, cả trang lẫn chuyên mục, để canonical không đổi trong phase này.

Chuyên mục và tag không có trạng thái xuất bản. Có dòng `en` thì dùng chữ của dòng đó; không có thì cả thực thể giữ tiếng Việt và `fallback: true`. Slug không đổi. Tên tag/chuyên mục tiếng Việt trên một bài Anh đã xuất bản không kéo `fallback` của bài về `true`.

Hệ quả đã chốt: sau backfill, storefront gửi `locale` nên đọc bản `vi`, không đọc cột gốc. Sửa bài trong Admin hiện tại chưa xuất hiện trên storefront cho đến Phase 3, khi bản `vi` được cập nhật. Sitemap và SEO toàn cục không gửi `locale`, nên vẫn đọc cột gốc.

## 5. API đã nhận locale

Query `locale=vi|en` trên:

- `GET /cms/pages/nav`
- `GET /cms/pages/:slug`
- `GET /cms/blog/posts`
- `GET /cms/blog/posts/:slug`
- `GET /cms/blog/categories`
- `GET /cms/blog/categories/:slug`

Khi có `locale`, response thêm `requestedLocale`, `contentLocale`, `fallback`. Giá trị lạ bị `ValidationPipe` từ chối. Không đổi quyền, không đổi lọc `PUBLISHED`, không locale hóa SEO settings, theme, site config, banner, FAQ, hay POST đếm view. Admin không tạo, sửa, xóa bản dịch.

## 6. Storefront đã gửi locale

Locale lấy từ header `x-cardon-locale` qua `readRequestLocale()`. `apps/web/lib/cms-api.ts` chỉ gắn `locale` khi caller truyền vào. Cache key của `fetch` nằm trên full URL nên có query này.

Đã truyền locale ở: trang tĩnh và liên hệ (`cms-static-page.tsx`), bài viết, danh sách tin, chuyên mục, slug gốc, redirect blog, trang chủ, thẻ game, thẻ điện thoại, hướng dẫn, khuyến mãi.

Không truyền locale ở: `sitemap.ts`, `robots.txt`, `layout.tsx` (`getGlobalSeoSettings`, `getThemeSettings`). Middleware, `LanguageSwitcher`, canonical helper và hreflang không đổi.

Khi `locale=en` và `fallback !== false`, trang tĩnh, liên hệ, bài viết, danh sách và khối tin trang chủ hiện câu `common.untranslated`. Thân bài vẫn nguyên một ngôn ngữ. CTA cứng "Mua thẻ ngay" / "Liên hệ chúng tôi" trên giới thiệu giữ nguyên.

## 7. Test và build

- `npx jest src/modules/cms/entities/cms-locale.spec.ts`: 7 tests passed. Bao gồm response cũ, bản `vi`, thiếu bản `vi`, bản `en` published, bản `en` draft, thiếu bản `en`, chuyên mục và canonical.
- `npx tsc --noEmit -p tsconfig.json`: passed.
- `npx tsc --noEmit -p apps/web/tsconfig.json`: passed.
- Migration local: số liệu mục 3, index unique và index tra cứu đã có trên cả bốn bảng.
- Storefront dev `http://localhost:3001`: `/gioi-thieu` tiếng Việt nguyên bài, không banner. `/en/gioi-thieu` giữ nguyên thân tiếng Việt và hiện banner chưa có bản Anh. `/the-game` tiếng Việt. `/en/the-game` chrome tiếng Anh, không có bài Anh để trộn.
- Dev server này proxy `/api/v1` nội bộ và nhận 404, nên danh sách tin trên `/the-game` trống cả trước lẫn sau thay đổi. Container API local chưa được build lại, nên chưa gọi HTTP locale vào API đang chạy.

## 8. Việc còn tồn tại

- Chưa có bản tiếng Anh. Mọi `/en` CMS đang fallback.
- Admin sửa cột gốc không cập nhật bản `vi`. Storefront locale-aware tiếp tục hiện bản backfill cho đến Phase 3.
- Tên chuyên mục hoặc tag có thể còn tiếng Việt trên một bài Anh đã xuất bản. Đây không được tính là trộn thân bài.
- Sitemap vẫn đọc cột gốc. Sau khi Admin sửa bài, sitemap và storefront có thể lệch cho đến Phase 3.
- API đang chạy trong Docker local là image cũ. Storefront mới phải lên cùng API mới. API cũ từ chối query `locale` và storefront sẽ nhận nội dung rỗng, không tự gọi lại không locale.
- Chưa rebuild image API/web local và chưa đụng production.

## 9. Rollback

Cột gốc còn nguyên và khớp bản `vi` tại thời điểm backfill trên DB local. Rollback code là revert commit này. Rollback schema trên môi trường đã migrate:

```sql
DROP TABLE IF EXISTS cms_page_translations;
DROP TABLE IF EXISTS cms_seo_translations;
DROP TABLE IF EXISTS cms_category_translations;
DROP TABLE IF EXISTS cms_tag_translations;
DROP TYPE IF EXISTS "CmsContentLocale";
```

Không cần hoàn nguyên dữ liệu `cms_pages`, `cms_seo`, `cms_categories`, `cms_tags`. Xóa bản ghi migration `20261105120000_cms_content_translations` nếu Prisma history cần khớp. Production chưa có bảng này.

## 10. Ngoài phạm vi, đã không làm

- Không có tab English, không có API admin tạo/sửa/xóa bản dịch.
- Không dịch máy, không seed nội dung Anh.
- Không bảng FAQ, không bảng banner.
- Không đổi slug, middleware, `LanguageSwitcher`.
- Không đổi canonical, hreflang, sitemap, metadata toàn cục.
- Không đụng thanh toán, đơn hàng, eSIM, đại lý, wallet, API đối tác.
- Không chạy migration production.

Dừng tại đây để nghiệm thu. Chưa sang Phase 3.
