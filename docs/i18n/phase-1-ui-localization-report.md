# CARDON-I18N-PHASE-1 – Báo cáo nghiệm thu

Phase 1 chỉ làm lớp giao diện. Không có migration, không sửa Prisma, không ghi database, không seed, không đổi slug, không đổi routing `/en`, không đụng thanh toán, đơn hàng, eSIM hay đại lý.

Phase 2 chưa được triển khai.

## 1. File đã sửa

Storefront

- `apps/web/lib/i18n/messages.ts` — catalog đủ key Anh/Việt; bỏ dịch menu theo href.
- `apps/web/lib/i18n/final-messages.ts` — thêm nhãn `footer.email`, `footer.hotline`, `footer.bctAlt`.
- `apps/web/lib/i18n/locale.ts` — `localeSwitchTarget` giữ path và query.
- `apps/web/lib/i18n/theme-labels.ts` — resolver nhãn menu, tiêu đề cột, mô tả.
- `apps/web/lib/i18n/theme-labels.test.ts`
- `apps/web/lib/i18n/locale.test.ts`
- `apps/web/lib/footer-config.ts` — cột công ty tách nhãn catalog khỏi giá trị.
- `apps/web/lib/cms-api.ts` — type theme nhận field Anh tùy chọn.
- `apps/web/lib/mobile-nav.defaults.ts` — menu mobile mặc định có `navKey`.
- `apps/web/hooks/useThemeSettings.ts`
- `apps/web/components/i18n/LocaleProvider.tsx`
- `apps/web/components/layout/Header.tsx`
- `apps/web/components/layout/MobileMenu.tsx`
- `apps/web/components/layout/MobileBottomNav.tsx`
- `apps/web/components/layout/Footer.tsx`

API theme JSON

- `src/modules/cms/entities/theme-locale.ts`
- `src/modules/cms/entities/theme-locale.spec.ts`
- `src/modules/cms/entities/cms-theme.defaults.ts`
- `src/modules/cms/services/cms.service.ts`
- `src/modules/cms/dto/cms.dto.ts`
- `src/modules/cms/repositories/cms.repository.ts`

Admin

- `apps/admin/types/api.ts`
- `apps/admin/lib/theme-normalize.ts`
- `apps/admin/lib/theme-normalize.test.ts`
- `apps/admin/lib/i18n/vi.ts`
- `apps/admin/app/marketing/appearance/page.tsx`

`journey-messages.ts` và `customer-error.ts` không cần sửa. Catalog Anh đã đủ key và không còn chữ Việt có dấu, trừ tên ngôn ngữ `lang.vi`.

## 2. Theme JSON trước và sau

Trước, một mục menu và một cột footer chỉ có chữ Việt:

```json
{
  "headerMenu": [{ "label": "Tin tức", "href": "/tin-tuc", "sortOrder": 4 }],
  "footerColumns": [
    {
      "title": "Dịch vụ",
      "links": [{ "label": "Mua thẻ game", "href": "/the-game" }]
    }
  ],
  "companyInfo": {
    "companyName": "Công ty CardOn",
    "taxCode": "0101234567",
    "address": "Hà Nội",
    "email": "support@cardon.vn",
    "hotline": "0984877066",
    "workingHours": "8:00-17:00"
  }
}
```

Sau, các field cũ giữ nguyên. Field Anh là tùy chọn và chỉ xuất hiện khi admin nhập:

```json
{
  "headerMenu": [
    { "label": "Tin tức", "labelEn": "News", "href": "/tin-tuc", "sortOrder": 4 }
  ],
  "footerColumns": [
    {
      "title": "Đối tác",
      "titleEn": "Partners",
      "links": [{ "label": "Blog", "labelEn": "Articles", "href": "/tin-tuc" }]
    }
  ],
  "companyInfo": {
    "companyName": "Công ty CardOn",
    "taxCode": "0101234567",
    "address": "Hà Nội",
    "email": "support@cardon.vn",
    "hotline": "0984877066",
    "workingHours": "8:00-17:00",
    "description": "Nền tảng thẻ và nạp cước.",
    "descriptionEn": "Cards and top-up."
  }
}
```

Menu hệ thống dựng trong code có thêm `navKey`, ví dụ `nav.home`. Cột footer mặc định có `titleKey`. Hai key này không được suy ra từ href hay từ câu chữ tiếng Việt. Theme đã lưu không bị ghi đè cho đến khi admin bấm lưu.

## 3. Ví dụ menu và footer

Menu hệ thống khi theme header trống:

| Locale | Nhãn |
| --- | --- |
| vi | Trang chủ, Mua thẻ, Nạp cước, Nạp Data, Tin tức |
| en | Home, Buy cards, Top-up, Data, News |

Mục tùy chỉnh:

- `label: "Khuyến mãi"`, `labelEn: "Offers"`, href `/the-game` → tiếng Anh hiện **Offers**.
- Cùng href, không có `labelEn` → tiếng Anh vẫn hiện **Khuyến mãi**. Href không còn bị thay bằng "Game cards".

