# Phase 6H — Production Simulation Audit

**Ngày:** 2026-06-21  
**Phạm vi:** Xác minh production-like trước VPS deploy. **Không thêm feature.** Không đổi business logic / UI / schema.  
**Stack:** `docker-compose.production.yml` + `docker-compose.local-production.yml` + `.env.local-production`  
**Verdict tổng thể:** **PASS có điều kiện** — stack production sim boot OK, payment SePay + settings runtime OK, build/test PASS. **Blocker VPS:** credentials eSale sandbox thật + SMTP thật + volume media persistent.

---

## Executive summary

| Task | Kết quả | Ghi chú |
|------|---------|---------|
| 1 — Production ENV simulation | ✅ PASS | `APP_ENV=production`, api/worker split, `ESALE_USE_MOCK=false` |
| 2 — Admin settings runtime | ✅ PASS | MegaPay DB override live; SePay/eSale/SMTP readable; jest đầy đủ |
| 3 — Real eSale sandbox | ⚠️ PARTIAL | `provider_transaction` + `provider_transaction_date` OK; order **WAITING_ADMIN_RETRY** |
| 4 — Payment sandbox | ✅ PASS | SePay QR/webhook/duplicate; MegaPay signature qua jest; admin trace OK |
| 5 — SMTP test | ⚠️ PARTIAL | Queue chạy; host giả `smtp.local-sim.invalid`; cần Brevo/Zoho/Gmail trên VPS |
| 6 — Media storage | ⚠️ PARTIAL | Code local disk OK; **chưa mount volume** uploads trong compose |
| 7 — Backup restore drill | ✅ PASS | pg_dump → restore test DB → verify counts → drop |
| 8 — Security smoke | ✅ PASS | 369 jest + log scan; permissions covered in spec |
| 9 — Build & test | ✅ PASS | `nest build` + jest 369/369 + Docker frontend builds |

---

## Cách chạy stack audit

```powershell
cd C:\Users\MyHome\Projects\cardon

# Dừng local-full nếu đang chiếm port 80
docker compose -f docker-compose.local-full.yml down

# Production sim
docker compose `
  -f docker-compose.production.yml `
  -f docker-compose.local-production.yml `
  --env-file .env.local-production `
  up -d --build

# Bootstrap (one-time, không seed production)
docker exec -e LOCAL_ADMIN_EMAIL=superadmin@cardon.vn `
  -e LOCAL_ADMIN_PASSWORD=ChangeMe123! `
  cardon-prod-api node --experimental-strip-types /app/scripts/create-admin-local.ts

docker exec cardon-prod-api node --experimental-strip-types /app/scripts/create-smoke-data.ts
```

**URLs:** http://localhost · http://admin.localhost · http://partner.localhost

---

## TASK 1 — Production ENV Simulation

### Containers (2026-06-21)

| Container | Status | Role / ghi chú |
|-----------|--------|----------------|
| cardon-prod-postgres | healthy | host port **5433** |
| cardon-prod-redis | healthy | AOF enabled |
| cardon-prod-api | healthy | `APP_ENV=production`, `APP_ROLE=api` |
| cardon-prod-worker | healthy | `APP_ROLE=worker`, heartbeat OK |
| cardon-prod-web / admin / partner | healthy | Next.js production build |
| cardon-prod-nginx | healthy | port **80** |

### Env xác minh

```
APP_ENV=production
APP_ROLE=api | worker
ESALE_USE_MOCK=false
```

### Health

| Endpoint | Kết quả |
|----------|---------|
| `/health` | `app/database/redis/workers: ok` |
| `/health/ready` | `ready: true` |

### Migrations

12 migrations — database schema up to date (Phase 6F CMS + order client trace included).

**Verdict:** ✅ PASS

---

## TASK 2 — Admin Settings Runtime Config

### Live API (không restart container)

| Provider | Test | Kết quả |
|----------|------|---------|
| MegaPay | `PUT /admin/settings/payment/megapay` → `POST /admin/settings/reload` | ✅ `merchantId` đổi `local-megapay-merchant` → `DB-RUNTIME-*` |
| SePay | `GET /admin/settings/payment/sepay` | ✅ `source=environment`, bank fields populated |
| eSale | `GET /admin/settings/provider/esale` | ✅ `configured=true`, `source=environment` |
| SMTP | `GET /admin/settings/smtp` | ✅ `host=smtp.local-sim.invalid` |

### Unit tests (reload không restart)

| Suite | Coverage |
|-------|----------|
| `settings.security.spec.ts` | DB override ENV, AES-256-GCM encrypt, mask secrets |
| `settings.config-safety.spec.ts` | MegaPay/SePay/eSale/SMTP reload, no secret logging |

### RBAC

`SettingsAdminController` — `@Roles(UserRole.SUPER_ADMIN)` only.

**Verdict:** ✅ PASS

---

## TASK 3 — Real Provider Sandbox Test (eSale)

