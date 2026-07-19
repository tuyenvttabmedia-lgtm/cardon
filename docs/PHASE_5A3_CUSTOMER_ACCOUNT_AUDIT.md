# Phase 5A.3 — Customer Account Audit

**Ngày:** 2026-06-20  
**Trạng thái:** ✅ Audit hoàn tất (không thêm feature, không sửa code)  
**Phạm vi:** Kiểm tra tài khoản khách hàng sau Phase 5A.2 — **không đụng payment / provider / agent**

---

## Executive summary

| Check | Kết quả | Ghi chú |
|-------|---------|---------|
| CHECK 1 — Login identifier | ⚠️ **GAP** | Chỉ đăng nhập bằng **email**; username chưa hỗ trợ |
| CHECK 2 — Sensitive data | ✅ PASS | `identityNumberEnc` mã hóa, không API, không log |
| CHECK 3 — Terms agreement | ✅ PASS | Từ chối khi không accept; `acceptedTermsAt` không sửa được |
| CHECK 4 — Password reset | ✅ PASS | Single-use, expiry 1h, revoke refresh tokens |
| CHECK 5 — Email delivery | ✅ PASS | SMTP DB → ENV fallback, BullMQ queue |
| CHECK 6 — Legacy users | ✅ PASS | User cũ `username`/`fullName` null vẫn login email |

**Verification:**

```
npm run build       ✅
npm run build:web   ✅
npm run test:auth   ✅  (4 suites, 44 tests)
```

---

## CHECK 1 — Login identifier

### Yêu cầu audit

Khách hàng đăng nhập bằng **username** hoặc **email**.

### Kết quả: ⚠️ GAP

| Layer | Thực tế |
|-------|---------|
| `LoginDto` | Field `email` có `@IsEmail()` — username không hợp lệ qua validation |
| `AuthService.login()` | `findFirst({ where: { email } })` — chỉ tra email |
| Web `/login` | Input `type="email"`, label "Email" |

### Bằng chứng code

```91:95:src/modules/auth/auth.service.ts
  async login(dto: LoginDto, ipAddress?: string): Promise<AuthResult> {
    const email = dto.email.trim().toLowerCase();
    const user = await this.prisma.user.findFirst({
      where: { email, deletedAt: null },
    });
```

```3:9:src/modules/auth/dto/login.dto.ts
export class LoginDto {
  @IsEmail()
  email!: string;

  @IsString()
  @MinLength(8)
  password!: string;
}
```

### Khuyến nghị (ngoài phạm vi audit)

Phase sau: đổi field login thành `identifier` (email hoặc username), query `OR: [{ email }, { username }]`, cập nhật UI label "Email hoặc tên đăng nhập".

---

## CHECK 2 — Sensitive data (`identityNumberEnc`)

### Kết quả: ✅ PASS

| Tiêu chí | Bằng chứng |
|----------|------------|
| Mã hóa trong DB | `SettingsEncryptionService.encrypt()` — AES-256-GCM; lưu `identity_number_enc` |
| Không trả API | `AuthUserSummary` không có `identityNumber` / `identityNumberEnc`; `toUserSummary()` chỉ expose id, username, fullName, email, role, emailVerified |
| Không log | `auth.service.ts` không log CMND/CCCD; audit metadata login chỉ `reason` (SUSPENDED/BANNED/INVALID_PASSWORD) |

### Luồng mã hóa

```
RegisterDto.identityNumber (plaintext, optional)
  → settingsEncryption.encrypt()
  → users.identity_number_enc (iv:tag:ciphertext base64)
```

### Tests

- `auth-registration.spec.ts` — `encrypt` được gọi; response không có `identityNumberEnc`

---

## CHECK 3 — Terms agreement

### Kết quả: ✅ PASS

| Tiêu chí | Triển khai |
|----------|------------|
| Từ chối khi không accept | `RegisterDto.acceptTerms` — `@IsBoolean()` + `@Equals(true)` |
| `acceptedTermsAt` immutable | Chỉ gán `new Date()` lúc `user.create()`; **không có** endpoint/profile update sửa field này |

### Tests

- `auth-registration.spec.ts` — `acceptTerms = false` → validation error
- Register thành công → `acceptedTermsAt: expect.any(Date)` trong `prisma.user.create`

---

## CHECK 4 — Password reset

### Kết quả: ✅ PASS

| Tiêu chí | Triển khai |
|----------|------------|
| Token single-use | `resetPassword` query `usedAt: null`; sau reset set `usedAt: new Date()` |
| Token expiry | `PASSWORD_RESET_TTL_MS = 60 * 60 * 1000` (1 giờ); query `expiresAt: { gt: new Date() }` |
| Old sessions revoked | Transaction: `refreshToken.updateMany({ revokedAt: new Date() })` cho mọi token active của user |
| Token không lộ API | `forgotPassword` trả message generic; token chỉ gửi qua email queue |
| Token hashed | Lưu `tokenHash` (SHA-256), không plaintext |

