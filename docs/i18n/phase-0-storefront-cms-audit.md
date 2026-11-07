# CARDON-I18N-PHASE-0 – Storefront và CMS

Audit chỉ đọc. Không có migration, không đổi database, routing, seed hay cấu hình production. Thanh toán, đơn hàng, eSIM và đại lý không nằm trong phạm vi sửa.

Ngày khảo sát: 2026-11-05. Locale đang có: `vi` (mặc định), `en` (tiền tố `/en`).

## 1. Kiến trúc i18n hiện tại

Có hai lớp tách nhau.

**Lớp giao diện.** Catalog tĩnh `apps/web/lib/i18n/messages.ts` (cộng `journey-messages.ts`, `final-messages.ts`, `customer-error.ts`). `translate(locale, key)` trả tiếng Anh khi `locale === 'en'`, thiếu key thì rơi về tiếng Việt. Locale lưu cookie `cardon_locale` một năm. `vi` không thêm tiền tố URL. `en` dùng `/en` và `/en/...`.

**Lớp nội dung.** CMS, theme, FAQ và phần lớn fallback tĩnh là một ngôn ngữ. Cột `title`, `content`, `excerpt`, SEO và nhãn menu/footer không có `locale`. API public không nhận locale. Storefront gọi các API đó dù khách đang ở `/en`.

Hệ quả: chrome (nút, một số mục menu theo `href`, metadata một số hub) đổi được sang tiếng Anh. Header tùy chỉnh, footer, trang giới thiệu, liên hệ, chính sách, tin tức, chuyên mục, tag và FAQ vẫn là bản đã xuất bản, hiện là tiếng Việt.

## 2. Luồng locale

```text
Trình duyệt
  GET /en/tin-tuc/huong-dan/bai-viet?q=1
        │
        ▼
middleware.ts
  localeRoutingDecision(pathname, cookie, method)
        │
        ├─ cookie=vi và path /en/*  → 302 về path không tiền tố, cookie=vi
        ├─ path /en/*                → rewrite nội bộ về path không tiền tố
        │                              header x-cardon-locale=en
        │                              header x-cardon-public-path=/en/...
        │                              cookie=en
        ├─ cookie=en và GET path vi  → 302 sang /en/... (giữ query)
        └─ còn lại                   → header x-cardon-locale=vi
        │
        ▼
Next.js route gốc (cùng page.tsx)
  Server Component đọc headers().get('x-cardon-locale')
  app/layout.tsx đặt <html lang> và LocaleProvider initialLocale
        │
        ├─ Client: useT() / LanguageSwitcher chỉ đọc catalog
        └─ CMS fetch: getCmsPage(slug), listBlogPosts(), getThemeSettings()
                      không gửi locale
        │
        ▼
GET /api/v1/cms/pages/:slug
GET /api/v1/cms/blog/posts/:slug
GET /api/v1/cms/theme
  CmsPublicController → CmsService → CmsRepository
  một bản ghi, không lọc locale
```

Quy tắc đã có trong `localeRoutingDecision`:

| Request | Kết quả |
|---|---|
| `/the-game` không cookie | Ở lại, locale `vi` |
| `/en/the-game` | Rewrite nội bộ `/the-game`, locale `en`, đặt cookie `en` |
| `/checkout` cookie `en`, GET | Redirect `/en/checkout` |
| `/en/checkout` cookie `vi` | Redirect `/checkout`, cookie `vi` |
| POST khi cookie `en` | Không redirect sang `/en` |

`LanguageSwitcher` ghi cookie rồi `router.push` sang cùng path kèm `window.location.search`. Path hiện tại được giữ. Hash không được giữ vì `usePathname()` không có hash.

Query được giữ ở cả middleware (clone URL) và switcher.

Route động `/en/tin-tuc/[category]/[slug]`, `/en/product/[slug]`, `/en/esim/...` rewrite về route gốc. URL không tồn tại cũng rewrite rồi trả 404 của route gốc.

Ngoại lệ:

- Path chứa `.`, `/_next`, `/api` trả về trước khi rewrite. `/en/file.png` không được coi là locale `en`.
- Redirect bảo trì và một số `permanentRedirect` trong bài viết dùng path không tiền tố. Trình duyệt rời `/en`, rồi cookie `en` kéo về `/en` bằng redirect GET thứ hai. `permanentRedirect` là 308, có thể bị cache.
- `<Link href="/...">` trong header, footer, bài viết không tự thêm `/en`. Đúng trang phụ thuộc cookie và redirect GET.

