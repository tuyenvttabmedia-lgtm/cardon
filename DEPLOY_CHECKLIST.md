# CardOn.vn — Production Deploy Checklist

## Before deploy

- [ ] Copy `.env.production.example` → `.env.production` và điền **tất cả** secrets
- [ ] Xác nhận `JWT_SECRET`, `ENCRYPTION_KEY` ≥ 32 ký tự, không dùng placeholder
- [ ] **Backup secrets (bắt buộc trước deploy / sau đổi key):**
  - [ ] `JWT_SECRET` — lưu vault/password manager an toàn (mất key → toàn bộ session invalid)
  - [ ] `ENCRYPTION_KEY` — lưu vault an toàn (mất key → **không giải mã** được card data + settings DB đã mã hóa)
  - [ ] Provider credentials — MegaPay, SePay, eSale (ENV **hoặc** export từ Admin Settings; ghi rõ sandbox/production)
  - [ ] SMTP credentials nếu cấu hình qua Admin Settings
- [ ] Xác nhận `ESALE_USE_MOCK=false` (compose đã hardcode)
- [ ] Xác nhận MegaPay, SePay, eSale, SMTP credentials production (không sandbox)
- [ ] Frontend build args trỏ domain production:
  - `WEB_NEXT_PUBLIC_*` → `https://cardon.vn`
  - `PARTNER_NEXT_PUBLIC_*` → `https://partner.cardon.vn`
  - `ADMIN_NEXT_PUBLIC_*` → `https://admin.cardon.vn`
- [ ] DNS: `cardon.vn`, `www`, `partner`, `admin` → server (Cloudflare proxied)
- [ ] Cloudflare SSL: **Full (strict)**
- [ ] Origin certificate mount vào `infra/nginx/ssl/`
- [ ] Uncomment HTTPS blocks + HTTP→HTTPS redirect trong nginx conf
- [ ] Chạy `./scripts/backup-db.sh` (nếu upgrade DB hiện có)
- [ ] Chạy `./scripts/test-backup-restore.sh` (staging/local)
- [ ] `docker compose --env-file .env.production -f docker-compose.production.yml config`
- [ ] `docker compose ... build` — verify images

## During deploy

- [ ] Dừng traffic cũ (maintenance page nếu cần)
- [ ] `docker compose --env-file .env.production -f docker-compose.production.yml pull` (nếu dùng registry)
- [ ] `docker compose ... up -d postgres redis` — đợi healthy
- [ ] `docker compose ... up -d api` — migration tự chạy (`RUN_MIGRATIONS=true`)
- [ ] Kiểm tra log API: `prisma migrate deploy` thành công
- [ ] **Không** chạy `prisma db seed` trên production
- [ ] `docker compose ... up -d worker` — đợi heartbeat
- [ ] `docker compose ... up -d web partner admin nginx`
- [ ] `docker compose ps` — tất cả healthy

## After deploy

- [ ] `curl https://cardon.vn/health/ready` → `ready: true`
- [ ] Worker heartbeat: Redis `GET cardon:worker:heartbeat` fresh
- [ ] Customer web load + login/checkout smoke
- [ ] Partner portal login + API smoke
- [ ] Admin panel login + dashboard
- [ ] Webhook test (MegaPay/SePay sandbox → production callback URL)
- [ ] Kiểm tra email SMTP (alert test)
- [ ] Monitor logs 30 phút — không secret leak
- [ ] Sau đổi cấu hình Admin Settings: xác nhận payment/provider dùng giá trị mới **không cần restart container** (cache reload tự động)
- [ ] `./scripts/backup-db.sh` post-deploy snapshot
- [ ] Ghi lại version/tag deployed

## Rollback (nếu cần)

- [ ] `docker compose ... stop api worker web partner admin nginx`
- [ ] `./scripts/restore-db.sh backups/<pre-deploy-backup>.sql.gz`
- [ ] Deploy image/tag phiên bản trước
- [ ] `RUN_MIGRATIONS=false` nếu schema không tương thích
- [ ] `docker compose ... up -d`
- [ ] Verify `/health/ready`

## Never do in production

- `prisma db seed` (seed từ chối khi `APP_ENV=production`)
- Expose postgres/redis ports ra public
- Commit `.env.production` hoặc SSL private keys
- Deploy với `localhost` trong `NEXT_PUBLIC_*` URLs
