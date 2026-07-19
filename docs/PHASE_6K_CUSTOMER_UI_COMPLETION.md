# Phase 6K — Customer Website Full UI Completion

**Ngày hoàn thành:** 2026-06-21  
**Phạm vi:** Redesign toàn bộ trang customer-facing theo design system CardOn homepage. **Không thay đổi** payment flow, provider, admin, agent, backend business logic.

---

## Design System đã áp dụng

| Token | Giá trị |
|-------|---------|
| Container | `max-width: 1200px`, `margin: auto` (`.site-container`) |
| Padding | Mobile 12px (`px-3`), Tablet/Desktop 16px (`md:px-4`) |
| Primary Blue | `#1E3A8A` (`cardon-navy` / `cardon-primary`) |
| Accent Blue | `#005BEA` |
| Orange | `#FF7A00` |
| Green | `#00B889` |
| Dark | `#0F172A` |
| Background | `#F5F7FA` |
| Border | `#E5E7EB` (`cardon-border`) |
| Font | Inter |

Breakpoints Tailwind: `md` (768px), `lg` (1024px), `xl` (1280px), `2xl` (1440px).

---

## Task Checklist

### TASK 1 — Global Layout ✅

- [x] Header 72px, logo trái, menu giữa (desktop), auth phải
- [x] Menu: Trang chủ, Mua thẻ, Nạp cước, Tin tức, Hướng dẫn, Đại lý
- [x] Mobile: logo + icon thông báo + hamburger
- [x] Bottom nav: Trang chủ, Mua thẻ, Nạp cước, Khuyến mãi, Tài khoản
- [x] Footer giữ USP bar + cột liên kết từ CMS
- [x] `main` có `pb-20` mobile cho bottom nav

**Files:** `Header.tsx`, `MobileBottomNav.tsx`, `Footer.tsx`, `layout.tsx`, `useThemeSettings.ts`, `globals.css`, `tailwind.config.ts`

### TASK 2 — Topup `/nap-cuoc` ✅

- [x] Hero + benefits (Chiết khấu, Tự động 24/7, An toàn)
- [x] Layout 65% / 35% desktop
- [x] Tabs: Nạp điện thoại / Data 3G/4G
- [x] Nhà mạng: logo cards (Viettel, Mobifone, Vinaphone, Vietnamobile)
- [x] Phone input + amount grid (20k–500k)
- [x] Sticky summary: Nhà mạng, SĐT, Mệnh giá, Chiết khấu, Tổng tiền, Payment, Thanh toán
- [x] Mobile: single column + sticky checkout bottom
- [x] **Payment flow giữ nguyên** (orderApi + paymentApi)

**Files:** `app/nap-cuoc/page.tsx`, `components/topup/TopupPageClient.tsx`

### TASK 3 — Blog list `/blog` ✅

- [x] Breadcrumb, search, category pills
- [x] Featured left + grid right (desktop)
- [x] Latest posts grid + pagination
- [x] BlogCard: image, badge, title, excerpt, date

**Files:** `app/blog/page.tsx`, `components/blog/BlogListClient.tsx`, `BlogCard.tsx`

### TASK 4 — Blog detail ✅

- [x] Article layout: title, date, author, thumbnail, content
- [x] Sidebar: related + popular posts
- [x] Schema.org Article + OpenGraph

**Files:** `app/blog/[slug]/page.tsx`

### TASK 5 — Contact `/lien-he` ✅

- [x] Hero "Liên hệ CardOn"
- [x] 2 cột: thông tin liên hệ + form (name, email, phone, subject, message)
- [x] FAQ accordion

**Files:** `app/lien-he/page.tsx`, `components/contact/ContactPageClient.tsx`

### TASK 6 — About `/gioi-thieu` ✅

- [x] Hero, About CardOn, Mission cards, Stats, Why choose us

**Files:** `app/gioi-thieu/page.tsx`, `components/about/AboutPageClient.tsx`

### TASK 7 — Static CMS pages ✅