Server Component biết locale qua header. Client Component biết locale qua `LocaleProvider`, giá trị khởi tạo từ header ở root layout. API CMS không đọc `x-cardon-locale`, không có query `locale`.

## 3. File liên quan

| File | Vai trò |
|---|---|
| `apps/web/middleware.ts` | Quyết định rewrite/redirect, gắn `x-cardon-locale` và `x-cardon-public-path` |
| `apps/web/lib/i18n/locale.ts` | Prefix, cookie, format tiền VND và ngày |
| `apps/web/lib/i18n/locale.test.ts` | Test prefix, rewrite, cookie, không loop |
| `apps/web/lib/i18n/messages.ts` | Catalog `vi`/`en`, `translateNavLabel` theo href |
| `apps/web/lib/i18n/journey-messages.ts`, `final-messages.ts`, `customer-error.ts` | Chuỗi luồng mua và lỗi khách |
| `apps/web/components/i18n/LocaleProvider.tsx` | Context client, đổi locale, giữ query |
| `apps/web/components/i18n/LanguageSwitcher.tsx` | Nút VI/EN |
| `apps/web/app/layout.tsx` | `lang`, metadata global, bọc provider |
| `apps/web/lib/seo.ts` | Canonical theo locale, `hreflang` vi/en/`x-default`, Open Graph |
| `apps/web/app/sitemap.ts` | Sitemap vi đầy đủ hơn sitemap en |
| `apps/web/lib/robots-txt.ts` | Robots chung, một dòng Sitemap, không tách `/en` |
| `apps/web/lib/cms-api.ts` | Fetch CMS/theme/blog/FAQ, không có tham số locale |
| `apps/web/lib/cms-static-page.tsx` | Trang tĩnh, fallback HTML tiếng Việt, metadata có locale |
| `apps/web/lib/static-pages.ts` | Nhãn fallback tiếng Việt khi CMS thiếu |
| `apps/web/components/layout/Header.tsx` | Menu desktop từ theme, dịch theo href |
| `apps/web/components/layout/MobileMenu.tsx` | Cùng nguồn menu |
| `apps/web/components/layout/Footer.tsx` | Cột footer, map tiêu đề/href, phần còn lại giữ nguyên |
| `apps/web/lib/footer-config.ts` | Ghép địa chỉ, email, giờ làm việc thành nhãn tiếng Việt |
| `apps/web/hooks/useThemeSettings.ts` | Đọc theme public |
| `apps/web/components/cms/CmsPageView.tsx` | Render HTML CMS, breadcrumb home có dịch, title không |
| `apps/web/components/blog/BlogArticlePageView.tsx` | Bài viết, metadata locale nhưng body một ngôn ngữ |
| `apps/web/components/home/CardonHomePage.tsx`, `NewsSection.tsx` | Trang chủ, 4 bài mới từ blog |
| `src/modules/cms/controllers/cms-public.controller.ts` | API đọc public |
| `src/modules/cms/controllers/cms-admin.controller.ts` | API ghi admin, một bản mỗi trang |
| `src/modules/cms/services/cms.service.ts` | Đọc/ghi page, blog, theme, SEO |
| `src/modules/cms/repositories/cms.repository.ts` | Prisma, slug unique, không locale |
| `src/modules/cms/dto/cms.dto.ts` | Validation một `title`/`content`/`slug` |
| `src/modules/cms/entities/cms.constants.ts` | Key `system_settings` cho theme và SEO site |
| `apps/admin/components/marketing/cms-editor/*` | Editor một ngôn ngữ |
| `prisma/schema.prisma` | Model CMS, FAQ, SEO |

## 4. Model Prisma và quan hệ CMS

Không có cột `locale` trên các model dưới đây.

```text
CmsCategory 1 ──< CmsPage >── CmsSeo          (seo.pageId unique, 1-1)
                    │
                    ├── author User
                    ├── pageTags >── CmsPageTag >── CmsTag
                    └── tags Json (mảng tên, song song với pageTags)

CmsPage.type     PAGE | PRODUCT_LANDING | BLOG_POST
CmsPage.status   DRAFT | PUBLISHED | ARCHIVED
CmsPage.pageLayout ARTICLE | LANDING | POLICY

CmsMedia         độc lập, alt/title một ngôn ngữ
CmsBanner        title, imageUrl, linkUrl, position

FaqCategory 1 ──< Faq
```

Trường nội dung trên `CmsPage`: `slug` unique, `title`, `content`, `excerpt`, `category` (chuỗi cũ), `categoryId`, `status`, `publishedAt`, `scheduledPublishAt`, `showInNav`, `navSortOrder`.