### Tests (`auth-security.audit.spec.ts` — CHECK 5)

- `stores reset token hashed, not plain text`
- `rejects expired reset token`
- `marks reset token single-use and revokes all refresh tokens`
- `CHECK L-02` — không log reset token trong source / production

---

## CHECK 5 — Email delivery

### Kết quả: ✅ PASS

| Tiêu chí | Luồng |
|----------|-------|
| SMTP Admin Settings | `SettingsStoreService.resolveSmtpConfig()` — đọc DB trước |
| Fallback ENV | `smtp.host`, `smtp.port`, `smtp.user`, `smtp.pass`, `smtp.from` từ `ConfigService` |
| Notification queue | `NotificationService.notifyUserRegister` / `notifyPasswordReset` → `NotificationQueueProducer.enqueue()` → BullMQ `notification_queue` (retry exponential) |
| Dispatch | Worker → `NotificationDispatchService.resolveEmailProvider()` — DB SMTP → ENV host → `MockEmailProvider` |

### Luồng đăng ký / reset

```
AuthService.register / forgotPassword
  → NotificationService.notify*
  → NotificationQueueProducer.enqueue (BullMQ)
  → NotificationDispatchService.dispatchEmail
  → SmtpEmailProvider (resolveSmtpConfig) hoặc Mock
```

### Tests liên quan

- `notification.service.spec.ts` — enqueue USER_REGISTER, PASSWORD_RESET template, SMTP retry
- `auth-registration.spec.ts` — `notifyPasswordReset` được gọi, response không chứa token

---

## CHECK 6 — Existing users migration

### Kết quả: ✅ PASS

| Tiêu chí | Bằng chứng |
|----------|------------|
| Schema backward-compatible | Migration `20250620120000_user_customer_profile`: `username`, `full_name` **nullable**; unique index partial `WHERE username IS NOT NULL` |
| Login user cũ | Login chỉ cần `email` + password — không phụ thuộc username |
| Response an toàn | `toUserSummary`: `username: user.username ?? null`, `fullName: user.fullName ?? null` |

User cũ (trước 5A.2) có `username = null`, `fullName = null`, `acceptedTermsAt = null` vẫn đăng nhập bình thường bằng email.

**Lưu ý:** Chưa có test riêng cho legacy user; hành vi suy ra từ code path và schema nullable.

---

## Verification log

```
npm run build       ✅  nest build
npm run build:web   ✅  13 routes
npm run test:auth   ✅

Test Suites: 4 passed, 4 total
Tests:       44 passed, 44 total
```

| Suite | Tests |
|-------|-------|
| `auth.service.spec.ts` | register, login, refresh, logout |
| `auth-registration.spec.ts` | validation, encrypt, forgot/reset |
| `auth-security.audit.spec.ts` | refresh, password reset, audit, throttle |
| `permission-cache.service.spec.ts` | RBAC cache |

---

## Findings & recommendations

### Finding F-5A3-01 (Medium): Username login chưa triển khai

- **Hiện trạng:** Chỉ email login (backend + frontend).
- **Impact:** User mới có username nhưng không thể dùng để đăng nhập.
- **Đề xuất:** Phase 5A.4 hoặc patch nhỏ — `identifier` field + OR query + UI label.

### Không có finding bảo mật critical

- CMND/CCCD, terms, password reset, email queue đều đạt yêu cầu audit.

---

## Files tham chiếu chính

| File | Vai trò |
|------|---------|
| `src/modules/auth/auth.service.ts` | register, login, forgot/reset password |
| `src/modules/auth/dto/login.dto.ts` | Login validation |
| `src/modules/auth/dto/register.dto.ts` | Terms + profile fields |
| `src/modules/auth/interfaces/auth-result.interface.ts` | API response shape |
| `src/modules/settings/services/settings-encryption.service.ts` | AES-256-GCM |
| `src/modules/notification/services/notification.service.ts` | Enqueue emails |
| `src/modules/notification/services/notification-dispatch.service.ts` | SMTP resolve |
| `src/modules/settings/services/settings-store.service.ts` | `resolveSmtpConfig()` |
| `prisma/migrations/20250620120000_user_customer_profile/` | Nullable profile columns |

---

## Kết luận

Audit Phase 5A.3 hoàn tất. Hệ thống tài khoản khách hàng **đạt 5/6 check**; duy nhất **login bằng username chưa có** (CHECK 1). Build và auth tests pass. Không thay đổi code trong phase này.