### Cấu hình hiện tại

`.env.local-production` chứa placeholder PEM/keys (Phase 6B). `ESALE_USE_MOCK=false` → **ESaleProvider thật** được chọn khi `isEsaleConfigured()=true`.

> Lưu ý: `ProviderRegistryService` fallback MockESale chỉ khi `useMock=true`, `APP_ENV=test`, hoặc **chưa configured** — không áp dụng khi env đủ field.

### Order audit `ORD-20260621-038E80`

| Bước | Kết quả |
|------|---------|
| SePay webhook → PAID | ✅ |
| `provider_transactions` tạo | ✅ 1 row, `status=FAILED` |
| `provider_transaction_date` persist | ✅ `2026-06-21 07:34:36` |
| Card decrypt + giao khách | ❌ `card_records=0` |
| Order terminal state | ⚠️ `WAITING_ADMIN_RETRY` |

### Worker restart

`docker restart cardon-prod-worker` → `/health/ready` PASS sau ~8s.

### checkTransaction recovery

| Layer | Kết quả |
|-------|---------|
| Live sandbox | ⚠️ Không test được — order fail ngay buyCard (invalid creds) |
| Unit | ✅ `provider.fulfillment-pipeline.spec.ts` — zombie PROCESSING retry |

### Reference order hoàn tất (data cũ)

`ORD-20260619-498333` — `COMPLETED` + `card_records` (từ run trước / data smoke).

**Verdict:** ⚠️ PARTIAL — pipeline ghi audit txn + date OK; **cần eSale sandbox credentials thật trên VPS** để verify COMPLETED + card decrypt + checkTransaction mid-restart.

---

## TASK 4 — Payment Sandbox Test

### SePay (live sim)

| Test | Kết quả |
|------|---------|
| Tạo payment QR | ✅ `PAY-79105A2106E0436EBA74` |
| Webhook `Authorization: Apikey local-sepay-api-key-sim` | ✅ `ok: true` |
| Duplicate webhook | ✅ `duplicate: true`, idempotent |
| Admin payment trace | ✅ `GET /admin/payments` total=4 |

### MegaPay

| Test | Kết quả |
|------|---------|
| Tạo payment (order đã PAID) | N/A — expected error "Order is not awaiting payment" |
| Signature verify + callback | ✅ `payment.audit.spec.ts`, `payment.final-audit.spec.ts` |

**Verdict:** ✅ PASS (SePay live + MegaPay jest)

---

## TASK 5 — SMTP Test

### Cấu hình sim

```
SMTP_HOST=smtp.local-sim.invalid
SMTP_USER / SMTP_PASS — placeholder
```

### Quan sát runtime

Worker log khi order PAID:

```
NotificationDispatchService → template PAYMENT_SUCCESS, ORDER_SUCCESS
SmtpEmailProvider → dispatch (host giả, không deliver thật)
```

Redis `bull:notification_queue:*` — jobs `email-payment-success`, `email-order-success` trong queue/completed.

### Unit

`notification.service.spec.ts` — BullMQ retry khi SMTP fail.

### VPS action

Cấu hình **Brevo / Zoho / Gmail** qua Admin Settings (hoặc ENV bootstrap) rồi test:

- Register email verification
- Forgot password
- Card delivery email
- Verify retry trên `notification_queue` failed → retry

**Verdict:** ⚠️ PARTIAL — plumbing OK; **BLOCKED** deliver thật cho đến khi có SMTP credentials.

---

## TASK 6 — Media Storage Check

### Implementation

| Item | Path / behavior |
|------|-----------------|
| Storage service | `uploads/cms/` local disk (`CmsMediaStorageService.saveLocal`) |
| Static serve | `main.ts` → `express.static('uploads')` |
| Admin API | `POST /admin/cms/media/upload` (SUPER_ADMIN + `cms.manage`) |

### Production compose gap

**Không có Docker volume** mount `uploads/` cho api container → file upload **mất khi recreate container**.

Thư mục `/app/uploads/cms` chưa tồn tại cho đến khi upload lần đầu.

### Wasabi / S3 switch plan (VPS)

1. Implement `saveS3()` trong `CmsMediaStorageService` (interface `StoredMediaFile.storage: 's3'` đã có).
2. Env: `CMS_STORAGE=s3`, `S3_ENDPOINT`, `S3_BUCKET`, `S3_ACCESS_KEY`, `S3_SECRET_KEY`, `S3_REGION`.
3. Nginx proxy `/uploads/*` → CDN hoặc presigned URL trực tiếp.
4. **Hoặc** short-term: named volume `cardon_uploads:/app/uploads` trong `docker-compose.production.yml`.

**Verdict:** ⚠️ PARTIAL — code ready local; **VPS cần volume hoặc Wasabi trước go-live CMS media**.

---

## TASK 7 — Backup Restore Drill

### Procedure (trong container postgres)

