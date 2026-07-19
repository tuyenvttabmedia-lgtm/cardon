# Phase 6H.2 — Production Services Completion

**Ngày:** 2026-06-21  
**Phạm vi:** Hoàn thiện SMTP thật + Thư viện Media local trước VPS launch. **Không đổi** payment / provider / ledger / checkout / business logic. **Không thêm** S3 / Wasabi / cloud storage.

---

## Executive summary

| Task | Kết quả |
|------|---------|
| 1 — SMTP real (nodemailer) | ✅ PASS |
| 2 — Admin SMTP test (no fake success) | ✅ PASS |
| 3 — Notification retry | ✅ PASS (existing BullMQ 3 attempts) |
| 4 — Local upload folders | ✅ PASS |
| 5 — Media Manager admin UI | ✅ PASS |
| 6 — Image optimization | ✅ PASS (compress + 300px thumb) |
| 7 — Docker volume persistence | ✅ PASS |
| 8 — Upload security | ✅ PASS |
| 9 — CMS integration + TipTap picker | ✅ PASS |
| 10 — Tests + build | ✅ PASS |

**Verdict:** ✅ **PASS** — SMTP và Media Library sẵn sàng production local.

---

## TASK 1 — SMTP Real Implementation

### Thay đổi

`SmtpEmailProvider` dùng **nodemailer** — không còn stub `deliver()`.

| Tính năng | Chi tiết |
|-----------|----------|
| Transport | nodemailer SMTP (Brevo / Zoho / Gmail / custom) |
| Config priority | 1. Admin Settings DB → 2. ENV fallback |
| ENV keys | `SMTP_HOST`, `SMTP_PORT`, `SMTP_USER`, `SMTP_PASS`/`SMTP_PASSWORD`, `SMTP_FROM`/`SMTP_FROM_EMAIL`, `SMTP_FROM_NAME`, `SMTP_SECURE` |
| Email format | HTML + plain text, UTF-8 |
| Attachments | `SendEmailParams.attachments` ready |
| Logging | Không log password / token / PIN (existing `notification-log-safety`) |
| Cache | `clearTransporterCache()` khi admin reload/update SMTP |

### Files

- `src/modules/notification/providers/smtp-email.provider.ts`
- `src/modules/settings/services/settings-store.service.ts` (+ `fromName`)
- `src/config/configuration.ts`

---

## TASK 2 — Admin SMTP Test

**Admin → Cài đặt → SMTP**

| UI | API |
|----|-----|
| Nút **「Gửi email thử」** | `POST /admin/settings/smtp/test` |
| Input email test | Trả `ok: true, messageId` hoặc `BadRequestException` với lỗi SMTP thật |

Không còn fake success (`messageId: smtp-*` khi không gửi).

---

## TASK 3 — Notification Reliability

| Hạng mục | Trạng thái |
|----------|------------|
| `notification_queue` retry | ✅ `NOTIFICATION_MAX_ATTEMPTS=3`, exponential backoff 5s |
| SMTP fail → throw | ✅ `NotificationDispatchService` throw → BullMQ retry |
| Failed jobs retained | ✅ `removeOnFail: 5000` |
| Payment/order/provider rollback | ✅ Không rollback (email async qua queue) |

Verified: `notification.service.spec.ts`, `smtp-email.provider.spec.ts`

---

## TASK 4 — Local Media Library Structure

```
uploads/
├── logo/
├── favicon/
├── banners/
├── products/
├── articles/
├── general/
└── {folder}/thumbs/   ← thumbnail 300px webp
```

Static serve: `main.ts` → `/uploads/*`

---

## TASK 5 — Media Manager (Admin)

**Marketing → Thư viện ảnh** (`/marketing/media`)

| Feature | Status |
|---------|--------|
| Upload theo thư mục | ✅ |
| Preview + thumbnail | ✅ |
| Copy URL | ✅ |
| Delete | ✅ |
| Search | ✅ |
| Filter folder / mime | ✅ |
| Metadata | filename, size, dimensions, upload date |

**MediaLibraryPicker** — modal chọn ảnh dùng chung cho CMS.

---

## TASK 6 — Image Optimization

| Step | Implementation |
|------|----------------|
| Safe filename | SHA256 hash + timestamp |
| JPEG compress | quality 85 mozjpeg |
| PNG compress | compressionLevel 8 |
| Thumbnail | 300px fit inside → webp trong `thumbs/` |
| WebP optional | `CMS_MEDIA_GENERATE_WEBP=true` tạo thêm bản webp |
| SVG | Giữ nguyên, không rasterize |

---

## TASK 7 — Docker Persistence

### Volume

```yaml
volumes:
  - cardon_uploads:/app/uploads
```

Applied: `docker-compose.production.yml`, `docker-compose.local-full.yml`

### Backup

```bash
./scripts/backup-uploads.sh
# → backups/cardon_uploads_YYYYMMDD_HHMMSS.tar.gz
```

### Dockerfile

`vips` package cho sharp trên Alpine.

---

## TASK 8 — Security

| Rule | Implementation |
|------|----------------|
| Allowed | jpg, jpeg, png, webp, svg |
| Blocked | php, js, html, exe, sh, bat… |
| Validation | MIME + extension match |
| Max size | 5MB default (`MEDIA_MAX_BYTES` configurable) |
| Path traversal | `resolveUploadPath()` guard |

Tests: `media-upload.security.spec.ts`

---

## TASK 9 — CMS Integration

| Surface | Media picker folder |
|---------|---------------------|
| Article TipTap ảnh | `articles` |
| Featured / OG image | `articles` |
| Appearance logo | `logo` |
| Favicon | `favicon` |
| OG default | `banners` |
| Banner image | `banners` |

---

## TASK 10 — Tests & Build

```text
nest build                              ✅ PASS
npm run build:admin                     ✅ PASS
jest (full suite)                       ✅ PASS (39 suites, 384 tests)
jest smtp + media subset                ✅ 23/23
```

New tests:

- `smtp-email.provider.spec.ts`
- `media-upload.security.spec.ts`
- `cms-media.service.spec.ts`
- `cms-media-storage.service.spec.ts`

### Migration

`20250621160000_cms_media_library` — thêm `folder`, `width`, `height`, `thumbnail_url` trên `cms_media`.

---

## VPS checklist

```text
[ ] Cấu hình SMTP thật (Brevo/Zoho/Gmail) trong Admin Settings
[ ] Gửi email thử → verify inbox
[ ] Register / forgot password / card delivery email
[ ] docker volume cardon_uploads mounted
[ ] Upload logo/favicon/banner → restart container → URL vẫn OK
[ ] ./scripts/backup-uploads.sh trong cron backup
[ ] prisma migrate deploy (migration 6H.2)
```

---

## Kết luận

Phase 6H.2 hoàn tất gap từ Phase 6H.1:

1. **SMTP deliver thật** qua nodemailer  
2. **Media Library local** persistent với Docker volume, optimization, admin UI, CMS picker  

Sẵn sàng deploy VPS với credentials SMTP thật và volume `cardon_uploads`.
