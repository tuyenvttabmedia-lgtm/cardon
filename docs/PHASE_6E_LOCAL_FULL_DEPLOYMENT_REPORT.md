# Phase 6E — Local Full Deployment Report

**Ngày:** 2026-06-20  
**Trạng thái:** ✅ Stack local-full chạy — sẵn sàng test thủ công  
**Phạm vi:** Rebuild Docker, migrate, seed, expose toàn bộ apps. **Không thêm feature / không đổi business logic payment-provider-ledger.**

---

## Executive summary

| Hạng mục | Kết quả |
|----------|---------|
| Docker stack `cardon-local-full` | ✅ 8/8 containers Up |
| API + Worker | ✅ healthy, `/health/ready` OK |
| Postgres migrate deploy | ✅ 10 migrations, up to date |
| RBAC seed (`prisma/seed.mjs`) | ✅ |
| Bootstrap (`seed-local-full.ts`) | ✅ users + catalog + agent |
| Permissions verify | ✅ `cards.reveal`, `users.manage`, `customers.manage` |
| Customer web | ✅ HTTP 200 |
| Admin | ✅ HTTP 200 |
| Partner | ✅ HTTP 307 → login |
| Mock eSale (`ESALE_USE_MOCK=true`) | ✅ `APP_ENV=staging` |

---

## Cách chạy (clean rebuild)

```powershell
cd C:\Users\MyHome\Projects\cardon

# Dừng stack cũ + xóa volume (reset DB)
docker compose -f docker-compose.local-full.yml --env-file .env.local-full down -v --remove-orphans

# Build toàn bộ (lần đầu hoặc sau đổi code)
docker compose -f docker-compose.local-full.yml --env-file .env.local-full build --no-cache

# Khởi động
docker compose -f docker-compose.local-full.yml --env-file .env.local-full up -d

# Đợi API healthy (~2 phút), bootstrap test data
docker exec cardon-local-full-api node --experimental-strip-types /app/scripts/seed-local-full.ts
```

**Dừng (giữ data):**
```powershell
docker compose -f docker-compose.local-full.yml --env-file .env.local-full down
```

---

## TASK 4 — URLs (local routing)

| App | URL |
|-----|-----|
| Customer web | http://localhost |
| Partner | http://partner.localhost |
| Admin | http://admin.localhost |
| API (proxy nginx) | http://localhost/api/v1 |

Trình duyệt hiện đại resolve `*.localhost` → 127.0.0.1.

**Postgres host:** `127.0.0.1:5433` (user `cardon`, db `cardon`)

---

## TASK 3 — Environment

File: `.env.local-full` (gitignored)

| Biến | Giá trị local-full |
|------|-------------------|
| `APP_ENV` | `staging` (compose) |
| `ESALE_USE_MOCK` | `true` (compose) |
| MegaPay | Sandbox/sim credentials |
| SePay | Local webhook `Authorization: Apikey local-sepay-api-key-sim` |
| SMTP | `smtp.local-test.invalid` — cấu hình test qua Admin Settings |

Compose file: `docker-compose.local-full.yml`  
Nginx: `infra/nginx/conf.d.local/00-local-production.conf`

---

## TASK 2 — Database

**Migrations:** `npx prisma migrate deploy` (entrypoint API khi `RUN_MIGRATIONS=true`)

10 migrations applied, gồm:
- Phase 5A.2 (`user_customer_profile`)
- Phase 5C.8 (`phase_5c8_operations`)
- Các migration trước đó (init, payment, provider, agent, cms, …)

**Seed tự động (entrypoint):** `node prisma/seed.mjs` khi `RUN_SEED=true`

**Bootstrap bổ sung:** `scripts/seed-local-full.ts`

**Permissions đã verify:**

| Code | Status |
|------|--------|
| `cards.reveal` | ✅ |
| `users.manage` | ✅ |
| `customers.manage` | ✅ |

---

## TASK 5 — Tài khoản test

| Role | Email | Password |
|------|-------|----------|
| SUPER_ADMIN | superadmin@cardon.vn | `SuperAdmin2026!` |
| SUPPORT | support@test.local | `LocalTest2026!` |
| MARKETING | marketing@test.local | `LocalTest2026!` |
| ACCOUNTANT | accountant@test.local | `LocalTest2026!` |
| CUSTOMER | customer@test.local | `LocalTest2026!` |
| AGENT | agent@test.local | `LocalTest2026!` |

**Agent API credentials** (random mỗi lần seed — xem file trong container):

```powershell
docker exec cardon-local-full-api cat /app/scripts/.local-full-credentials.json
```

Gồm `apiKey`, `secretKey`, balance 10.000.000 VND.

---

## TASK 6 — Catalog demo

Provider: **ESALE (Mock)** — `ESALE_USE_MOCK=true`

| SKU | Tên | Face value |
|-----|-----|------------|
| `VIETTEL-100K` | Viettel 100k | 100.000 |
| `GARENA-100K` | Garena 100k | 100.000 |
| `ZING-100K` | Zing 100k | 100.000 |

