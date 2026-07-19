# Phase 6F.1 — Customer Homepage Redesign

**Ngày hoàn thành:** 2025-06-21  
**Phạm vi:** Redesign trang chủ CardOn.vn theo mockup — quick checkout kiểu napluon.vn, fintech SaaS, branding CardOn.

**Không thay đổi:** payment logic, provider logic, order backend, ledger.

**Thay đổi:** customer frontend UI/UX, layout responsive, kết nối CMS.

---

## Tóm tắt

Trang chủ mới gom toàn bộ luồng mua thẻ vào một màn hình: chọn danh mục → chọn nhà cung cấp → mệnh giá → số lượng → email/SĐT → thanh toán (SePay / MegaPay). Không cần vào trang chi tiết sản phẩm.

---

## Design System

| Token | Giá trị |
|-------|---------|
| Navy | `#002B6B` |
| Blue | `#005BEA` |
| Orange | `#FF7A00` |
| Green | `#00B889` |
| Background | `#F5F7FA` |
| Font | Inter |
| Container | `max-width: 1200px` |

Cấu hình Tailwind: `apps/web/tailwind.config.ts`  
Utility classes: `apps/web/app/globals.css` (`.site-container`, `.btn-checkout`, `.step-badge`)

---

## Cấu trúc trang chủ

```
HeroBanner          → CMS banner HOME_HERO (fallback gradient)
CategoryQuickSelect → Thẻ game / Điện thoại / Nạp cước / Data
QuickCheckout       → 4 bước trái + tóm tắt sticky phải (desktop)
NewsSection         → 3 bài mới nhất từ CMS /blog
Footer              → USP bar + cột link từ Appearance CMS
```

---

## Header & Footer (CMS)

- **Header:** logo desktop/mobile từ `GET /cms/theme`, menu `headerMenu` (fallback menu mặc định)
- **Mobile:** hamburger drawer + bottom nav (Home, Mua thẻ, Đơn hàng, Tài khoản)
- **Footer:** `footerColumns` từ CMS + 4 USP (giao mã tức thì, an toàn, 24/7, uy tín)

Hook: `apps/web/hooks/useThemeSettings.ts`

---

## Quick Checkout

| Bước | Nội dung |
|------|----------|
| 1 | Chọn provider (card, border xanh + ✓) |
| 2 | Chọn mệnh giá (face value + giá bán) |
| 3 | Số lượng [−] n [+] |
| 4 | Email (topup: thêm SĐT) |
| 5 (mobile) | Chọn SePay / MegaPay |

**Desktop:** cột phải sticky — tóm tắt đơn, phương thức thanh toán (card), nút gradient **THANH TOÁN**.

**Mobile:** single column + thanh sticky dưới (tổng tiền + nút Thanh toán), QR overlay sau khi tạo đơn SePay.

Logic thanh toán tái sử dụng `orderApi.create` + `paymentApi.create` (giữ nguyên backend).

---

## Logo & Assets

| File | Dùng cho |
|------|----------|
| `public/images/cardon-logo-full.png` | Header desktop |
| `public/images/cardon-icon.png` | Header mobile, favicon |

Có thể override qua Admin → Giao diện (Appearance).

---

## CMS API (frontend)

| Endpoint | Mục đích |
|----------|----------|
| `GET /cms/theme` | Logo, menu, footer |
| `GET /cms/banners?position=HOME_HERO` | Hero banner |
| `GET /cms/blog/posts` | Tin tức trang chủ |

Thêm public endpoint banners (chỉ CMS, không đụng payment/order):

- `src/modules/cms/controllers/cms-public.controller.ts`
- `cms.repository.findActiveBanners()`

---

## Responsive breakpoints

| Viewport | Hành vi |
|----------|---------|
| ≥1200px | Container 1200px, grid 65/35 checkout |
| 1024–1199 | Grid co giãn |
| 768–1023 | 1 cột checkout, summary ẩn desktop panel |
| ≤767px | Bottom nav + sticky checkout bar |

---

## Files chính

```
apps/web/app/page.tsx
apps/web/app/layout.tsx
apps/web/app/globals.css
apps/web/tailwind.config.ts
apps/web/components/home/HomePageClient.tsx
apps/web/components/home/HeroBanner.tsx
apps/web/components/home/CategoryQuickSelect.tsx
apps/web/components/home/NewsSection.tsx
apps/web/components/layout/Header.tsx
apps/web/components/layout/Footer.tsx
apps/web/components/layout/MobileMenu.tsx
apps/web/components/layout/MobileBottomNav.tsx
apps/web/hooks/useThemeSettings.ts
apps/web/lib/home-catalog.ts
apps/web/lib/cms-api.ts
apps/web/public/images/*
```

---

## Build & kiểm tra

```bash
npm run build:web
```

**Kết quả agent:**

| Kiểm tra | Kết quả |
|----------|---------|
| `tsc --noEmit` (apps/web) | **OK** |
| `npm run build:web` | Cần npm + SWC native trên máy local (agent thiếu npm) |

### QA thủ công đề xuất

1. Mở `/` — hero, 4 tab danh mục, danh sách provider
2. Chọn Garena → mệnh giá → qty → email → SePay → QR hiện
3. Tab Nạp cước → nhập SĐT
4. Mobile: bottom nav + sticky bar thanh toán
5. Admin Appearance: đổi logo/menu → refresh trang chủ
6. CMS banner `HOME_HERO` → hero dùng ảnh CMS

---

**Trạng thái:** Phase 6F.1 hoàn thành theo mockup và phạm vi yêu cầu.
