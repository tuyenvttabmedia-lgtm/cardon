# =============================================================================
# CardOn.vn — Phase 6A.1 Pre-Deployment Final Audit
# Date: 2026-06-19
# Scope: Audit only — không deploy, không thêm feature, không đổi business logic
# =============================================================================

## Executive summary

| Verdict | Mô tả |
|---------|--------|
| **GO (có điều kiện)** | Gói deploy production **sẵn sàng** sau khi điền secrets thật, mount SSL cert, bật HTTPS nginx |
| **Critical fixes** | 5 vấn đề đã sửa trong audit này (xem cuối báo cáo) |
| **Warnings** | HTTPS chưa bật (chờ cert), `reconciliation_queue` chưa có worker |

---

## CHECK 1 — Docker Compose safety

| Tiêu chí | Kết quả | Ghi chú |
|----------|---------|---------|
| Postgres volume persistent | **PASS** | `cardon_prod_postgres:/var/lib/postgresql/data` |
| Redis volume persistent | **PASS** | `cardon_prod_redis:/data` + AOF |
| Restart policy | **PASS** | `unless-stopped` trên tất cả services |
| Network isolation | **PASS** | `cardon-internal` bridge; app services chỉ `expose`, không publish DB |
| Postgres/Redis public port | **PASS** | Không có `ports:` trên postgres/redis |
| Nginx public | **PASS** | Chỉ nginx publish 80/443 |

`docker compose --env-file .env.production.audit -f docker-compose.production.yml config` → **PASS**

---

## CHECK 2 — Environment safety

| Service | APP_ENV | Secrets | Sandbox | Localhost |
|---------|---------|---------|---------|-----------|
| API | `production` (hardcoded compose) | Từ `.env.production` | `ESALE_USE_MOCK=false` hardcoded | `DATABASE_URL`/`REDIS_URL` dùng hostname nội bộ Docker |
| Worker | `production` | Kế thừa anchor backend | Same | Same |
| Web | N/A runtime | Build args only | N/A | `.env.production.example` dùng `https://cardon.vn` |
| Partner | N/A | Build args | N/A | API URLs production domains |
| Admin | N/A | Build args | N/A | API URLs production domains |

| Kiểm tra | Kết quả |
|----------|---------|
| Không default secrets trong compose | **PASS** — biến `${JWT_SECRET}` bắt buộc từ env file |
| Template không chứa secret thật | **PASS** — `.env.production.example` dùng `REPLACE_*` / `your-*` |
| Production env validation (code) | **PASS** — `assertProductionEnv()` từ chối mock, thiếu SMTP/payment keys |

**Lưu ý:** Dev fallback `localhost` vẫn tồn tại trong `apps/*/lib/utils.ts` cho local dev — **không** baked vào image nếu build với đúng `NEXT_PUBLIC_*` args.

---

## CHECK 3 — Frontend runtime URLs

| App | Build arg (production) | API call target |
|-----|------------------------|-----------------|
| Web | `WEB_NEXT_PUBLIC_API_URL=https://cardon.vn/api/v1` | `https://cardon.vn/api/v1/*` |
| Partner | `PARTNER_NEXT_PUBLIC_API_URL=https://partner.cardon.vn/api/v1` | Partner domain + `/api/partner/v1` |
| Admin | `ADMIN_NEXT_PUBLIC_API_URL=https://admin.cardon.vn/api/v1` | Admin domain API |

Nginx proxy `/api/` → `api:3000` trên mọi domain → browser gọi `https://<domain>/api/v1`, **không** localhost.

**Fix audit:** Partner login link hardcoded `http://localhost:3001` → đổi sang `getCustomerSiteUrl()` (`https://cardon.vn`).

---

## CHECK 4 — Database migration safety

| Bước | Triển khai | Kết quả |
|------|------------|---------|
| Backup trước | `scripts/backup-db.sh` | **PASS** |
| Migration | `docker/entrypoint-api.sh` → `prisma migrate deploy` khi `RUN_MIGRATIONS=true` | **PASS** |
| Start services | compose `depends_on: service_healthy` | **PASS** |
| Seed production | `prisma/seed.mjs` | **PASS** (sau fix) — từ chối `APP_ENV=production` |

**Fix audit:** Thêm guard seed — không overwrite SUPER_ADMIN / settings trên production.

**Không bao giờ:** `prisma db seed` trên production (documented in `DEPLOY_CHECKLIST.md`).

---

## CHECK 5 — Worker startup

| Queue | Worker | Trạng thái |
|-------|--------|------------|
| `provider_queue` | `ProviderWorker` | **PASS** |
| `notification_queue` | `NotificationWorker` | **PASS** |
| `reconciliation_queue` | — | **WARN** — queue registered, chưa có `@Processor` |
| `payment_queue` | expiration via service | **INFO** — không cần worker riêng (design hiện tại) |
| `email_queue` / `topup_queue` | — | **INFO** — registered, chưa có consumer |