`CmsSeo`: `metaTitle`, `metaDescription`, `metaKeywords`, `focusKeyword`, `ogTitle`, `ogDescription`, `ogImage`, `canonicalUrl`, `robots`, `structuredData`. Gắn một page.

`CmsCategory`: `slug`, `name`, `description`, `intro`, `metaTitle`, `metaDescription`, `canonicalUrl`, `ogImageUrl`.

`CmsTag`: `slug`, `name`, `metaTitle`, `metaDescription`, `isHidden`.

Theme và SEO toàn site không nằm trên các model này. Chúng là JSON trong `system_settings`:

| Key | Nội dung |
|---|---|
| `cms.theme.header_menu` | `{ label, href, sortOrder }[]` |
| `cms.theme.footer_columns` | `{ title, links: { label, href }[] }[]` |
| `cms.theme.company_info` | tên, địa chỉ, email, giờ làm việc, mã số thuế, badge |
| `cms.theme.contact_channels` | kênh liên hệ |
| `cms.theme.mobile_nav` | nav mobile phụ |
| `cms.seo.site_title`, `meta_description`, `robots_txt`, `og_image_url`, sitemap | SEO global một ngôn ngữ |

API ghi: `POST/PATCH /admin/cms/pages`, publish, category, tag, SEO page, `PUT` theme. API đọc public: `/cms/pages/:slug`, `/cms/pages/nav`, `/cms/blog/posts`, `/cms/blog/posts/:slug`, `/cms/blog/categories`, `/cms/blog/categories/:slug`, `/cms/theme`, `/cms/seo-settings`, `/cms/banners`. Không chỗ nào nhận locale.

Vị trí cần truyền locale sau này: `CmsPublicController`, `CmsService.getPublishedPageForPublic`, `getBlogPost`, `listBlogPosts`, `listCategories`, `getCategoryForPublic`, `listNavPagesForPublic`, `getThemeSettings`, và `cmsFetch` phía web. Ghi admin cần DTO bản dịch riêng. Không đổi các API thanh toán.

## 5. Bảng phân loại nội dung

| Nhóm | Nguồn | Tiếng Anh | Ghi chú |
|---|---|---|---|
| Nút, form, lỗi khách, một phần hub mua hàng | `messages.ts` và file journey/final | Có, nếu key tồn tại | Thiếu key thì hiện tiếng Việt |
| Menu header/mobile khi href nằm trong `NAV_BY_HREF` | Theme DB + catalog | Có | `/`, `/the-game`, `/the-dien-thoai`, `/nap-cuoc`, `/nap-data`, `/tin-tuc`, `/esim`, `/tro-giup`, `/lien-he`, `/account` |
| Menu header/mobile href khác | `cms.theme.header_menu.label` | Không | Giữ nguyên chữ admin nhập |
| Tiêu đề cột footer `dịch vụ`, `chính sách`, `hỗ trợ` | Theme + map cứng | Có | Khớp chuỗi tiếng Việt đã lowercase |
| Link footer theo href cố định | Theme + `FOOTER_HREF_KEYS` | Có | Game, điện thoại, nạp, chính sách, trợ giúp, liên hệ |
| `MST:` và `Thời gian làm việc:` | `footer-config.ts` ghép chuỗi Việt | Một phần | Chỉ dịch nhãn nếu đúng prefix |
| Địa chỉ, email, hotline, mô tả công ty, cột tùy chỉnh | `company_info`, `footer_columns` | Không | |
| Trang giới thiệu, liên hệ, chính sách | `CmsPage` hoặc `CMS_STATIC_FALLBACK` | Không | Fallback trong code cũng tiếng Việt |
| Danh sách và chi tiết tin tức | `CmsPage` type `BLOG_POST` | Không | Metadata đổi canonical/`hreflang`, body không đổi |
| Chuyên mục, tag, nav trang tĩnh | `CmsCategory`, `CmsTag`, `title` page | Không | |
| SEO từng bài | `CmsSeo` | Không | `metaTitle` Việt được gắn vào URL `/en` |
| SEO global, OG site | `cms.seo.*` | Không | `buildGlobalMetadata` nhận locale nhưng copy vẫn một bản |
| FAQ `/tro-giup` | `Faq`, `FaqCategory` | Không | Metadata hub có bản Anh, câu hỏi không |
| Banner | `CmsBanner.title` | Không | |
| Tên sản phẩm | Product DB | Không | Mô tả meta Anh là câu ghép quanh `product.name` |
| Giá | Catalog VND | Format `en-US` / `vi-VN` | Không đổi số tiền |
| Alt ảnh CMS | `CmsMedia.alt` | Không | |

