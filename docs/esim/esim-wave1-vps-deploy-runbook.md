# Wave 1 — Deploy VPS runbook (Airalo eSIM + refund, sales OFF)

**PR:** https://github.com/tuyenvttabmedia-lgtm/cardon/pull/107  
**Branch:** `feat/esim-airalo-refund`  
**Mục tiêu:** Đưa schema/code eSIM + refund lên prod với **bán khách tắt**. Không mở SePay/PayPal eSIM checkout, không arm Airalo live trừ khi checklist riêng.

Localhost Wave 2 (Finance F0–F3, SePay IPN đầy đủ, …) nằm nhánh `feat/esim-wave2-localhost-wip` — **không** deploy trong wave này.

---

## 0. Trước khi đụng VPS

- [ ] PR #107 merged vào `main` (CI xanh)
- [ ] Backup Postgres prod (dump + ghi timestamp)
- [ ] Backup `.env.production` hiện tại trên VPS
- [ ] Có cửa sổ rollback (giữ image/tag hoặc tarball cũ)

---

## 1. Env bắt buộc (sales OFF / an toàn)

Trên VPS `.env.production` (hoặc tương đương):

```bash
ESIM_ENABLED=false
ESIM_PROVIDER_MODE=mock
ESIM_LIVE_ARM=false
PAYPAL_ESIM_ENABLED=false
# PAYPAL_MODE=sandbox   # hoặc live chỉ khi đủ CLIENT/SECRET/WEBHOOK_ID và KHÔNG bật esim checkout
```

DB settings (sau khi API lên):

- `customerEsimEnabled` = **false** (admin System / seed không tự bật)

Nếu vô tình set `PAYPAL_ESIM_ENABLED=true` → process **không start** (production-env.rules).

---

## 2. Code + migrate

Trên VPS (đường dẫn repo thực tế của bạn):

```bash
cd /path/to/cardon
git fetch origin
git checkout main
git pull origin main

# Backup DB trước
# pg_dump ... > backup-before-esim-wave1-$(date +%Y%m%d%H%M).sql

npx prisma migrate deploy
# Kỳ vọng apply:
# 20261009160000_esim_phase_a_mock
# 20261016150000_paypal_gateway_and_airalo
# 20261023100000_esim_airalo_catalogue_lifecycle
# 20261027160000_refund_request_attempt

node scripts/deploy/sync-rbac-production.mjs
```

Verify:

```bash
npx prisma migrate status
# và/hoặc SQL: SELECT migration_name FROM _prisma_migrations ORDER BY finished_at DESC LIMIT 10;
```

---

## 3. Build & restart

Theo stack hiện tại (Docker Compose production hoặc build + pm2):

```bash
# Ví dụ Docker Compose production
docker compose -f docker-compose.production.yml --env-file .env.production build api worker admin web
docker compose -f docker-compose.production.yml --env-file .env.production up -d api worker admin web
# (+ nginx nếu cần reload)
```

Hoặc tương đương `npm run build` + restart pm2 `cardon-api` / `cardon-worker` / frontends.

Confirm logs boot **không** lỗi Joi/production-env; API health OK.

---

## 4. Smoke (bán vẫn tắt)

- [ ] Admin login OK  
- [ ] Menu eSIM Ops / Products eSIM / Refunds hiện (RBAC)  
- [ ] Storefront `/esim` — notice off / không tạo đơn khách  
- [ ] Bán thẻ game / nạp cước / ví đại lý SePay **vẫn OK** (1 smoke đơn hoặc health)  
- [ ] Không có payment PayPal eSIM được create từ khách  

---

## 5. Sau Wave 1 (chưa làm)

| Việc | Wave |
|------|------|
| Sync catalogue Airalo (credential) | 1b — vẫn OFF bán |
| SePay eSIM IPN prod + mở bán VN | Wave 2+ |
| Finance F0/F1, charge limits, FX | Wave 2 (`feat/esim-wave2-localhost-wip`) |
| PayPal INTL + F3 CSV | Wave sau + đổi rule `PAYPAL_ESIM_ENABLED` |

---

## 6. Rollback nhanh

1. Checkout commit `main` trước merge PR #107  
2. Rebuild/restart  
3. **Không** reverse migration trừ khi DBA có kế hoạch riêng (migrations additive; để bảng eSIM trống thường an toàn hơn down migration)  

---

## 7. Người thực hiện

| Bước | Ai |
|------|-----|
| Merge PR #107 | Owner / agent khi được duyệt |
| Backup + migrate + restart VPS | Owner trên VPS (SSH) |
| Xác nhận smoke | Owner |

Agent **không** SSH prod CardOn trong session này trừ khi Owner cung cấp quy trình SSH tường minh.
