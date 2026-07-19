# Phase 5C.5 — Admin System Settings

**Ngày:** 2026-06-20  
**Trạng thái:** ✅ Hoàn thành  
**Phạm vi:** Cấu hình vận hành qua Admin UI, lưu DB mã hóa, fallback ENV — **không đổi payment flow / provider logic**.

---

## Tóm tắt

Phase 5C.5 chuyển cấu hình MegaPay, SePay, eSale, SMTP và System sang Admin UI. Secret lưu AES-256-GCM trong bảng `system_settings` (model `SystemSetting` có sẵn). API chỉ trả mask `********123`. Chỉ **SUPER_ADMIN** truy cập. Audit action `SETTING_UPDATED`.

---

## TASK 1 — Menu Cài đặt

| Mục | Route |
|-----|-------|
| Cài đặt (nav) | `/settings/payment` |
| Payment Gateways | `/settings/payment` |
| Providers | `/settings/providers` |
| SMTP | `/settings/smtp` |
| System | `/settings/system` |

- Nav: `apps/admin/lib/permissions.ts` — `roles: ['SUPER_ADMIN']`
- Sub-nav: `apps/admin/components/settings/SettingsNav.tsx`

---

## TASK 2 — Payment Gateway Settings

**MegaPay & SePay**

| Field | Ghi chú |
|-------|---------|
| enabled | Metadata admin |
| environment | sandbox / production |
| credentials | Mã hóa DB (`secretKeyEnc`, `apiKeyEnc`, …) |
| webhook | `webhookUrl`, `webhookSecretEnc` |

**Backend**

- Keys: `settings.payment.megapay`, `settings.payment.sepay`
- Resolver: `SettingsStoreService.resolveMegapayConfig()` / `resolveSepayConfig()`
- Config services delegate: `MegapayConfigService`, `SepayConfigService`

---

## TASK 3 — Provider Settings (eSale)

| Field | Ghi chú |
|-------|---------|
| enabled, environment | Metadata |
| cardApiUrl, topupApiUrl | URL API |
| agencyCode, clientCode | Mã đối tác |
| secretKey, privateKey, publicKey | Mã hóa DB |

**Actions (API)**

- `POST /admin/settings/provider/esale/test-connection`
- `POST /admin/settings/provider/esale/check-balance`
- `POST /admin/settings/provider/esale/sync-products`

---

## TASK 4 — SMTP Settings

| Field | Ghi chú |
|-------|---------|
| host, port, username, password, from, secure | password mã hóa |
| Test email | `POST /admin/settings/smtp/test` `{ to }` |

`SmtpEmailProvider` đọc config qua `SettingsStoreService.resolveSmtpConfig()`.

---

## TASK 5 — Security

| Yêu cầu | Triển khai |
|---------|------------|
| AES-256-GCM | `SettingsEncryptionService` (key từ `ENCRYPTION_KEY`) |
| Hiển thị mask | `********` + 3 ký tự cuối |
| Audit | `SETTING_UPDATED` + metadata `{ settingKey, updatedFields }` |
| Quyền | `@Roles(UserRole.SUPER_ADMIN)` trên `SettingsAdminController` |

---

## TASK 6 — Fallback DB → ENV

Thứ tự trong `SettingsStoreService`:

1. Giá trị DB (nếu key tồn tại và có dữ liệu)
2. ENV qua `ConfigService` (`configuration.ts`)

Admin view có `source: 'database' | 'environment'`.

---

## TASK 7 — Tests & Build

```text
npm run build          ✅
npm run build:admin    ✅ (routes /settings/*)
npm test -- --testPathPattern=settings.security  ✅ 7/7
```

**File test:** `src/modules/settings/settings.security.spec.ts`

- Mã hóa / giải mã / mask
- Fallback ENV
- Reload gateway (MegaPay) từ DB
- Reload provider (eSale) từ DB
- Permission SUPER_ADMIN

---

## Cấu trúc file chính

```
src/modules/settings/
  settings.module.ts              @Global
  entities/settings.constants.ts
  services/settings-encryption.service.ts
  services/settings-store.service.ts
  repositories/settings.repository.ts
  settings.security.spec.ts

src/modules/admin/
  controllers/settings-admin.controller.ts
  services/settings-admin.service.ts
  dto/settings.dto.ts

apps/admin/
  app/settings/payment/page.tsx
  app/settings/providers/page.tsx
  app/settings/smtp/page.tsx
  app/settings/system/page.tsx
  components/settings/SettingsNav.tsx
```

---

## API Endpoints (SUPER_ADMIN)

| Method | Path |
|--------|------|
| GET/PUT | `/admin/settings/payment/megapay` |
| GET/PUT | `/admin/settings/payment/sepay` |
| POST | `/admin/settings/payment/reload` |
| GET/PUT | `/admin/settings/provider/esale` |
| POST | `/admin/settings/provider/esale/test-connection` |
| POST | `/admin/settings/provider/esale/check-balance` |
| POST | `/admin/settings/provider/esale/sync-products` |
| GET/PUT | `/admin/settings/smtp` |
| POST | `/admin/settings/smtp/test` |
| GET/PUT | `/admin/settings/system` |
| POST | `/admin/settings/reload` |

---

## Ràng buộc đã tuân thủ

- ✅ Không đổi payment flow (registry, webhook handlers giữ nguyên)
- ✅ Không đổi provider business logic (adapter/worker giữ nguyên)
- ✅ Không migration schema mới (dùng `SystemSetting`)
- ✅ Dừng sau settings — không deploy production

---

## Kiểm tra thủ công (local)

1. Login `superadmin@cardon.vn` tại http://admin.localhost
2. Menu **Cài đặt** → Payment / Providers / SMTP / System
3. Lưu cấu hình → kiểm tra audit log action `SETTING_UPDATED`
4. User ADMIN/SUPPORT không thấy menu và nhận 403 nếu gọi API trực tiếp
5. Rebuild admin container nếu dùng Docker: `docker compose ... build --no-cache admin`

---

## Ghi chú

- PEM keys (eSale) hiển thị mask `***********` (không lộ nội dung)
- SMTP `deliver()` vẫn là transport hook (stub) — test email xác nhận cấu hình + gọi provider, chưa gửi SMTP thật qua nodemailer
- System thresholds lưu DB; runtime provider health vẫn đọc ENV trừ khi mở rộng sau
