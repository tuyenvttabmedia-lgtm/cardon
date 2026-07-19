# OpenGraph Images — Launch Assets

Chuẩn bị ảnh OG trước go-live. **Chưa upload production** — export PNG từ design tool và đặt vào `apps/web/public/og/` khi deploy.

## Kích thước bắt buộc

| Asset | Kích thước | Format | Ghi chú |
|-------|------------|--------|---------|
| `og-default.png` | 1200 × 630 | PNG | Fallback mọi trang |
| `og-home.png` | 1200 × 630 | PNG | Trang chủ |
| `og-catalog.png` | 1200 × 630 | PNG | `/cards` |
| `legal-terms.png` | 1200 × 630 | PNG | CMS Terms |
| `legal-privacy.png` | 1200 × 630 | PNG | CMS Privacy |
| `legal-refund.png` | 1200 × 630 | PNG | CMS Refund |
| `favicon.ico` | 32×32, 16×16 | ICO | Tab browser |
| `apple-touch-icon.png` | 180 × 180 | PNG | iOS home screen |

## Nội dung design (guideline)

- Nền: gradient brand (xanh `#0d9488` → `#115e59` hoặc palette CardOn)
- Logo CardOn.vn góc trái trên
- Headline ngắn (≤ 8 từ): *"Thẻ game — Giao ngay"*
- Subtext: *"An toàn • Uy tín • Hỗ trợ 8h–22h"*
- **Không** nhét quá nhiều text (Facebook/ Zalo crop thumbnail)

## File mẫu vector

- `og-default.svg` — wireframe placeholder (convert → PNG trước production)

## Deploy checklist

1. Export PNG @2x từ Figma/Canva
2. Copy vào `apps/web/public/og/`
3. Cập nhật `launch/seo/site-metadata.json` URLs nếu dùng CDN
4. Verify: [Facebook Sharing Debugger](https://developers.facebook.com/tools/debug/)
5. Verify: [Twitter Card Validator](https://cards-dev.twitter.com/validator) (nếu dùng)

## CDN (optional)

Nếu dùng Cloudflare R2 / static CDN:

```
https://cdn.cardon.vn/og/og-default.png
```

Cập nhật `og_image` trong `launch/cms/pages.json` và `site-metadata.json`.
