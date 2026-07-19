# =============================================================================
# CardOn.vn — Phase 6A: Production Deployment Preparation Report
# Date: 2026-06-18
# Status: PREPARATION ONLY — chưa deploy lên server thật
# =============================================================================

## Tổng quan

| Task | Mô tả | Kết quả |
|------|--------|---------|
| 1 | `docker-compose.production.yml` | **PASS** |
| 2 | Dockerfiles multi-stage | **PASS** |
| 3 | `.env.production.example` | **PASS** |
| 4 | Nginx config | **PASS** |
| 5 | SSL documentation | **PASS** |
| 6 | Migration process | **PASS** (documented) |
| 7 | Backup scripts | **PASS** |
| 8 | Health monitoring | **PASS** |
| 9 | Production build test | **PASS** (see notes) |
| 10 | Báo cáo này | **PASS** |

---

## TASK 1 — Production Docker Compose

**File:** `docker-compose.production.yml`

| Service | Image / Build | Port nội bộ | Restart |
|---------|---------------|-------------|---------|
| `postgres` | postgres:16-alpine | 5432 | unless-stopped |
| `redis` | redis:7-alpine | 6379 | unless-stopped |
| `api` | `docker/Dockerfile.api` | 3000 | unless-stopped |
| `worker` | same image, `APP_ROLE=worker` | — | unless-stopped |
| `web` | `docker/Dockerfile.frontend` (web) | 3001 | unless-stopped |
| `partner` | `docker/Dockerfile.frontend` (partner) | 3002 | unless-stopped |
| `admin` | `docker/Dockerfile.frontend` (admin) | 3003 | unless-stopped |
| `nginx` | nginx:1.27-alpine | 80, 443 (public) | unless-stopped |

Chạy local/staging (không deploy production thật):

```bash
cp .env.production.example .env.production
# điền secrets
docker compose --env-file .env.production -f docker-compose.production.yml up -d --build
```

---

## TASK 2 — Dockerfiles

| File | Mục đích |
|------|----------|
| `docker/Dockerfile.api` | NestJS API + Worker (multi-stage: deps → build → runner) |
| `docker/Dockerfile.frontend` | Next.js standalone (multi-stage, arg `APP_DIR`) |
| `docker/entrypoint-api.sh` | Optional `prisma migrate deploy` khi `RUN_MIGRATIONS=true` |
| `docker/scripts/check-worker-heartbeat.mjs` | Healthcheck worker qua Redis |
| `.dockerignore` | Loại trừ node_modules, .next, secrets |

Frontend Next.js đã bật `output: 'standalone'` trong:
- `apps/web/next.config.ts`
- `apps/partner/next.config.ts`
- `apps/admin/next.config.ts`

---

## TASK 3 — Environment templates

**File:** `.env.production.example`

| Nhóm | Biến chính |
|------|------------|
| Infrastructure | `POSTGRES_*` |
| API + Worker | `JWT_*`, `ENCRYPTION_KEY`, `DATABASE_URL` (auto trong compose), `CORS_ORIGINS`, `WORKER_HEARTBEAT_REQUIRED` |
| MegaPay | `MEGAPAY_*` |
| SePay | `SEPAY_*` |
| eSale | `ESALE_*` |
| SMTP | `SMTP_*`, `ADMIN_ALERT_EMAIL` |
| Frontend build | `WEB_*`, `PARTNER_*`, `ADMIN_*` (`NEXT_PUBLIC_*`) |

Không có secret thật — chỉ placeholder.

---

## TASK 4 — Nginx

**Thư mục:** `infra/nginx/`

| Domain | Upstream |
|--------|----------|
| `cardon.vn`, `www.cardon.vn` | `web:3001` + proxy `/api/` → `api:3000` |
| `partner.cardon.vn` | `partner:3002` + `/api/` → API |
| `admin.cardon.vn` | `admin:3003` + `/api/` → API |

Routing `/api/*` → backend NestJS (prefix `api/v1`, `api/partner/v1`).

---

## TASK 5 — SSL (Cloudflare)

Chi tiết: `infra/nginx/ssl/README.md`

1. Cloudflare SSL mode: **Full (strict)**
2. Tạo **Origin Certificate** (`*.cardon.vn`)
3. Mount PEM/key vào `infra/nginx/ssl/`
4. Uncomment block HTTPS trong `conf.d/*.conf`
5. **Renewal:** Origin cert Cloudflare 15 năm — renew thủ công; hoặc dùng Let's Encrypt + certbot (auto cron)

---

## TASK 6 — Database migration process

### Thứ tự deploy (production)

```
1. Backup DB          → ./scripts/backup-db.sh
2. Pull/build images  → docker compose ... build
3. Migration          → RUN_MIGRATIONS=true trên service api (entrypoint chạy prisma migrate deploy)
4. Start worker       → sau khi api healthy
5. Start frontends    → web, partner, admin
6. Start nginx        → sau khi upstreams sẵn sàng
7. Smoke test         → curl /health/ready, kiểm tra web
```

### Rollback