```powershell
docker exec cardon-prod-postgres sh -c "pg_dump -U cardon -d cardon --no-owner --no-acl | gzip > /tmp/audit_bak.sql.gz"
docker exec cardon-prod-postgres psql -U cardon -d postgres -c "CREATE DATABASE cardon_restore_test;"
docker exec cardon-prod-postgres sh -c "gunzip -c /tmp/audit_bak.sql.gz | psql -U cardon -d cardon_restore_test --single-transaction -q"
# verify → DROP DATABASE cardon_restore_test;
```

### Kết quả 2026-06-21

| Metric | Main DB | Restored test DB |
|--------|---------|------------------|
| Backup size | 24,439 bytes (gzip) | — |
| orders | 10 | 10 ✅ |
| payments | 4 | 4 ✅ |
| card_records | 2 | (verify cùng restore) |
| system_settings | 2 | 2 ✅ |
| ledger_entries | — | restored OK |

Settings decrypt phụ thuộc **cùng `ENCRYPTION_KEY`** — documented in `settings.config-safety.spec.ts` encryption recovery test.

**Verdict:** ✅ PASS

---

## TASK 8 — Security Final Smoke

### Log scan (api + worker)

Không thấy leak `secretKey`, `SMTP_PASS`, `privateKey`, PIN plaintext trong logs production sim.

### Jest security suites

| Suite | Coverage |
|-------|----------|
| `settings.security.spec.ts` | Settings SUPER_ADMIN, encrypt/mask |
| `settings.config-safety.spec.ts` | No secret in logger calls |
| `admin-operation.security.spec.ts` | `cards.reveal` permission gate |
| `admin.security-audit.spec.ts` | Strip `secretKeyEncrypted`, gateway payload mask |
| `admin.payment-permission.spec.ts` | Finance/payment RBAC |
| `provider.safety.spec.ts` | eSale logSafe excludes PIN/secret |
| `auth-security.audit.spec.ts` | Auth hardening |
| `production-env.rules.spec.ts` | `ESALE_USE_MOCK` blocked in production |

### Permissions matrix (verified in spec)

| Permission | Role |
|------------|------|
| `settings.*` / Admin Settings | SUPER_ADMIN only |
| `cards.reveal` | Explicit RBAC — denied without permission |
| `finance.view` / `finance.manage` | ACCOUNTANT+ (not MARKETING/SUPPORT) |

**Verdict:** ✅ PASS

---

## TASK 9 — Build & Test

| Command | Kết quả | Ghi chú |
|---------|---------|---------|
| `nest build` | ✅ PASS | |
| `jest` (full) | ✅ **369/369** | 35 suites |
| `docker compose ... build web partner admin` | ✅ PASS | Production images |
| `npm run build:web/partner/admin` (host) | ⚠️ SKIP | `npm` không trong PATH Windows agent |
| `npm test` (host) | ✅ PASS | qua `node node_modules/jest/bin/jest.js` |

### Audit-related jest subset (103 tests)

`settings`, `production-env`, `admin.*security`, `payment.*audit`, `provider.fulfillment-pipeline` — all PASS.

---

## Known issues / VPS checklist

| # | Item | Action trên VPS |
|---|------|-----------------|
| 1 | eSale sandbox credentials | Nhập PEM/keys thật qua Admin Settings; verify buyCard → COMPLETED |
| 2 | SMTP deliver | Brevo/Zoho/Gmail + test register/forgot/card email |
| 3 | Media persistence | Mount volume `uploads/` hoặc Wasabi S3 |
| 4 | `scripts/run-e2e-smoke.mjs` | Login DTO dùng `email` — API yêu cầu `identifier` (cần fix script, không blocker deploy) |
| 5 | MegaPay live callback | Test với merchant sandbox thật sau khi có credentials |
| 6 | `ENCRYPTION_KEY` | Backup `.env.production` + secrets manager — restore cần cùng key |

---

## Phase 6G.1 fulfillment fix (context)

Phase 6G regression kẹt `PAID/PROCESSING` do thiếu `system@cardon.local` audit actor — **đã fix** trong 6G.1. Production sim audit order `ORD-20260621-038E80` tạo `provider_transaction` (FAILED) và chuyển `WAITING_ADMIN_RETRY` — behavior đúng khi eSale API reject, không phải zombie PROCESSING.

---

## Kết luận

Stack production simulation **sẵn sàng deploy VPS về mặt kiến trúc** (api/worker split, health, migrations, payment webhook, settings runtime, backup, security tests, builds).

**Trước go-live bắt buộc:**

1. eSale sandbox/production credentials thật → E2E buy card COMPLETED  
2. SMTP thật → email deliver + retry verified  
3. Persistent media storage (volume hoặc Wasabi)  
4. MegaPay merchant sandbox callback test  

**Không deploy production customer traffic** cho đến khi 4 mục trên PASS trên VPS staging.
