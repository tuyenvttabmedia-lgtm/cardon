# Phase 4 — SEO đa ngôn ngữ

Ngày: 6/11/2026. Phạm vi: canonical, hreflang, sitemap và metadata theo locale `vi` / `en`. Không dịch FAQ, banner hay theme. Không đổi nội dung bài viết có sẵn. Không migration. Không deploy production.

Kết luận: **PASS**.

## 1. Hiện trạng SEO trước khi sửa

Đối chiếu báo cáo Phase 0, 2, 3, 3.1 với source hiện tại. Không có lệch contract Phase 2/3. Lệch cần sửa nằm đúng chỗ Phase 0 đã ghi:

- `buildMetadata` luôn gắn `hreflang` `vi`, `en` và `x-default`, kể cả khi Public API trả `fallback: true`.
- Canonical đã là absolute và có prefix `/en` khi `locale=en`. Canonical không lấy path nội bộ đã rewrite. `CmsSeo.canonicalUrl` cùng site được strip rồi gắn lại prefix locale. Query không bị loại ở mọi nhánh.
- Sitemap tiếng Việt đủ trang tĩnh, nav CMS, blog, chuyên mục, sản phẩm và FAQ. Sitemap tiếng Anh là danh sách cứng: trang chủ, hub thẻ, nạp, eSIM, `/lien-he`, `/tro-giup` và mọi `/product/...`, không nhìn trạng thái bản dịch.
- Trang CMS và bài viết đã gọi API có `locale`. `fallback: false` và `contentLocale: en` chỉ khi translation `en` có `status=PUBLISHED`. HTTP 200 của `/en/...` không có nghĩa là bản Anh đã xuất bản.
- Chuyên mục không có cột status. Bản `en` được coi là có khi tên tiếng Anh không rỗng. Tag không có route storefront.
- `getSiteUrl()` ở dev là `http://localhost`. Sitemap dùng `sitemapBaseUrl` trong SEO settings, local đang là `https://cardon.vn`. Production `getSiteUrl()` vẫn là `https://cardon.vn` khi không có `NEXT_PUBLIC_SITE_URL`.
- Redirect `/en/huong-dan` đi qua rewrite rồi rule Next, nên có thể mất prefix `/en`.

## 2. File đã thay đổi

Storefront:

- `apps/web/lib/seo.ts`
- `apps/web/lib/seo.test.ts`
- `apps/web/lib/sitemap-locales.ts`
- `apps/web/lib/sitemap-locales.test.ts`
- `apps/web/lib/locale-redirects.ts`
- `apps/web/lib/locale-redirects.test.ts`
- `apps/web/app/sitemap.ts`
- `apps/web/lib/cms-api.ts`
- `apps/web/lib/cms-static-page.tsx`
- `apps/web/components/blog/BlogArticlePageView.tsx`
- `apps/web/app/tin-tuc/page.tsx`
- `apps/web/app/tin-tuc/[category]/page.tsx`
- `apps/web/app/tro-giup/[categorySlug]/[slug]/page.tsx`
- `apps/web/app/pages/[slug]/page.tsx`
- `apps/web/middleware.ts`

API:

- `src/modules/cms/entities/cms-locale.ts`
- `src/modules/cms/entities/cms-locale.spec.ts`
- `src/modules/cms/repositories/cms.repository.ts`
- `src/modules/cms/services/cms.service.ts`
- `src/modules/cms/services/cms-english-sitemap.spec.ts`
- `src/modules/cms/controllers/cms-public.controller.ts`

Endpoint mới, chỉ đọc: `GET /api/v1/cms/english-sitemap`. Không đổi schema.

## 3. Cách xác định EN PUBLISHED

Không dùng HTTP 200.

- Trang và bài viết: Public API `locale=en` trả `contentLocale=en` và `fallback=false`. Điều kiện đó chỉ đúng khi trang gốc `PUBLISHED` và dòng `cms_page_translations` locale `en` có `status=PUBLISHED`.
- Sitemap không gọi từng slug. API trả slug đã thỏa điều kiện trên, kèm `type` và `categorySlug`.
- Chuyên mục: có dòng `en` với `name` không rỗng. Public API khi đó trả `fallback=false`.
- Route giao diện đã dịch trong catalog (`/`, hub thẻ, nạp, eSIM, `/tro-giup`, `/product/...`) không có dòng CMS. Chúng giữ alternate tiếng Anh vì bản Anh là UI trong code, không phải bản dịch CMS.

## 4. Quy tắc canonical

Canonical là absolute URL của locale đang mở, không query, không path rewrite.

- VI: `https://cardon.vn/gioi-thieu`
- EN đã xuất bản: `https://cardon.vn/en/gioi-thieu`
- EN chưa xuất bản: canonical vẫn là `https://cardon.vn/en/...`, không trỏ về URL tiếng Việt. Trang này không được khai là bản dịch Anh.

Slug không đổi. Không tạo bản ghi CMS cho tiếng Anh.

