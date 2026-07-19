# Phase 5A.2 — Customer Account Polish

**Ngày:** 2026-06-20  
**Trạng thái:** ✅ Hoàn thành  
**Phạm vi:** Cải thiện trải nghiệm tài khoản khách hàng — **không đổi payment / provider / agent logic**

---

## Tóm tắt

Mở rộng đăng ký khách hàng (backend + UI), thêm quên/đặt lại mật khẩu trên web, Việt hóa email templates, bảo mật CMND/CCCD mã hóa.

---

## TASK 1 — Customer registration (backend)

### Schema (`users`)

| Cột | Ghi chú |
|-----|---------|
| `username` | Unique (nullable cho user cũ) |
| `full_name` | Họ tên |
| `phone` | Đã có, bắt buộc khi đăng ký |
| `identity_number_enc` | AES-256-GCM qua `SettingsEncryptionService` |
| `accepted_terms_at` | Timestamp khi `acceptTerms=true` |

Migration: `prisma/migrations/20250620120000_user_customer_profile/`

### `RegisterDto`

- `username`, `fullName`, `email`, `phone`, `password`, `confirmPassword`
- `identityNumber` (optional, 9–12 chữ số)
- `acceptTerms` (required, `@Equals(true)`)

### Validation rules

| Rule | Triển khai |
|------|------------|
| Username unique | `ConflictException` |
| Email unique | `ConflictException` |
| Phone format | `^(\+84\|0)[0-9]{9,10}$` |
| Terms required | DTO + service |
| confirmPassword | `@Match('password')` |

---

## TASK 2 — Register UI

**Route:** `/register`

- Form đầy đủ field tiếng Việt
- Link: [Điều khoản sử dụng](/pages/dieu-khoan-su-dung), [Chính sách bảo mật](/pages/chinh-sach-bao-mat)
- Header + login có link Đăng ký

Files: `apps/web/app/register/*`, `apps/web/app/pages/dieu-khoan-su-dung/page.tsx`

---

## TASK 3 — Forgot / Reset password UI

| Route | API |
|-------|-----|
| `/forgot-password` | `POST /auth/forgot-password` |
| `/reset-password?token=...` | `POST /auth/reset-password` |

Login có link "Quên mật khẩu?" và thông báo sau reset thành công.

---

## TASK 4 — Email templates

| Template | Nội dung |
|----------|----------|
| `USER_REGISTER` | Chào mừng tiếng Việt + link xác minh |
| `PASSWORD_RESET` | Đặt lại mật khẩu tiếng Việt |
| `CARD_DELIVERY` | Thông báo thẻ + cảnh báo bảo mật |

**SMTP Admin Settings:** `NotificationDispatchService.resolveEmailProvider()` ưu tiên `SettingsStoreService.resolveSmtpConfig()` trước ENV.

---

## TASK 5 — Security

| Yêu cầu | Trạng thái |
|---------|------------|
| Không expose `identityNumber` | ✅ Chỉ lưu `identityNumberEnc`; `AuthUserSummary` không có field này |
| Không expose reset token trong API | ✅ Token chỉ trong email; forgot response generic |
| Không log email secrets | ✅ Pattern audit giữ nguyên |

---

## TASK 6 — Tests

```
npm run build       ✅
npm run build:web   ✅
npm run test:auth   ✅
```

**Files:**

- `src/modules/auth/auth-registration.spec.ts` — validation, terms, encrypt, forgot/reset
- `src/modules/auth/auth.service.spec.ts` — updated register mock
- `src/modules/auth/auth-security.audit.spec.ts` — constructor mock fix

---

## API không đổi (payment / provider / agent)

- Payment webhook & checkout flow: không sửa
- Provider adapters/workers: không sửa
- Agent module: không sửa

---

## Triển khai

1. Chạy migration: `prisma migrate deploy` (hoặc `migrate dev` local)
2. `npx prisma generate`
3. Rebuild web container nếu dùng Docker

**Dừng sau polish** — không deploy production.
