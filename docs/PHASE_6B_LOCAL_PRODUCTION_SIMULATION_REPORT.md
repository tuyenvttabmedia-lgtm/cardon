# CardOn.vn — Phase 6B: Local Production Simulation Report

**Ngày:** 2026-06-19  
**Phạm vi:** Mô phỏng production stack trên máy local (Docker) — **không VPS**, **không domain thật**, **không SSL/Cloudflare**  
**Verdict:** **PASS (có điều kiện)** — stack chạy end-to-end; fulfillment card delivery **PARTIAL** do eSale adapter thật (không mock) trong `APP_ENV=production`

---

## Executive summary

| Hạng mục | Kết quả |
|----------|---------|
| Docker production stack local | **PASS** — 8/8 containers healthy |
| Migration `prisma migrate deploy` | **PASS** — 7 migrations |
| Health `/health`, `/health/ready` | **PASS** — database, redis, worker heartbeat OK |
| Customer smoke (order + SePay) | **PASS** |
| Customer card delivery | **PARTIAL** — fulfillment kẹt `PROCESSING` |
| Admin smoke | **PASS** |
| Partner smoke | **PARTIAL** — UI/login/docs OK; chưa có agent test user |
| Worker / queue / restart | **PASS** |

---

## Cách chạy

```bash
# Từ thư mục repo
docker compose \
  -f docker-compose.production.yml \
  -f docker-compose.local-production.yml \
  --env-file .env.local-production \
  up -d --build

# Bootstrap admin + catalog demo (one-time, không reset production seed)
docker exec -e LOCAL_ADMIN_EMAIL=superadmin@cardon.vn \
  -e LOCAL_ADMIN_PASSWORD=ChangeMe123! \
  cardon-prod-api node --experimental-strip-types /app/scripts/create-admin-local.ts
```

**Dừng stack:**
```bash
docker compose -f docker-compose.production.yml -f docker-compose.local-production.yml down
```

**Reset DB (chỉ khi cần):**
```bash
docker compose -f docker-compose.production.yml -f docker-compose.local-production.yml down -v
```

---

## Domain mapping local

| Service | URL |
|---------|-----|
| Customer web | http://localhost |
| API (proxy) | http://localhost/api/v1 |
| Partner | http://partner.localhost |
| Admin | http://admin.localhost |

Trình duyệt hiện đại resolve `*.localhost` → 127.0.0.1 tự động.

---

## Files tạo cho Phase 6B Local

| File | Mục đích |
|------|----------|
| `.env.local-production` | Env production sim (gitignored) |
| `docker-compose.local-production.yml` | Override nginx local, postgres port 5433, healthcheck bootstrap |
| `infra/nginx/conf.d.local/00-local-production.conf` | HTTP routing localhost / partner / admin |
| `scripts/create-admin-local.ts` | Upsert SUPER_ADMIN + RBAC + catalog demo (không chạy seed production) |

---

## STEP 1–4: Stack containers

| Container | Status | Ghi chú |
|-----------|--------|---------|
| cardon-prod-postgres | healthy | Volume persistent; host port **5433** |
| cardon-prod-redis | healthy | AOF enabled |
| cardon-prod-api | healthy | `APP_ENV=production`, `APP_ROLE=api` |
| cardon-prod-worker | healthy | Heartbeat Redis OK |
| cardon-prod-web | healthy | Build args từ `.env.local-production` |
| cardon-prod-partner | healthy | `partner.localhost` |
| cardon-prod-admin | healthy | `admin.localhost` |
| cardon-prod-nginx | healthy | Chỉ port **80**, không HTTPS |

---

## STEP 5: Migration

- Entrypoint API: `prisma migrate deploy` khi `RUN_MIGRATIONS=true`
- **Không** chạy `prisma db seed` production
- 7 migrations applied thành công

---

## STEP 6: Health checks

**Qua nginx (`docker exec cardon-prod-nginx wget http://127.0.0.1/...`):**

| Endpoint | Kết quả |
|----------|---------|
| `/health` | `app/database/redis/workers: ok` |
| `/health/ready` | `ready: true` |

---

## STEP 7: Smoke test Customer

