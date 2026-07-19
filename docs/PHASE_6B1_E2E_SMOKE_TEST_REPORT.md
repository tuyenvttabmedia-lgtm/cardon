# CardOn.vn — Phase 6B.1: E2E Smoke Test Report

**Ngày:** 2026-06-19  
**Phạm vi:** Smoke test tooling + verify flows trên local production sim (Docker) — **không VPS**, **không đổi business logic**  
**Verdict:** **PASS** — 27/27 kiểm tra PASS (T2–T5 tự động + T6 restart thủ công)

---

## Executive summary

| Hạng mục | Kết quả |
|----------|---------|
| TASK 1 — `scripts/create-smoke-data.ts` | **PASS** — upsert customer, agent, catalog, credentials |
| TASK 2 — Customer flow | **PASS** — order → SePay webhook → mock fulfillment → card |
| TASK 3 — Agent flow | **PASS** — portal login, balance, API buy, HOLD/DEBIT |
| TASK 4 — Finance verify | **PASS** — revenue/cost/profit, agent statement |
| TASK 5 — Admin verify | **PASS** — orders, payments, agents, providers, finance |
| TASK 6 — Restart recovery | **PASS** — api/worker restart, 8 orders giữ nguyên, `/health/ready` OK |

---

## Files tạo (Phase 6B.1)

| File | Mục đích |
|------|----------|
| `scripts/create-smoke-data.ts` | Bootstrap smoke data (không tự chạy, không truncate DB) |
| `scripts/run-e2e-smoke.mjs` | Runner verify TASK 2–6 qua HTTP API |
| `docker-compose.smoke.yml` | Override `APP_ENV=staging` + `ESALE_USE_MOCK=true` (local only) |
| `scripts/.smoke-credentials.json` | Credentials generated (gitignored) |

**Runtime fix (infra, không business logic):** `AppLoggerService` — tránh vòng lặp logger khi `APP_ENV≠production` (cần cho smoke override).

---

## Cách chạy

```bash
# 1. Stack local production + smoke mock eSale
docker compose \
  -f docker-compose.production.yml \
  -f docker-compose.local-production.yml \
  -f docker-compose.smoke.yml \
  --env-file .env.local-production \
  up -d --build --force-recreate api worker

# 2. RBAC admin (nếu chưa có)
docker exec -e LOCAL_ADMIN_EMAIL=superadmin@cardon.vn \
  -e LOCAL_ADMIN_PASSWORD=ChangeMe123! \
  cardon-prod-api node --experimental-strip-types /app/scripts/create-admin-local.ts

# 3. Smoke data (one-time / idempotent upsert)
docker exec cardon-prod-api node --experimental-strip-types /app/scripts/create-smoke-data.ts

# 4. Chạy smoke test (trong container, qua nginx)
docker exec -e SMOKE_BASE_URL=http://nginx \
  cardon-prod-api node /app/scripts/run-e2e-smoke.mjs

# 5. Restart test (host)
docker compose -f docker-compose.production.yml \
  -f docker-compose.local-production.yml \
  -f docker-compose.smoke.yml \
  --env-file .env.local-production restart api worker
```

**Lưu ý:** Script `create-smoke-data.ts` cũng:
- Tạo user audit provider `system@cardon.local` (bắt buộc cho fulfillment)
- Reset order zombie `PROCESSING` không có `provider_transactions` (smoke cleanup an toàn)

---

## TASK 1 — Smoke data

| Entity | Giá trị |
|--------|---------|
| Customer | `customer@smoke.test` / `ChangeMe123!` |
| Agent | `agent@smoke.test` / `ChangeMe123!` — ACTIVE, KYC APPROVED, API enabled |
| Agent balance | 10.000.000 VND (CREDIT ledger) |
| Admin | `superadmin@cardon.vn` |
| System audit | `system@cardon.local` |
| SKU | `SMOKE-ZING-100K` → provider ESALE mapping |
| API credentials | Ghi vào `scripts/.smoke-credentials.json` (trong container `/app/scripts/`) |

---

## TASK 2 — Customer flow

| Bước | Kết quả |
|------|---------|
| Mở http://localhost | **PASS** |
| Tạo guest order | **PASS** — `ORD-20260619-3EF383` |
| SePay payment + webhook | **PASS** — `PAY-45522D767C3E4DD7A9B9` |
| Mock provider fulfillment | **PASS** — `fulfillmentStatus=COMPLETED` |
| Card delivery | **PASS** — 1 card visible |

