# CardOn.vn — Phase 6B: VPS Production Deployment Report

**Ngày:** 2026-06-19  
**Phạm vi:** Deploy + verify runtime (không đổi business logic, không marketing/go-live)  
**Môi trường thực thi:** **Local simulation** trên Windows (Docker Desktop) — user chọn `local_sim` thay vì SSH VPS Ubuntu thật  
**Kết quả tổng thể:** **FAIL (có blocker runtime)** — stack infra lên được một phần; API không healthy → chặn health check và smoke test

---

## Executive summary

| Hạng mục | Trạng thái |
|----------|------------|
| Server prep (STEP 1) | **SKIP** (local sim) — script `scripts/deploy/setup-vps.sh` sẵn sàng cho VPS |
| Clone + `.env.production` (STEP 2) | **PASS** (local) |
| SSL Cloudflare (STEP 3) | **SKIP** (local sim) — tài liệu có sẵn |
| Docker compose up (STEP 4) | **PARTIAL** — postgres/redis healthy; API crash-loop |
| Migration (STEP 5) | **PASS** — 7 migration applied |
| Health checks (STEP 6) | **FAIL** — API không chạy |
| Smoke Customer (STEP 7) | **SKIP** — blocked |
| Smoke Agent (STEP 8) | **SKIP** — blocked |
| Smoke Admin (STEP 9) | **SKIP** — blocked |
| Backup cron (STEP 10) | **READY** — script có; chưa cài trên VPS |

**Blocker chính:** Circular dependency NestJS `AuthModule ↔ NotificationModule ↔ ProviderModule` khiến API production (`APP_ROLE=api`) không khởi động. Audit 6A.1 chỉ verify build/config, chưa chạy `docker compose up` end-to-end.

**Domain production:** `https://cardon.vn` chưa live (503) — chưa deploy lên VPS thật trong session này.

---

## STEP 1 — Server preparation

**Mục tiêu VPS:** Ubuntu, Docker, Docker Compose, git, ufw, timezone `Asia/Ho_Chi_Minh`

| Thành phần | Local sim | VPS (khi deploy thật) |
|------------|-----------|------------------------|
| docker | Có (Docker Desktop) | `scripts/deploy/setup-vps.sh` |
| docker compose | Có | Same script |
| git | Có | Same script |
| ufw | N/A trên Windows | Same script (22, 80, 443) |
| Timezone | Host Windows | `timedatectl set-timezone Asia/Ho_Chi_Minh` |

**Script:** [`scripts/deploy/setup-vps.sh`](../scripts/deploy/setup-vps.sh)

---

## STEP 2 — Clone project & `.env.production`

| Hạng mục | Kết quả |
|----------|---------|
| Source | Repo local `C:\Users\MyHome\Projects\cardon` (latest) |
| `.env.production` | Tạo cho local sim — **không commit** |
| DATABASE | `POSTGRES_*` → postgres container |
| REDIS | `REDIS_URL=redis://redis:6379` (compose) |
| JWT / ENCRYPTION | Điền giá trị sim ≥ 32 ký tự |
| MegaPay / SePay / eSale / SMTP | Điền placeholder sim |

**Sửa trong session:** `ESALE_CLIENT_CODE` không được để chuỗi rỗng — Joi từ chối `"ESALE_CLIENT_CODE" is not allowed to be empty` khi `APP_ENV=production`. Đặt `ESALE_CLIENT_CODE=sim-client-001`.

**Lệnh VPS (tham khảo):**
```bash
git clone <repo-url> /opt/cardon && cd /opt/cardon
cp .env.production.example .env.production
# điền secrets thật
```

---

## STEP 3 — SSL (Cloudflare Origin Certificate)

**Local sim:** Bỏ qua — nginx chạy HTTP only qua [`infra/nginx/conf.d/00-localhost-sim.conf`](../infra/nginx/conf.d/00-localhost-sim.conf).

**VPS production checklist:**
1. Cloudflare SSL/TLS → **Full (strict)**
2. Origin Server → tạo cert `cardon.vn`, `*.cardon.vn`
3. Mount vào `infra/nginx/ssl/` (`cardon.vn.pem`, `cardon.vn.key`)
4. Uncomment HTTPS blocks trong `conf.d/cardon.vn.conf`, `partner.cardon.vn.conf`, `admin.cardon.vn.conf`
5. `nginx -t && nginx -s reload`

Chi tiết: [`infra/nginx/ssl/README.md`](../infra/nginx/ssl/README.md)

---

## STEP 4 — Start containers

**Lệnh local sim:**
```bash
docker compose \
  -f docker-compose.production.yml \
  -f docker-compose.local.yml \
  --env-file .env.production \
  up -d --build
```

**Lệnh VPS (không dùng `docker-compose.local.yml` / `00-localhost-sim.conf`):**
```bash
docker compose \
  --env-file .env.production \
  -f docker-compose.production.yml \
  up -d --build
```

### Trạng thái container (cuối session)

| Container | Trạng thái | Ghi chú |
|-----------|------------|---------|
| cardon-prod-postgres | **healthy** | Volume `cardon_prod_postgres` |
| cardon-prod-redis | **healthy** | Volume `cardon_prod_redis` |
| cardon-prod-api | **unhealthy / restart loop** | Blocker — xem bên dưới |
| cardon-prod-worker | Created | Chờ API healthy (`depends_on`) |
| cardon-prod-web | Created | Chờ API |
| cardon-prod-partner | Created | Chờ API |
| cardon-prod-admin | Created | Chờ API |
| cardon-prod-nginx | Created | Chờ upstream |

### Sự cố đã xử lý (deploy infra, không phải app logic)