Trên dev, `getSiteUrl()` là `http://localhost`, nên HTML local dùng host đó. Sitemap local vẫn dùng `https://cardon.vn` từ SEO settings. Path và prefix đã kiểm trên cả hai.

## 5. Quy tắc hreflang

`vi` và `x-default` luôn trỏ URL tiếng Việt.

`en` chỉ có khi bản Anh được xuất bản, hoặc route thuộc catalog giao diện đã dịch. Hai chiều cùng một bộ URL, absolute, không query.

Khi EN là DRAFT hoặc chưa có:

- Không có `hreflang="en"`.
- `/en/...` đặt `robots` `noindex,follow`.
- `og:locale` là `vi_VN` vì nội dung đang phục vụ là tiếng Việt.
- Title, description và OG lấy đúng payload fallback, không lấy SEO tiếng Anh đang nháp.

## 6. Quy tắc sitemap

URL tiếng Việt hiện có được giữ. URL trùng được gộp theo `<loc>`.

URL `/en` của CMS page, blog và chuyên mục chỉ được thêm khi nằm trong `english-sitemap`. Mỗi cặp có `xhtml:link` `vi`, `en`, `x-default` giống HTML.

Route catalog giữ URL `/en` như sitemap cũ, trừ `/en/lien-he`. Liên hệ là trang CMS, nên chỉ vào sitemap khi bản Anh đã xuất bản. Hiện chưa xuất bản nên không còn trong sitemap.

Không thêm tag. Không thêm preview, admin, draft. FAQ chi tiết không có bản Anh nên không có URL `/en` riêng. Hub `/tro-giup` vẫn có vì UI tiếng Anh nằm trong catalog.

## 7. Metadata theo locale

Title, description, canonical, `alternates.languages`, OG title, OG description, OG url và OG locale đi qua `buildMetadata`.

EN `PUBLISHED` dùng SEO tiếng Anh nếu trường có chữ. Ô trống vẫn theo fallback API hiện tại: meta/OG title lấy title Anh, description lấy excerpt Anh. Không tự dịch.

EN `DRAFT` dùng metadata tiếng Việt mà API trả về. VI của trang test giữ SEO gốc `Phase 3.1 VI ban dau` vì lần sửa VI trước không gửi SEO. H1 là title VI mới. Đó là dữ liệu sẵn có, không phải ghi đè chéo.

## 8. Kết quả Test A–F

Dữ liệu cuối, không xóa:

| Bản ghi | ID | Trạng thái cuối |
| --- | --- | --- |
| Trang `phase-3-1-integration-test` | `b2e80ce3-e978-42ce-9218-029ec35a958a` | Trang `PUBLISHED`. VI `PUBLISHED`: `Phase 3.1 VI da cap nhat`. EN `DRAFT`: `Phase 3 Integration Test` |
| Bài `phase-4-blog-integration-test` | `a8330cae-6bf1-41af-81d1-8bcdc937a35a` | Bài mới, chuyên mục `huong-dan`, không sửa bài cũ. VI `PUBLISHED`. EN `DRAFT` |

### Test A — EN DRAFT

- VI canonical `http://localhost/phase-3-1-integration-test`, robots `index,follow`.
- EN canonical `http://localhost/en/phase-3-1-integration-test`, không trỏ về VI.
- Không có `hreflang=en`. Có `vi` và `x-default`.
- EN `noindex,follow`, `og:locale=vi_VN`.
- Sitemap không có URL EN của trang này.
- H1 tiếng Việt. Không có câu Anh của bản nháp.

### Test B — EN PUBLISHED

Public API: `contentLocale=en`, `fallback=false`, title `Phase 3 Integration Test`, meta và OG đúng chữ đã lưu. VI giữ `Phase 3.1 VI da cap nhat`, meta VI không đổi.

HTML hai chiều:

- VI canonical không prefix. EN canonical có `/en`.
- Cả hai có `vi`, `en`, `x-default`. `x-default` là URL VI.
- OG EN: title `Phase 3 OG`, locale `en_US`, url là URL `/en`.
- Sitemap `https://cardon.vn/phase-3-1-integration-test` và `https://cardon.vn/en/phase-3-1-integration-test`, mỗi bên ba `xhtml:link` giống nhau.
- Trình duyệt `/en/...`: H1 và excerpt tiếng Anh. Không thấy đoạn VI trong thân bài.

### Test C — EN về DRAFT

API ngay lập tức: title VI, `fallback=true`, meta là SEO VI, không còn meta Anh. `english-sitemap` hết trang này.

Sau khi storefront đọc dữ liệu mới:

- `hreflang=en` biến mất ở VI và EN.
- Sitemap không còn URL EN.
- VI vẫn 200, H1 `Phase 3.1 VI da cap nhat`.
- `/en/...` 200, title VI, `noindex`, có câu “This content is shown in Vietnamese because an English version is not published yet.” Không còn câu “This is a local integration test.”

### Test D — Blog

Bài test, EN DRAFT: sitemap chỉ có URL VI. `/en/tin-tuc/huong-dan/phase-4-blog-integration-test` canonical là URL EN, không `hreflang=en`, `noindex`, thân bài tiếng Việt.