---

## TASK 3 — Agent flow

| Bước | Kết quả |
|------|---------|
| Login partner (`/api/v1/auth/login`) | **PASS** |
| Balance visible | **PASS** — available ~9.900.000 VND sau HOLD |
| API credential status | **PASS** — `hasCredentials=true` |
| `POST /api/partner/v1/cards/buy` | **PASS** — HMAC signature, `tx=SUCCESS` |
| Ledger HOLD | **PASS** |
| Ledger DEBIT | **PASS** |
| Transaction history | **PASS** — `GET /api/partner/v1/transactions/:request_id` |

---

## TASK 4 — Finance verify

| Metric | Giá trị smoke run |
|--------|-------------------|
| Revenue | 200.000 VND |
| Provider cost | 190.000 VND |
| Gross profit | 10.000 VND |
| Agent statement | 4 ledger entries |
| Reconcile reports | API OK |

---

## TASK 5 — Admin verify

| View | Kết quả |
|------|---------|
| Dashboard | **PASS** |
| Orders | **PASS** — 8 orders |
| Payments | **PASS** — 3 payments |
| Agents | **PASS** — smoke agent listed |
| Providers | **PASS** — ESALE active |
| Finance profit | **PASS** — `orderCount=2` (completed trong window) |

---

## TASK 6 — Restart recovery

| Kiểm tra | Kết quả |
|----------|---------|
| Order count trước restart | **8** |
| `docker compose restart api worker` | **OK** |
| `/health/ready` sau restart | **PASS** — `ready: true`, workers OK |
| Order count sau restart | **8** (không mất dữ liệu) |
| Worker heartbeat | **PASS** |

---

## Kết quả chi tiết (automated runner)

| Task | Kết quả | Chi tiết |
|------|---------|----------|
| T2 — Open localhost | **PASS** | GET / → HTTP 200 |
| T2 — Catalog variant | **PASS** | variantId=b4c9639c-f84b-406c-b037-b92ce29fc539 |
| T2 — Create order | **PASS** | orderCode=ORD-20260619-3EF383 |
| T2 — Create payment | **PASS** | ref=PAY-45522D767C3E4DD7A9B9 |
| T2 — Payment webhook | **PASS** | SePay webhook accepted |
| T2 — Provider fulfillment | **PASS** | fulfillmentStatus=COMPLETED, paymentStatus=PAID |
| T2 — Card visible | **PASS** | 1 card(s) |
| T3 — Partner login + balance | **PASS** | availableBalance=9900000.00 VND |
| T3 — API credential visible | **PASS** | hasCredentials=true, apiEnabled=true |
| T3 — POST /api/partner/v1/cards/buy | **PASS** | status=201, tx=SUCCESS |
| T3 — Transaction SUCCESS | **PASS** | SUCCESS |
| T3 — Ledger HOLD | **PASS** | HOLD entry found |
| T3 — Ledger DEBIT | **PASS** | DEBIT entry found |
| T4 — Revenue / cost / profit | **PASS** | revenue=200000, providerCost=190000, grossProfit=10000 |
| T4 — Agent ledger statement | **PASS** | entries=4 |
| T4 — Reconciliation reports | **PASS** | count=ok |
| T5 — Admin dashboard | **PASS** | metrics OK |
| T5 — Admin orders | **PASS** | listed=8 |
| T5 — Admin payments | **PASS** | listed=3 |
| T5 — Admin agents | **PASS** | agentId=288ff664-87bc-4dd3-bf9a-5ebb820a7bcf |
| T5 — Admin providers | **PASS** | ESALE listed |
| T5 — Admin finance | **PASS** | orderCount=2 |
| T6 — Restart recovery | **PASS** | orders 8→8, health ready, workers ok |

---

## Known notes

1. **`docker-compose.smoke.yml`** chỉ dùng local — bật `ESALE_USE_MOCK=true` qua `APP_ENV=staging`; không dùng trên VPS production thật.
2. **Credentials** nằm trong container tại `/app/scripts/.smoke-credentials.json` — không commit (gitignored).
3. Phase 6B.1 **dừng tại smoke test** — chưa deploy VPS.

---

*Generated Phase 6B.1 — không deploy VPS.*