1. **Entrypoint CRLF (Windows):** `docker/Dockerfile.api` — `sed -i 's/\r$//' /entrypoint.sh`
2. **Migration P3018:** Tách `20250619050000` (ADD ENUM) và `20250619050100` (REJECTED + SET DEFAULT) — PostgreSQL không cho ADD VALUE + SET DEFAULT cùng transaction
3. **Migration failed state:** `prisma migrate resolve --rolled-back 20250619050000_agent_lifecycle_status` → deploy lại → **7/7 migrations applied**

---

## STEP 5 — Database migration

| Kiểm tra | Kết quả |
|----------|---------|
| `prisma migrate deploy` (entrypoint API) | **PASS** |
| Seed | **Không chạy** (đúng yêu cầu production) |

**Migrations applied:**
- `20250618100000_init_cardon_schema`
- `20250618120000_order_invoice_metadata`
- `20250618140000_payment_idempotency_key`
- `20250619040000_provider_transaction_persistence`
- `20250619050000_agent_lifecycle_status`
- `20250619050100_agent_lifecycle_status_default`
- `20250619100000_agent_api_key_lookup`

---

## STEP 6 — Health checks

| Endpoint | Kết quả | Mong đợi |
|----------|---------|----------|
| `GET /health` | **FAIL** | API không listen |
| `GET /health/ready` | **FAIL** | database / redis / worker heartbeat |

**Log API (lỗi lặp lại):**
```
The module at index [0] of the ProviderModule "imports" array is undefined.
Scope [AppModule -> AuthModule -> NotificationModule]
```

**Nguyên nhân:** Vòng phụ thuộc module:
```
AuthModule → NotificationModule → ProviderModule → AuthModule
```

Khi `ProviderModule` load, `AuthModule` (imports[0]) = `undefined` trong bundle production.

**Khuyến nghị hotfix (ngoài scope 6B — cần sửa code):**
- `forwardRef(() => AuthModule)` trong `ProviderModule`, và/hoặc
- `forwardRef(() => ProviderModule)` trong `NotificationModule`, hoặc
- Gỡ import `ProviderModule` khỏi `NotificationModule` nếu không dùng (cần review dependency injection)

---

## STEP 7 — Smoke test Customer

| Test | Kết quả |
|------|---------|
| Mở cardon.vn | **SKIP** — domain chưa deploy; local nginx chưa start |
| Tạo order | **SKIP** |
| SePay QR | **SKIP** |
| Payment callback | **SKIP** |
| Card delivery | **SKIP** |

---

## STEP 8 — Smoke test Agent

| Test | Kết quả |
|------|---------|
| Login partner | **SKIP** |
| Balance | **SKIP** |
| API auth | **SKIP** |
| Transaction query | **SKIP** |

---

## STEP 9 — Smoke test Admin

| Test | Kết quả |
|------|---------|
| Login admin | **SKIP** |
| Dashboard | **SKIP** |
| Orders | **SKIP** |
| Provider status | **SKIP** |
| Finance | **SKIP** |

**Lưu ý:** Smoke test admin/partner cần SUPER_ADMIN — production **cấm seed**. Trên staging/sim, one-time:
```bash
docker exec -e APP_ENV=development cardon-prod-api npx prisma db seed
```
(chỉ sau khi API healthy)

---

## STEP 10 — Backup cron

| Hạng mục | Trạng thái |
|----------|------------|
| Script backup | [`scripts/backup-db.sh`](../scripts/backup-db.sh) |
| Cài cron VPS | [`scripts/deploy/install-backup-cron.sh`](../scripts/deploy/install-backup-cron.sh) |
| Lịch | 02:30 hàng ngày (Asia/Ho_Chi_Minh) |
| Local sim | **Chưa cài** — chỉ document |

**VPS:**
```bash
sudo ./scripts/deploy/install-backup-cron.sh /opt/cardon
```

---

## Verdict

| Phase | Kết quả |
|-------|---------|
| **6B Deploy verification** | **FAIL** — blocker runtime API module cycle |
| **Infra readiness** | **PASS** — compose, migration, postgres/redis, scripts VPS |
| **Go-live** | **NO-GO** — sửa blocker + deploy VPS + SSL + smoke test đầy đủ |

---

## Next steps (trước VPS thật)

1. **Hotfix circular dependency** (Phase 6B.1) — verify `docker compose up` + `/health/ready` PASS
2. SSH VPS → chạy `setup-vps.sh`
3. Clone repo, `.env.production` với secrets **thật** (không sim)
4. Cloudflare Origin Cert + Full Strict + bật HTTPS nginx
5. **Xóa** `docker-compose.local.yml` và `infra/nginx/conf.d/00-localhost-sim.conf` trên VPS
6. `docker compose -f docker-compose.production.yml --env-file .env.production up -d --build`
7. One-time SUPER_ADMIN (staging) hoặc quy trình ops đã định
8. Smoke test STEP 7–9
9. `install-backup-cron.sh`

---

## Không thực hiện (đúng scope)

- Không marketing / go-live public
- Không đổi business logic application
- Không `prisma db seed` trên production env
- Không deploy SSH lên VPS Ubuntu trong session này (local sim)

---

## Files deploy liên quan (session 6B)

| File | Mục đích |
|------|----------|
| `.env.production` | Env local sim (gitignored) |
| `docker-compose.local.yml` | Expose port 80/8080/8081 cho sim |
| `infra/nginx/conf.d/00-localhost-sim.conf` | Routing localhost |
| `scripts/deploy/setup-vps.sh` | Chuẩn bị VPS |
| `scripts/deploy/install-backup-cron.sh` | Cron backup |
| `docker/Dockerfile.api` | Fix CRLF entrypoint |
| `prisma/migrations/20250619050100_*` | Tách migration enum/default |