```
1. docker compose -f docker-compose.production.yml stop api worker web partner admin nginx
2. ./scripts/restore-db.sh backups/cardon_cardon_YYYYMMDD_HHMMSS.sql.gz
3. Deploy lại image/tag phiên bản trước (git tag / registry tag)
4. RUN_MIGRATIONS=false nếu migration mới gây lỗi — restore DB về trước migration
5. docker compose ... up -d
6. Xác minh /health/ready và worker heartbeat
```

**Lưu ý:** Nếu migration đã chạy thành công và không thể revert schema, rollback = restore backup + deploy code cũ tương thích schema đó.

---

## TASK 7 — Backup scripts

| Script | Mô tả |
|--------|--------|
| `scripts/backup-db.sh` | `pg_dump` → gzip, lưu `backups/`, retention 14 ngày |
| `scripts/restore-db.sh` | Restore từ `.sql.gz`, có confirm prompt |

Volume postgres mount `./backups:/backups` để backup trong container.

---

## TASK 8 — Health monitoring

| Component | Healthcheck |
|-----------|-------------|
| API | `GET /health/ready` (DB + Redis + worker nếu `WORKER_HEARTBEAT_REQUIRED=true`) |
| Worker | Redis key `cardon:worker:heartbeat` (TTL 90s, beat mỗi 30s) |
| Web / Partner / Admin | HTTP GET `/` |
| Postgres | `pg_isready` |
| Redis | `redis-cli ping` |
| Nginx | `wget http://api:3000/health` |

Docker: `restart: unless-stopped` trên tất cả services.

Endpoints monitoring bên ngoài (khuyến nghị):
- `https://cardon.vn/health`
- `https://cardon.vn/api/v1/...` (optional synthetic)

---

## TASK 9 — Production build test

| Build | Kết quả |
|-------|---------|
| `npm run build` (NestJS) | **PASS** |
| `npm run build:web` | **PASS** (8 routes) |
| `npm run build:partner` | **PASS** (11 routes, standalone OK trong Linux Docker) |
| `npm run build:admin` | **PASS** (13 routes) |
| `docker compose -f docker-compose.production.yml config` | **PASS** |
| `docker build -f docker/Dockerfile.api` | **PASS** |
| `docker build -f docker/Dockerfile.frontend` (web) | **PASS** |

**Ghi chú Windows dev:** Build standalone partner/admin có thể cảnh báo symlink EPERM trên Windows — không ảnh hưởng Docker Linux build.

**Khuyến nghị:** Chạy `npm install` ở root để sync `package-lock.json` với workspaces `partner` + `admin` trước khi chuyển sang `npm ci` trong CI.

---

## Server requirements (khuyến nghị tối thiểu)

| Resource | Tối thiểu | Khuyến nghị |
|----------|-----------|-------------|
| CPU | 2 vCPU | 4 vCPU |
| RAM | 4 GB | 8 GB |
| Disk | 40 GB SSD | 80 GB SSD |
| OS | Ubuntu 22.04 LTS | Ubuntu 24.04 LTS |
| Docker | 24+ | Docker Compose v2 |
| Network | Ports 80, 443 public | Cloudflare proxy |

Services RAM ước tính: postgres ~512MB, redis ~128MB, api ~256MB, worker ~256MB, mỗi Next.js ~128MB, nginx ~64MB.

---

## Deployment steps (checklist)

- [ ] DNS: `cardon.vn`, `www`, `partner`, `admin` → server IP (Cloudflare proxied)
- [ ] Copy `.env.production.example` → `.env.production`, điền secrets
- [ ] Cloudflare Origin Certificate → `infra/nginx/ssl/`
- [ ] Uncomment HTTPS blocks trong nginx conf
- [ ] `./scripts/backup-db.sh` (nếu upgrade)
- [ ] `docker compose --env-file .env.production -f docker-compose.production.yml build`
- [ ] `docker compose --env-file .env.production -f docker-compose.production.yml up -d`
- [ ] `curl https://cardon.vn/health/ready`
- [ ] Kiểm tra worker: Redis `GET cardon:worker:heartbeat`
- [ ] Smoke test checkout, partner login, admin login

---

## Files created / modified

```
docker-compose.production.yml
docker/Dockerfile.api
docker/Dockerfile.frontend
docker/entrypoint-api.sh
docker/scripts/check-worker-heartbeat.mjs
.dockerignore
.env.production.example
infra/nginx/nginx.conf
infra/nginx/conf.d/cardon.vn.conf
infra/nginx/conf.d/partner.cardon.vn.conf
infra/nginx/conf.d/admin.cardon.vn.conf
infra/nginx/ssl/README.md
scripts/backup-db.sh
scripts/restore-db.sh
backups/.gitkeep
apps/web/next.config.ts          (+ output: standalone)
apps/partner/next.config.ts       (+ output: standalone)
apps/admin/next.config.ts         (+ output: standalone)
docs/PHASE_6A_DEPLOYMENT_PREP_REPORT.md
```

---

## Không thực hiện

- Không deploy lên server production
- Không thay đổi business logic
- Không commit `.env.production` hoặc SSL private keys

---

## Next phase (ngoài scope 6A)

- Phase 6B: Deploy staging + smoke test end-to-end
- Sync `package-lock.json` workspaces trong CI
- Container registry + tagged releases
- Monitoring (Prometheus/Grafana hoặc Uptime Kuma)
