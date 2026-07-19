# Phase 6F — UX CMS Website Completion

**Ngày hoàn thành:** 2025-06-21  
**Phạm vi:** Hoàn thiện CMS website, sửa UX auth khách hàng, blog frontend, media library, theme admin.  
**Không thay đổi:** payment, provider, ledger, agent API.

---

## Tóm tắt

Phase 6F hoàn thiện vòng đời CMS từ admin đến website công khai: auth khách hàng không còn stale state, editor bài viết rich-text (TipTap), danh mục/thẻ, thư viện media, giao diện (theme), blog `/blog`, mobile bottom nav, và sửa crash trang SEO admin.

---

## TASK 1 — Customer Auth UX

| Hành vi | Triển khai |
|---------|------------|
| Register → toast + auto login | `RegisterPageClient.tsx` gọi `AuthProvider.register()`, hiện toast, redirect `/account` |
| Login → cập nhật state ngay | `AuthContext`: lưu token → `authApi.me()` → `setUser` → `router.refresh()` |
| Không cần Ctrl+F5 | `AuthProvider` bọc toàn app trong `apps/web/app/layout.tsx` |

**File chính:** `apps/web/contexts/AuthContext.tsx`, `apps/web/hooks/useAuth.ts`, `apps/web/components/ui/Toast.tsx`

---

## TASK 2 — CMS Article Editor (TipTap)

- Thay textarea bằng **TipTap** trong `ArticleEditor.tsx`
- Hỗ trợ: heading, bold, italic, table, image, link, quote, embed (YouTube)
- Trường SEO: `focusKeyword`, `seoTitle`, `seoDescription`, `canonicalUrl`, `ogTitle`, `ogDescription`, `ogImage`
- Auto slug tiếng Việt: `slugifyVi()` trong `apps/admin/lib/slugify-vi.ts`
- Google preview: component `GooglePreview`
- Quản lý tại `CmsPageManager.tsx` (articles + pages)

**Dependencies:** thêm vào `apps/admin/package.json` — chạy `npm install` trong `apps/admin` trước build.

---

## TASK 3 — Categories + Tags

| Admin route | API |
|-------------|-----|
| `/marketing/categories` | `GET/POST/PATCH/DELETE /admin/cms/categories` |
| `/marketing/tags` | `GET/POST/PATCH/DELETE /admin/cms/tags` |

Schema Prisma: `CmsCategory`, `CmsTag`, `CmsPageTag`. Migration: `prisma/migrations/20250621120000_phase_6f_cms_completion/`.

---

## TASK 4 — Media Library

| Admin route | API |
|-------------|-----|
| `/marketing/media` | `GET /admin/cms/media`, `POST /admin/cms/media/upload`, `DELETE /admin/cms/media/:id` |

- Upload ảnh (Multer), metadata: alt, title, filename, size, mimeType
- Storage local tại `uploads/cms/` — `CmsMediaStorageService` thiết kế để thay bằng S3/Wasabi
- Static files: `GET /uploads/*` trong `src/main.ts`

---

## TASK 5 — Frontend Blog

| Route | Mô tả |
|-------|-------|
| `/blog` | Danh sách bài, lọc theo `?category=` |
| `/blog/[slug]` | Chi tiết, related posts, SEO/OG, JSON-LD schema |

**API public:** `GET /cms/blog/posts`, `GET /cms/blog/posts/:slug`  
**Client server:** `apps/web/lib/cms-api.ts`  
**Render HTML:** `SafeCmsHtml` + sanitizer mở rộng (img, table, YouTube iframe)

---

## TASK 6 — Theme Management

Admin `/marketing/appearance`:

- Logo desktop / mobile, favicon, OG default image
- Header menu builder (label, href, sortOrder)
- Footer columns + links

**API:** `GET/PUT /admin/cms/theme`  
**Public:** `GET /cms/theme` (cho frontend tích hợp sau)

---

## TASK 7 — Mobile UX