| Test | Kết quả |
|------|---------|
| Mở http://localhost | **PASS** — Next.js customer web |
| Catalog API | **PASS** — `GET /api/v1/products` |
| Tạo guest order | **PASS** — `ORD-20260619-83B3D2` |
| SePay QR | **PASS** — `paymentUrl` → `qr.sepay.vn` |
| SePay webhook (sandbox sim) | **PASS** — `Authorization: Apikey local-sepay-api-key-sim` |
| Payment → PAID | **PASS** |
| Provider fulfillment | **PARTIAL** — `fulfillmentStatus: PROCESSING`, queue `provider_queue` retry |
| Card delivery | **FAIL** — chưa `COMPLETED` (xem mục Known issues) |

---

## STEP 8: Smoke test Partner

| Test | Kết quả |
|------|---------|
| http://partner.localhost/login | **PASS** — form login render |
| http://partner.localhost/docs | **PASS** — trang docs (auth guard client-side) |
| Login agent + dashboard | **SKIP** — chưa tạo agent user trong bootstrap |
| Partner API auth | **SKIP** |

---

## STEP 9: Smoke test Admin

| Test | Kết quả |
|------|---------|
| http://admin.localhost | **PASS** — redirect dashboard |
| Login `superadmin@cardon.vn` | **PASS** |
| `GET /api/v1/admin/dashboard` | **PASS** — metrics (revenue, orders) |
| `GET /api/v1/admin/orders` | **PASS** |
| `GET /api/v1/admin/providers/status` | **PASS** — ESALE provider |
| `GET /api/v1/admin/finance/profit` | **PASS** — với `dateFrom` / `dateTo` ISO |

---

## STEP 10: Worker / queue / logs / restart

| Kiểm tra | Kết quả |
|----------|---------|
| Redis heartbeat key | **PASS** — `cardon:worker:heartbeat` có timestamp |
| BullMQ queues | **PASS** — `provider_queue`, `notification_queue`, `payment_queue`, … |
| Worker logs | **PASS** — fulfill job, notification email jobs |
| `docker restart cardon-prod-api` | **PASS** — healthy sau ~45s, `/health/ready` OK |

---

## Runtime fixes (cần thiết cho production Docker — không phải feature)

Các lỗi chỉ lộ khi chạy `APP_ENV=production` + Docker (audit 6A.1 chỉ build/config):

1. **Circular dependency NestJS** — `forwardRef()` trên Auth/Product/Provider/Notification modules
2. **HTTP client DI** — `@Optional()` cho `fetchFn` trong `EsaleHttpClient`, `MegapayHttpClient`
3. **OrderModule export** — export `OrderRepository` cho `PaymentExpirationService`
4. **Compose bootstrap deadlock** — API healthcheck `/health` (local override) + worker `depends_on: service_started`
5. **Audit actor email** — `create-admin-local.ts` dùng `superadmin@cardon.vn` (khớp `SYSTEM_AUDIT_ACTOR_EMAIL`)

---

## Known issues / hạn chế local sim

### 1. Card delivery (eSale mock trong production)

`APP_ENV=production` **cấm** `ESALE_USE_MOCK=true`. Env sim điền đủ eSale keys → adapter **thật** được chọn, gọi URL sandbox không phản hồi → order kẹt `PROCESSING`.

**Workaround tương lai (chưa làm):** flag `LOCAL_PRODUCTION_SIM` hoặc bỏ eSale keys khỏi validation production cho môi trường sim.

### 2. Partner agent login

Chưa có script tạo agent + KYC approved. Partner UI verified qua nginx routing.

### 3. Host curl Windows

Một số lệnh `curl localhost` trên Windows chậm/treo; verify qua `docker exec cardon-prod-nginx wget` ổn định hơn.

### 4. SMTP

SMTP trỏ host sim — email jobs chạy nhưng không gửi thật (log `SmtpEmailProvider`).

---

## Không thực hiện (đúng scope)

- Không deploy VPS Ubuntu
- Không mua/configure domain `cardon.vn`
- Không Cloudflare / SSL
- Không marketing / go-live
- Không `prisma db seed` production reset

---

## Kết luận

**Local Production Simulation đạt mục tiêu Phase 6B:** xác nhận production Docker stack (compose, migration, nginx multi-host, API/worker/frontends, payment webhook, admin ops) chạy được trên máy dev **trước khi có công ty/VPS/domain**.

**Điều kiện trước VPS thật:** sửa fulfillment mock path cho local sim hoặc cấu hình eSale sandbox thật; tạo agent test user; khi có VPS dùng `.env.production` + nginx production (bỏ `docker-compose.local-production.yml`).

**Next (ngoài scope):** Phase VPS deploy khi đã có công ty + domain + Cloudflare.