- [x] Layout: nav trái + content card phải
- [x] Dynamic route `/pages/[slug]` + CMS API `getCmsPage()`
- [x] Fallback nội dung cho: bảo mật, điều khoản, hoàn tiền, hướng dẫn
- [x] Legacy routes redirect sang dynamic slug

**Files:** `app/pages/[slug]/page.tsx`, `StaticPageLayout.tsx`, `lib/static-pages.ts`, `lib/cms-api.ts`

### TASK 8 — 404 ✅

- [x] Custom `not-found.tsx` CardOn style
- [x] Nút "Về trang chủ" + "Mua thẻ ngay"

**Files:** `app/not-found.tsx`

### TASK 9 — Account UI ✅

- [x] Sidebar desktop + tabs scroll mobile
- [x] Subpages: Thông tin, Lịch sử, Thẻ đã mua, Nạp cước, Đổi mật khẩu
- [x] SEO noindex cho `/account`

**Files:** `app/account/layout.tsx`, `AccountLayoutClient.tsx`

### TASK 10 — Responsive Audit ✅ (build-time)

- [x] Container/padding theo spec
- [x] Bottom nav clearance (`pb-20` trên `main`)
- [x] Không dùng width cố định gây overflow ngang

**Manual screenshot checklist** (chạy `npm run dev:web` hoặc stack local):

| Viewport | Trang kiểm tra | Pass |
|----------|----------------|------|
| 375px | `/`, `/nap-cuoc`, `/blog`, `/account` | ☐ |
| 768px | Header, bottom nav, blog grid | ☐ |
| 1280px | Header center nav, topup 65/35, blog featured | ☐ |

### TASK 11 — SEO ✅

- [x] `title`, `description`, `canonical`, OpenGraph trên các trang mới
- [x] CMS metadata qua `buildCmsMetadata()` khi có dữ liệu CMS
- [x] Blog detail: Article schema JSON-LD

**Files:** `lib/seo.ts`, metadata trên từng `page.tsx`

### TASK 12 — Build & Test ✅

```
npm run build:web  → PASS
npm test           → 39/39 suites PASS (384 tests)
```

---

## Shared Components mới

| Component | Mục đích |
|-----------|----------|
| `PageContainer` | Wrapper `.page-shell` thống nhất |
| `Breadcrumb` | Điều hướng breadcrumb |
| `PageHero` | Hero gradient CardOn |
| `StaticPageLayout` | CMS/static pages với sidebar nav |
| `BlogCard` / `BlogListClient` | Blog list UI |
| `TopupPageClient` | Trang nạp cước |
| `ContactPageClient` | Liên hệ + FAQ |
| `AboutPageClient` | Giới thiệu |

---

## Screenshots Checklist (Manual QA)

Chụp màn hình các trang sau khi deploy local/staging:

- [ ] Homepage — header + footer + bottom nav (375px)
- [ ] `/nap-cuoc` — desktop sticky summary + mobile sticky pay bar
- [ ] `/blog` — featured + grid + pagination
- [ ] `/blog/[slug]` — article + sidebar
- [ ] `/lien-he` — form + FAQ accordion
- [ ] `/gioi-thieu` — stats + mission cards
- [ ] `/pages/chinh-sach-bao-mat` — sidebar nav + content
- [ ] `/not-found` — 404 illustration + CTA
- [ ] `/account` — sidebar desktop / tabs mobile

---

## Không thay đổi (theo yêu cầu)

- Payment flow (`orderApi.create`, `paymentApi.create`, gateways SEPAY/MEGAPAY)
- Provider fulfillment
- Admin / Agent apps
- Backend business logic & API contracts

---

## Ghi chú triển khai

1. Menu header/footer mặc định cập nhật trong `DEFAULT_HEADER_MENU` / `DEFAULT_FOOTER_COLUMNS`; CMS theme override vẫn hoạt động.
2. Trang CMS static dùng API `GET /cms/pages/:slug`; fallback HTML khi CMS chưa có nội dung.
3. Form liên hệ hiện chỉ UI client-side (submit hiển thị thông báo); chưa gắn API backend (ngoài phạm vi Phase 6K).