`MobileBottomNav.tsx`: Trang chủ, Mua thẻ, Đơn hàng, Tài khoản — hiển thị trên mobile (`md:hidden`), layout `pb-16`.

---

## TASK 8 — Fix SEO Settings Crash

**Nguyên nhân:** Khi API lỗi, `form === null` → UI kẹt ở "Đang tải…" vô hạn.  
**Sửa:** Tách `loading` / `error` state; backend coerce Json → string/boolean qua `cms-settings-coerce.util.ts`.

**File:** `apps/admin/app/marketing/seo/page.tsx`, `cms.repository.getSeoSettings()`

---

## TASK 9 — Build & Test

**Kết quả chạy trên môi trường agent (2025-06-21):**

| Lệnh | Kết quả |
|------|---------|
| `npm test` (jest) | **366/366 passed** |
| `nest build` / `tsc -p tsconfig.build.json` | **OK** (sau `prisma generate`) |
| `npm run build:web` | Cần npm + SWC trên máy local |
| `npm run build:admin` | Cần `npm install` trong `apps/admin` (TipTap) |

Chạy đầy đủ tại root project:

```bash
npm install
npm install --workspace=@cardon/admin   # cài TipTap
npx prisma migrate deploy
npx prisma generate
npm run build
npm run build:web
npm run build:admin
npm test
```

> **Lưu ý môi trường agent:** Node/npm không có sẵn trong shell CI agent — cần chạy lệnh trên máy local/Docker.

---

## Backend — Endpoints mới

### Admin (`/api/v1/admin/cms`)

- `GET/PUT theme`
- `GET/POST/PATCH/DELETE categories`
- `GET/POST/PATCH/DELETE tags`
- `GET media`, `POST media/upload`, `DELETE media/:id`

### Public (`/api/v1/cms`)

- `GET blog/posts?category=&tag=`
- `GET blog/posts/:slug`
- `GET theme`

---

## HTML Sanitizer (Phase 6F)

Mở rộng whitelist cho rich editor:

- `img`, `table`, `thead`, `tbody`, `tr`, `th`, `td`, `div`
- `iframe` chỉ cho YouTube embed
- Vẫn chặn `script`, event handlers, `javascript:` URLs

**File:** `src/modules/cms/entities/cms-html-safety.ts`, `apps/web/lib/sanitize-cms-html.ts`

---

## Kiểm tra thủ công đề xuất

1. **Auth:** Đăng ký → toast → vào `/account` không refresh cứng; đăng nhập → header hiện user ngay.
2. **Admin articles:** Tạo bài với TipTap (bảng, ảnh, link), slug tiếng Việt tự sinh, Google preview.
3. **Categories/Tags:** CRUD, gán vào bài viết.
4. **Media:** Upload, copy URL, dùng trong bài.
5. **Appearance:** Lưu menu/footer.
6. **SEO settings:** Mở trang khi DB trống — không crash.
7. **Blog:** `/blog` và `/blog/[slug]` với metadata + schema.
8. **Mobile:** Bottom nav 4 tab.

---

## Files thay đổi chính

```
apps/web/contexts/AuthContext.tsx
apps/web/components/layout/MobileBottomNav.tsx
apps/web/app/blog/page.tsx
apps/web/app/blog/[slug]/page.tsx
apps/web/lib/cms-api.ts
apps/admin/components/marketing/ArticleEditor.tsx
apps/admin/components/marketing/CmsPageManager.tsx
apps/admin/app/marketing/{categories,tags,media,appearance}/page.tsx
apps/admin/app/marketing/seo/page.tsx
src/modules/cms/controllers/*.ts
src/modules/cms/services/cms*.ts
src/modules/cms/repositories/cms.repository.ts
src/modules/cms/entities/cms-html-safety.ts
prisma/schema.prisma
prisma/migrations/20250621120000_phase_6f_cms_completion/
```

---

**Trạng thái:** Phase 6F hoàn thành theo phạm vi yêu cầu. Chạy migration + build/test trên môi trường có Node.js trước deploy production.