## 6. Vấn đề và rủi ro

1. `/en` và URL gốc cùng một body tiếng Việt. `buildMetadata` vẫn khai `hreflang` vi/en và canonical riêng. Công cụ tìm kiếm thấy hai URL, nội dung trùng, tín hiệu ngôn ngữ không đúng với `html lang="en"`.
2. Sitemap tiếng Anh chỉ có `/`, hub thẻ, nạp, eSIM, liên hệ, trợ giúp và `/product/...`. Chính sách, blog, chuyên mục, FAQ không có URL `/en` trong sitemap, trong khi metadata các trang đó vẫn quảng bá URL `/en` khi khách mở chúng.
3. `robots.txt` một sitemap, không chặn `/en`. URL Anh được index.
4. Link nội bộ không mang prefix. Đúng trang phụ thuộc redirect cookie. 308 từ `permanentRedirect` bài viết có thể cache URL không prefix.
5. Trang bảo trì redirect về `/bao-tri` không prefix.
6. Đoán footer theo chuỗi `MST:` / `Thời gian làm việc:` vỡ khi admin đổi cách viết.
7. Slug unique toàn cục. Không thể có hai slug cho hai ngôn ngữ nếu không đổi ràng buộc. Giữ một slug là phù hợp với rewrite hiện tại.
8. `CmsSeo.pageId` unique. Không thêm bản SEO Anh trên cùng bảng mà không bỏ unique hoặc tách bảng.
9. Editor admin và DTO chỉ một `title`/`content`. Chưa có chỗ để tab English.
10. Fallback HTML chính sách nằm trong source. Bản Anh sau này phải có nguồn rõ, không sửa fallback Việt thành bản trộn.
11. FAQ, banner, tên sản phẩm, alt media cùng một lớp “nội dung một ngôn ngữ”. Làm CMS trước vẫn chưa phủ trợ giúp và banner.

## 7. Thiết kế đề xuất, bám schema hiện có

Giữ `CmsPage` là bản gốc: `slug` unique, `type`, `status`, `publishedAt`, author, category, tag, ảnh. Không nhân đôi page để làm tiếng Anh. Không đổi URL Việt.

Thêm bảng dịch, chưa tạo trong phase này:

`cms_page_translations`

- `page_id` → `cms_pages.id` (cascade)
- `locale` `vi` | `en`
- `title`, `excerpt`, `content`
- `status` xuất bản riêng cho bản dịch
- unique `(page_id, locale)`

`cms_seo_translations`

- `page_id`, `locale`
- các trường chữ của `CmsSeo` (`metaTitle`, `metaDescription`, `ogTitle`, `ogDescription`, `canonicalUrl` nếu cần)
- unique `(page_id, locale)`
- `ogImage`, `robots`, `structuredData` có thể kế thừa bản `CmsSeo` gốc khi bản dịch bỏ trống

`cms_category_translations` và `cms_tag_translations`: `name`, `description`, `intro`, meta. Slug category/tag giữ nguyên để `/en/tin-tuc/[slug]` vẫn rewrite được.

Đọc: nếu locale `en` và bản dịch `PUBLISHED`, trả bản đó và `fallback: false`. Không có thì trả cột gốc trên `CmsPage` / `CmsSeo` và `fallback: true`. Storefront hiện một dòng catalog, không trộn đoạn Anh vào bài Việt.

Theme: mở rộng JSON hiện có, tương thích ngược.

- Menu: `label` giữ làm tiếng Việt. Thêm `labelEn` tùy chọn.
- Footer link và title: `labelEn`, `titleEn`.
- `company_info`: thêm field Anh cho đoạn mô tả. Địa chỉ, email, MST, số điện thoại giữ một giá trị. Bỏ dần việc nhận dạng prefix tiếng Việt.

API public thêm query `locale` do server web gửi từ `x-cardon-locale`. Thiếu query thì hành vi hiện tại (bản gốc). Admin thêm tab English trên cùng page id, không tạo slug mới.

FAQ và banner để phase sau cùng mẫu bảng dịch. Không đụng đơn hàng.

## 8. File dự kiến theo phase

Chưa triển khai. Danh sách để phase sau.

**Phase 1 – chrome, không migration**

- `apps/web/lib/i18n/messages.ts`, `journey-messages.ts`, `final-messages.ts`
- `apps/web/components/layout/Header.tsx`, `MobileMenu.tsx`, `Footer.tsx`
- `apps/web/lib/footer-config.ts`
- `apps/web/hooks/useThemeSettings.ts`
- `src/modules/cms/dto/cms.dto.ts` chỉ nếu thêm field tùy chọn `labelEn` trên JSON theme
- `src/modules/cms/services/cms.service.ts` normalize theme
- Admin màn theme/menu/footer