Category: `local-demo-cards` — "Thẻ game & telco (Local Demo)"

---

## TASK 7 — Checklist test thủ công

### Customer (http://localhost)

- [ ] Đăng ký tài khoản mới
- [ ] Login `customer@test.local` / `LocalTest2026!`
- [ ] Mua thẻ (SePay QR → webhook sim)
- [ ] Nhận thẻ email / xem trong `/account/cards`
- [ ] Trang `/account` — profile, orders, password

**SePay webhook sim (sau tạo order):**
```http
POST http://localhost/api/v1/payments/webhook/sepay
Authorization: Apikey local-sepay-api-key-sim
Content-Type: application/json

{ "payment_reference": "<PAY-REF>", "amount": "100000.00", "status": "SUCCESS" }
```

### Partner (http://partner.localhost)

- [ ] Login `agent@test.local`
- [ ] Dashboard, balance 10M
- [ ] Partner API buy card (dùng apiKey/secretKey từ credentials file)
- [ ] Docs `/docs`

### Admin (http://admin.localhost)

Login `superadmin@cardon.vn` / `SuperAdmin2026!`

- [ ] Dashboard metrics
- [ ] Orders + order detail (5 tabs)
- [ ] Customers CRUD / lock
- [ ] Staff (SUPER_ADMIN only)
- [ ] Payments list + manual review
- [ ] Products / providers
- [ ] Finance reports
- [ ] CMS + SEO settings
- [ ] Settings payment / SMTP / system
- [ ] Global search
- [ ] Audit logs

**Role smoke:**

| User | Kiểm tra |
|------|----------|
| support@test.local | Orders OK, **không** "Hiện mã thẻ" |
| marketing@test.local | Chỉ CMS menu |
| accountant@test.local | Finance + payments, **không** customers menu |

---

## Verification tự động (Phase 6E run)

| Check | Kết quả |
|-------|---------|
| `GET /health` | app/database/redis/workers: ok |
| `GET /health/ready` | ready: true |
| `GET /api/v1/products` | 3 products + variants |
| `POST /auth/login` superadmin | accessToken OK |
| DB permissions (3 codes) | OK |
| DB users (6 accounts) | OK |
| Worker heartbeat | OK |

---

## Files tạo / cập nhật (deploy infra)

| File | Mục đích |
|------|----------|
| `docker-compose.local-full.yml` | Stack đầy đủ Phase 6E |
| `.env.local-full` | Env staging + mock (gitignored) |
| `scripts/seed-local-full.ts` | Users + catalog + agent bootstrap |
| `docker/entrypoint-api.sh` | migrate + `node prisma/seed.mjs` |
| `docker/Dockerfile.api` | copy `package.json`, `seed-local-full.ts` |

**Sửa wiring deploy (không đổi business logic):**

- Export `TokenService` từ `AuthModule` (fix DI `AdminCustomerService`)
- `forwardRef(() => ProviderModule)` trong `AuthModule` (fix worker bootstrap)

---

## Known limitations

1. **SMTP:** Host giả `smtp.local-test.invalid` — email thật không gửi được; dùng Admin Settings để đổi SMTP test (Mailhog, etc.) nếu cần.
2. **MegaPay:** Endpoint sandbox giả — dùng SePay + webhook sim cho flow thanh toán local.
3. **Frontend healthcheck:** Container `web`/`admin`/`partner` có thể báo **unhealthy** trong `docker ps` dù HTTP 200/307 OK (Next.js healthcheck wget).
4. **Agent API keys:** Regenerate mỗi lần chạy `seed-local-full.ts` — đọc lại từ `.local-full-credentials.json`.
5. **Port 5433:** Postgres expose host; tránh conflict với stack `cardon-prod-*` cũ.
6. **Production seed guard:** `prisma/seed.mjs` từ chối chạy khi `APP_ENV=production` — local-full dùng `staging`.

---

## Container map

| Container | Image | Port |
|-----------|-------|------|
| cardon-local-full-nginx | nginx:1.27-alpine | 80 |
| cardon-local-full-api | cardon-api:local-full | internal 3000 |
| cardon-local-full-worker | cardon-api:local-full | — |
| cardon-local-full-web | cardon-web:local-full | internal 3001 |
| cardon-local-full-partner | cardon-partner:local-full | internal 3002 |
| cardon-local-full-admin | cardon-admin:local-full | internal 3003 |
| cardon-local-full-postgres | postgres:16-alpine | 5433→5432 |
| cardon-local-full-redis | redis:7-alpine | internal |

---

## Kết luận

Phase 6E triển khai **toàn bộ CardOn stack** trên local với mock eSale, payment sim, đủ RBAC Phase 5C.10, catalog demo 3 SKU, và 6 tài khoản test. Hệ thống **sẵn sàng test thủ công** theo checklist TASK 7.

**Lệnh nhanh sau khi clone/pull code mới:**

```powershell
docker compose -f docker-compose.local-full.yml --env-file .env.local-full up -d --build
docker exec cardon-local-full-api node --experimental-strip-types /app/scripts/seed-local-full.ts
```