EN PUBLISHED: title `Phase 4 English blog`, OG `Phase 4 blog OG`, `fallback=false`. Thân `/en` chỉ có câu Anh. Thân VI chỉ có câu Việt. Sitemap có cả hai URL. Đưa EN về DRAFT thì URL EN rời sitemap, VI của bài vẫn còn vì mọi bài `PUBLISHED` vẫn được liệt kê như trước.

### Test E — Category và tag

Năm chuyên mục không có bản `en`. `/tin-tuc/huong-dan` canonical VI, chỉ `vi` và `x-default`. `/en/tin-tuc/huong-dan` canonical là URL EN, không có `hreflang=en`. Sitemap không có `/en/tin-tuc/...` cho chuyên mục.

Tag không có route public và không có `<loc>` chứa `/tag/`. Không tạo slug mới.

Unit test xác nhận helper chỉ thêm URL EN của chuyên mục khi API báo chuyên mục đó có bản Anh.

### Test F — Regression

200 và canonical đúng locale:

- `/` và `/en`, có `hreflang` hai chiều.
- `/gioi-thieu` và `/en/gioi-thieu`. Giới thiệu chưa có EN xuất bản nên không có `hreflang=en` và không có `/en/gioi-thieu` trong sitemap.
- `/the-game`, `/en/the-game`, `/the-dien-thoai`, `/nap-cuoc`. Hub giữ `hreflang` Anh.
- Blog index và bài test mở được. Menu/footer không vỡ.

Redirect 308, giữ prefix khi đang ở tiếng Anh:

- `/en/huong-dan` → `/en/tin-tuc/huong-dan`
- `/en/khuyen-mai` → `/en/tin-tuc/khuyen-mai`
- `/en/pages/gioi-thieu` → `/en/gioi-thieu`
- `/en/cards?service=PHONE_CARD` → `/en/the-dien-thoai`
- `/huong-dan` vẫn → `/tin-tuc/huong-dan`, không thêm `/en`.

`/gioi-thieu?utm=1` trả 200. Canonical không chứa `utm`.

Sitemap sau khi trả EN về DRAFT: 268 URL, 268 `<loc>` duy nhất, còn `/gioi-thieu`, `/en/the-game` và bài blog VI, không còn URL EN của hai bản test.

## 9. Typecheck, test và build

- `tsc --noEmit` storefront và API: pass.
- Vitest `seo`, `sitemap-locales`, `locale-redirects`: 8 pass.
- Jest `cms-locale` và `cms-english-sitemap`: 9 pass.
- `npm run build` trong `apps/web`: pass, gồm lint và typecheck của Next. 55 trang static, không lỗi.

API Docker được build lại chỉ service `api`.

- Image trước: `sha256:6165ce08a364f32b0ee1715c965f755ee6e80c86373c1cbd5f4e90c6a0bc4376`
- Image sau: `sha256:3012ade72746867158b6cd7b07a9cb62b9cd0629544532f77e4d19115151654c`
- Container `cardon-local-full-api` healthy. `RUN_MIGRATIONS=false`, `RUN_SEED=false`.
- Log có `Database connected`, route `GET /api/v1/cms/english-sitemap`, không có `prisma migrate` hay seed.
- Postgres, Redis healthy. Worker giữ image cũ `sha256:3c49ede351a6...`. Volume không xóa.

## 10. Vấn đề còn tồn tại

Không có lỗi làm FAIL.

- Fetch CMS của storefront vẫn `revalidate` 60 giây. Request đầu sau khi đổi DRAFT/PUBLISHED có thể còn HTML hoặc sitemap cũ. API đổi ngay. Request sau đúng.
- Canonical HTML trên dev dùng host `http://localhost`. Sitemap dùng `https://cardon.vn` từ cấu hình SEO. Production không set `NEXT_PUBLIC_SITE_URL` thì `getSiteUrl()` là `https://cardon.vn`.
- `<title>` trang test vẫn là SEO VI lúc tạo, `Phase 3.1 VI ban dau`. H1 là title VI đã sửa. SEO VI không nằm trong lần sửa này.
- Menu CMS chưa có bản Anh vẫn hiện tiếng Việt trên `/en`. Đúng Phase 1/2.
- `/en` chưa xuất bản bị `noindex` nhưng canonical là chính URL `/en`, không gộp về VI. Cố ý, để không biến fallback thành bản dịch Anh và cũng không trỏ canonical `/en` về URL Việt.

## 11. Rollback

Không có migration mới. Rollback là revert các file ở mục 2 rồi build lại image API local. Dữ liệu test có thể để nguyên: EN đang `DRAFT`, không xuất hiện trên public. Không cần xóa volume.

## 12. Production

Không deploy. Không chạy migration trên production. Không seed. Không gọi thanh toán, PayPal, Airalo hay nhà cung cấp eSIM.

Dừng tại Phase 4 để nghiệm thu. Không sang Phase 5.

Storefront `http://localhost:3001` và admin `http://localhost:3003` vẫn chạy. API Docker healthy.