| Heartbeat | Kết quả |
|-----------|---------|
| `WorkerHeartbeatService` | Ghi Redis key `cardon:worker:heartbeat` mỗi 30s |
| Docker healthcheck worker | `docker/scripts/check-worker-heartbeat.mjs` |
| API `/health/ready` | Kiểm tra heartbeat khi `WORKER_HEARTBEAT_REQUIRED=true` |

---

## CHECK 6 — Nginx production

| Tiêu chí | Trước audit | Sau fix |
|----------|-------------|---------|
| gzip | **PASS** | Giữ nguyên |
| Proxy headers | Partial (inline) | **PASS** — `snippets/proxy-headers.conf` |
| Cloudflare real IP | **FAIL** | **PASS** — `00-cloudflare-real-ip.conf` |
| Upload limit | **PASS** | `client_max_body_size 10m` |
| Timeouts | Partial | **PASS** — connect/send/read 10s/60s/60s |

---

## CHECK 7 — SSL / Cloudflare

| Tiêu chí | Kết quả |
|----------|---------|
| Full (strict) documented | **PASS** — `infra/nginx/ssl/README.md` |
| Origin cert path | **PASS** — `/etc/nginx/ssl/cardon.vn.pem` + `.key` |
| HTTPS redirect | **WARN** — commented, bật sau khi mount cert |
| HTTP-only hiện tại | OK cho staging nội bộ; **bắt buộc** bật HTTPS trước production public |

---

## CHECK 8 — Security

| Rủi ro | Kết quả |
|--------|---------|
| `.env` trong image | **PASS** — `.dockerignore` loại trừ `.env*` |
| Source code trong image | **PASS** — chỉ `dist/`, không `src/` |
| Source maps backend | **PASS** (sau fix) — `tsconfig.build.json` `sourceMap: false` |
| Next.js browser source maps | **PASS** — default off |
| Logs secrets | **PASS** — không log env trong entrypoint |

---

## CHECK 9 — Backup restore test

**Simulation (dev postgres container):**

```
docker cp scripts/test-backup-restore-incontainer.sh cardon-postgres:/tmp/
docker exec cardon-postgres sh /tmp/test-backup-restore-incontainer.sh
→ RESTORE_TABLE_COUNT=36 PASS
```

Quy trình: backup → drop test DB → create test DB → restore → verify tables → cleanup.

**Scripts:** `scripts/backup-db.sh`, `scripts/restore-db.sh`, `scripts/test-backup-restore-incontainer.sh`

---

## CHECK 10 — Production checklist

**Created:** [`DEPLOY_CHECKLIST.md`](../DEPLOY_CHECKLIST.md)

- Before deploy
- During deploy
- After deploy
- Rollback
- Never-do list

---

## Build verification (Task 9)

| Command | Kết quả |
|---------|---------|
| `npm run build` (NestJS) | **PASS** |
| `npm run build:web` | **PASS** |
| `npm run build:partner` | **PASS** |
| `npm run build:admin` | **PASS** |
| `docker compose config` | **PASS** |
| `docker build -f docker/Dockerfile.api` | **PASS** |

---

## Critical fixes applied (6A.1)

1. **`prisma/seed.mjs`** — từ chối chạy khi `APP_ENV=production`
2. **`apps/partner/app/login/LoginPageClient.tsx`** — bỏ link localhost, dùng `getCustomerSiteUrl()`
3. **`apps/partner/lib/utils.ts`** + Docker build arg `NEXT_PUBLIC_CUSTOMER_SITE_URL`
4. **`tsconfig.build.json`** — `sourceMap: false` cho production backend
5. **Nginx** — Cloudflare real IP + shared proxy headers + timeouts
6. **`scripts/test-backup-restore-incontainer.sh`** — restore simulation script

---

## Warnings (non-blocking, pre-go-live)

1. Bật HTTPS server blocks + redirect sau khi mount Cloudflare origin cert
2. `reconciliation_queue` chưa có worker — jobs sẽ pending nếu enqueue (chưa có producer trong code hiện tại)
3. Chạy `npm install` ở root để sync `package-lock.json` với workspaces partner/admin (Docker frontend dùng `npm install`)
4. Trên Windows dev, chạy restore test qua script in-container (tránh corrupt gzip qua PowerShell pipe)

---

## Không thực hiện

- Không deploy server production
- Không thêm business feature
- Không thay đổi business logic

---

## Kết luận

Gói deployment **đạt audit 6A.1** với điều kiện: điền `.env.production`, mount SSL, bật HTTPS nginx, smoke test trên staging trước go-live.

**Next:** Phase 6B — Staging deploy + E2E smoke (ngoài scope).
