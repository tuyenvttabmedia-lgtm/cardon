# Phase 5A.4 — Login Identifier Support

**Ngày:** 2026-06-20  
**Trạng thái:** ✅ Hoàn thành  
**Phạm vi:** Sửa F-5A3-01 — đăng nhập bằng email **hoặc** username. **Không đổi** registration, password reset, JWT/session, payment/provider/agent.

---

## Tóm tắt

| Hạng mục | Thay đổi |
|----------|----------|
| `LoginDto` | `email` → `identifier` (string bắt buộc, không `@IsEmail`) |
| `AuthService.login` | Tra cứu `OR: [{ email }, { username }]`, lowercase |
| Web `/login` | Label "Email hoặc tên đăng nhập", input `type="text"` |
| Admin / Partner | API body `{ identifier: email, password }` — email login vẫn hoạt động |
| Bảo mật | Message lỗi giữ nguyên: `Invalid email or password` |

---

## TASK 1 — Backend `LoginDto`

**File:** `src/modules/auth/dto/login.dto.ts`

```typescript
export class LoginDto {
  @IsString()
  @MinLength(1)
  identifier!: string;

  @IsString()
  @MinLength(8)
  password!: string;
}
```

---

## TASK 2 — `AuthService.login`

**File:** `src/modules/auth/auth.service.ts`

```typescript
const identifier = dto.identifier.trim().toLowerCase();
const user = await this.prisma.user.findFirst({
  where: {
    deletedAt: null,
    OR: [{ email: identifier }, { username: identifier }],
  },
});
```

Giữ nguyên: bcrypt verify, status check (SUSPENDED/BANNED), audit log, refresh token rotation.

---

## TASK 3 — Customer Web Login

**File:** `apps/web/app/login/LoginPageClient.tsx`

- Label: **Email hoặc tên đăng nhập**
- Input: `type="text"`, `autoComplete="username"`
- API: `authApi.login(identifier, password)` → `{ identifier, password }`

---

## TASK 4 — Admin / Partner compatibility

Admin và Partner vẫn nhập email trên UI; `api-client` gửi:

```typescript
body: { identifier: email, password }
```

| Portal | Login field UI | Backend |
|--------|----------------|---------|
| Web | Email hoặc username | ✅ |
| Admin | Email (`superadmin@cardon.vn`) | ✅ |
| Partner | Email (agent email) | ✅ |

Không đổi UI Admin/Partner — chỉ mapping field API.

---

## TASK 5 — Security

| Trường hợp | Message |
|------------|---------|
| User không tồn tại | `Invalid email or password` |
| Sai mật khẩu | `Invalid email or password` |
| SUSPENDED / BANNED | Giữ nguyên (403, không tiết lộ identifier tồn tại hay không) |

Không phân biệt "email không tồn tại" vs "username không tồn tại".

---

## TASK 6 — Tests

**File:** `src/modules/auth/auth.service.spec.ts`

| Test | Kết quả |
|------|---------|
| Login với email | ✅ PASS |
| Login với username (case insensitive) | ✅ PASS |
| Username sai | ✅ FAIL generic message |
| User suspended | ✅ vẫn bị chặn |

Cập nhật `auth-security.audit.spec.ts` — dùng `identifier` thay `email`.

---

## Verification

```
npm run build       ✅
npm run build:web   ✅
npm run build:admin ✅
npm run test:auth   ✅

Test Suites: 4 passed, 4 total
Tests:       46 passed, 46 total
```

(+2 tests so với Phase 5A.3: username login + unknown username)

---

## Files thay đổi

| File | Loại |
|------|------|
| `src/modules/auth/dto/login.dto.ts` | DTO |
| `src/modules/auth/auth.service.ts` | Login lookup |
| `src/modules/auth/auth.service.spec.ts` | Tests |
| `src/modules/auth/auth-security.audit.spec.ts` | Tests |
| `apps/web/app/login/LoginPageClient.tsx` | UI |
| `apps/web/services/api-client.ts` | API body |
| `apps/admin/services/api-client.ts` | API body |
| `apps/partner/services/api-client.ts` | API body |

**Không thay đổi:** register, forgot/reset password, JWT, refresh rotation, payment, provider, agent.

---

## Kết luận

Finding **F-5A3-01** đã được xử lý. Khách hàng có thể đăng nhập bằng email hoặc username; Admin/Partner login bằng email không bị ảnh hưởng.