Footer mặc định khi chưa có cột trong theme: tiêu đề Services / Policies / Support và link Buy game cards, Terms of use, Help center. Ticket giữ nguyên vì không có bản Anh riêng.

Cột công ty, locale `en`, dữ liệu cũ:

- Tên: `Công ty CardOn`
- `Tax ID: 0101234567`
- Địa chỉ: `Hà Nội`
- `Email: support@cardon.vn`
- `Hotline: 0984877066`
- `Working hours: 8:00-17:00`

Giá trị MST, email, hotline, địa chỉ và tên pháp nhân không bị dịch. Nhãn đứng riêng, không còn cắt chuỗi `MST:` hay `Thời gian làm việc:`.

## 4. Tương thích ngược

Resolver đọc được cả ba dạng:

1. Theme cũ không có `labelEn` / `titleEn`: tiếng Anh dùng `navKey` hoặc `titleKey` nếu mục là default trong code; mục đã lưu không có key thì giữ `label` / `title`.
2. Theme có đủ nhãn Anh: `labelEn` và `titleEn` được ưu tiên.
3. Theme chỉ dịch một vài mục: mục trống bản Anh rơi về nhãn Việt. Chuỗi Anh chỉ gồm khoảng trắng được bỏ, không lưu thành bản dịch.

ValidationPipe vẫn nhận payload cũ và payload có field Anh. Field lạ trên từng mục menu được giữ khi normalize, không xóa `label`, `href`, `sortOrder`.

Desktop header, menu mobile và thanh dưới dùng cùng `resolveMenuLabel`. Ô tài khoản trên thanh dưới nhận diện bằng `requireLogin` hoặc URL `/account`, không còn dò chữ "tài khoản".

Hotline được ghép vào cột công ty cùng email và giờ làm việc. Trước đây code tìm cột có chữ "hỗ trợ" để chèn hotline. Cột hỗ trợ do admin tạo vẫn giữ các link đã lưu.

## 5. Chuyển ngôn ngữ

`VI → EN` trên `/the-game?q=phase1` thành `/en/the-game?q=phase1`. `EN → VI` thành `/the-game?q=phase1`. Mỗi chiều một request `200`, không lặp redirect. POST không đi qua nút chuyển ngôn ngữ. Middleware không sửa.

Đã xem trên storefront dev: nút Log in / Sign up, menu Home / Buy cards / News, footer Services / Policies / Support, và hotline/email giữ nguyên số cùng địa chỉ. Trang này không gọi được API theme (404 trên dev server tách khỏi API), nên đó là menu và footer mặc định trong code.

## 6. Test, lint, build

| Lệnh | Kết quả |
| --- | --- |
| `apps/web` vitest `theme-labels.test.ts` + `locale.test.ts` | 18 passed |
| `apps/admin` vitest `theme-normalize.test.ts` | 1 passed |
| API jest `theme-locale.spec.ts` | 2 passed |
| `tsc --noEmit` web, admin, API | pass |
| `next build` web và admin | pass, có bước kiểm tra type |
| `npm run lint` | không chạy được: Next 15 hỏi cấu hình ESLint vì repo chưa có file ESLint. Build đã chạy bước lint/type của Next và qua. |

Test bao phủ 10 mục bắt buộc: menu hệ thống vi/en, mục tùy chỉnh có và thiếu `labelEn`, footer theo locale, footer cũ, company info, desktop/mobile cùng resolver, path + query, và key thanh toán `checkout.pay` cùng mã đơn `ORD-…` không bị dịch.

## 7. Chưa được dịch

- Menu, cột footer và link đã lưu trong `system_settings` mà chưa có `labelEn` / `titleEn` / `navKey`. Chúng giữ chữ admin đã nhập. Cần nhập bản Anh trên Giao diện rồi lưu. Phase này không ghi database.
- Trang CMS, bài viết, chuyên mục, tag, FAQ, banner.
- Tiêu đề và mô tả SEO lấy từ CMS. Trên `/en/the-game` khi API theme lỗi, phần chrome catalog đã sang tiếng Anh; nội dung CMS vẫn là phạm vi Phase 2.
- Tên pháp nhân, địa chỉ, MST, email, hotline, giờ làm việc: một giá trị cho cả hai ngôn ngữ.
- Mô tả công ty chỉ có tiếng Anh sau khi admin nhập `descriptionEn`.

## 8. Ngoài phạm vi

- `/en` vẫn rewrite về route cũ. `hreflang`, sitemap và nội dung trang tĩnh chưa đổi.
- Dev server web đang chạy bị build production ghi đè `.next`. Đã tắt process `next dev --port 3001` cũ và bật lại `npm run dev` với cache sạch. API, admin, thanh toán và database không bị restart.
- Nạp cước và Nạp Data ẩn khỏi menu khi `site-config` không tải được. Đó là bộ lọc sẵn có, không phải thay đổi thứ tự menu.