**Phase 2 – đọc CMS theo locale, sau migration**

- `prisma/schema.prisma` và một migration mới
- `src/modules/cms/repositories/cms.repository.ts`
- `src/modules/cms/services/cms.service.ts`
- `src/modules/cms/controllers/cms-public.controller.ts`
- `src/modules/cms/dto/cms.dto.ts`
- `apps/web/lib/cms-api.ts`
- `apps/web/lib/cms-static-page.tsx`
- `apps/web/components/cms/CmsPageView.tsx`
- `apps/web/components/blog/BlogArticlePageView.tsx`
- `apps/web/app/tin-tuc/[category]/page.tsx`
- `apps/web/app/[slug]/page.tsx`, `gioi-thieu`, `lien-he`
- `apps/web/components/home/NewsSection.tsx` và page chủ

**Phase 3 – admin tab English**

- `apps/admin/components/marketing/cms-editor/ProfessionalEditor.tsx`
- `EditorMetaSidebar.tsx`, `SeoPanel.tsx`, `PublishPanel.tsx`, `ProfessionalCmsManager.tsx`
- `apps/admin/services/api-client.ts` và types CMS
- Category/tag forms

**Phase 4 – SEO**

- `apps/web/lib/seo.ts` (hreflang chỉ khi bản en đã xuất bản)
- `apps/web/app/sitemap.ts`
- `apps/web/lib/robots-txt.ts` nếu cần sitemap phụ
- `apps/web/app/layout.tsx` metadata global

FAQ (`Faq`, trang `tro-giup`) là phase riêng sau CMS page.

## 9. Migration và rollback

Chưa chạy.

1. Tạo bảng dịch. Không sửa cột chữ trên `cms_pages`, `cms_seo`, `cms_categories`, `cms_tags`.
2. Backfill một dòng `locale = vi` từ cột hiện có, status theo status page. Bản `en` không tự sinh.
3. Ứng dụng đọc: có bản dịch thì dùng, không có thì cột gốc. Deploy code đọc mới sau khi backfill.
4. Không xóa cột gốc trong cùng đợt.

Rollback:

- Trả code đọc về cột gốc.
- Bảng dịch có thể để lại hoặc drop. Drop không mất bài đang xuất bản vì cột gốc còn.
- JSON theme: field `labelEn` mới là tùy chọn. Code cũ bỏ qua field lạ. Rollback code không cần sửa JSON.

Rủi ro migration: unique `(page_id, locale)` trùng nếu backfill chạy hai lần. Dùng insert có `ON CONFLICT DO NOTHING`. Không đụng slug unique hiện tại.

## 10. Test cần bổ sung

Đã có `apps/web/lib/i18n/locale.test.ts` cho prefix, rewrite, cookie. Chưa có test nội dung CMS theo locale.

Cần thêm, khi làm phase sau:

- Middleware: `/en/tin-tuc/a/b?x=1` rewrite đúng path và giữ query. Cookie `en` trên GET `/lien-he` redirect `/en/lien-he`. POST không redirect. Path có dấu chấm không nuốt nhầm locale.
- `LanguageSwitcher`: từ `/en/the-game?q=1` sang `vi` còn query và path `/the-game`.
- `translateNavLabel`: href đã biết ra tiếng Anh. Href lạ giữ label DB.
- Footer: cột tùy chỉnh không nằm trong map giữ nguyên. `labelEn` được dùng khi có.
- Repository: page published, locale `en` có translation published thì trả title/content Anh. Không có translation thì trả bản gốc và cờ fallback. Slug không đổi.
- SEO translation thiếu thì meta rơi về `CmsSeo` gốc.
- API public thiếu `locale` giữ response hiện tại.
- Admin: lưu tab Anh không ghi đè `cms_pages.title` Việt.
- Sitemap: URL `/en` của bài chỉ xuất hiện khi bản Anh published.
- `hreflang` en không được render khi `fallback: true`.
- Bài viết `permanentRedirect` khi đang ở `/en` vẫn trở lại URL có prefix.

## Kết luận

Routing `/en` và catalog giao diện đã chạy. Nội dung header tùy chỉnh, footer, trang tĩnh, bài viết, chuyên mục, tag, FAQ và SEO bài là một bản tiếng Việt trong database. Phase tiếp theo nên là bảng dịch bám `CmsPage` hiện có, không nhân đôi slug, và chỉ index URL Anh khi bản Anh đã xuất bản.

Phase 1 chưa được triển khai.
