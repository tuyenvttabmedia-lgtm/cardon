# CardOn.vn — Production Launch Checklist

**Phase 6C — Chuẩn bị go-live (chưa deploy)**  
Dùng checklist này trước khi bật traffic production thật. Đánh dấu từng mục khi hoàn tất.

---

## Trước khi bắt đầu

| # | Mục | Owner | Done |
|---|-----|-------|------|
| 0.1 | E2E smoke test PASS (Phase 6B.1) | Dev | ☐ |
| 0.2 | Pre-deploy audit PASS (Phase 6A.1) | Dev | ☐ |
| 0.3 | Backup & restore plan đã đọc (`docs/BACKUP_RESTORE_PLAN.md`) | Ops | ☐ |
| 0.4 | `.env.production` điền đủ — **không commit** | Ops | ☐ |
| 0.5 | Rollback plan: giữ image tag / compose version trước deploy | Ops | ☐ |

---

## 1. MegaPay Production

| # | Mục | Ghi chú | Done |
|---|-----|---------|------|
| 1.1 | Tài khoản merchant production được kích hoạt | Liên hệ MegaPay BD | ☐ |
| 1.2 | `MEGAPAY_MERCHANT_ID` — ID merchant production | `.env.production` | ☐ |
| 1.3 | `MEGAPAY_SECRET_KEY` — secret ký request | Không dùng sandbox key | ☐ |
| 1.4 | `MEGAPAY_ENDPOINT` — URL API production | Xác nhận với MegaPay | ☐ |
| 1.5 | `MEGAPAY_WEBHOOK_SECRET` — verify webhook HMAC | Lưu trong secret manager | ☐ |
| 1.6 | `MEGAPAY_RETURN_URL` = `https://cardon.vn/checkout/result` | Khớp domain SSL | ☐ |
| 1.7 | `MEGAPAY_CALLBACK_URL` = `https://cardon.vn/api/v1/payments/webhook/megapay` | Whitelist IP nếu MegaPay yêu cầu | ☐ |
| 1.8 | Webhook test từ MegaPay dashboard → order PAID | Log `webhook_logs` | ☐ |
| 1.9 | `queryTransaction` test với payment_reference thật | Admin / reconcile | ☐ |
| 1.10 | Tắt / không dùng mock payment adapter | `APP_ENV=production` | ☐ |

**Tham chiếu:** `docs/04_MEGAPAY_INTEGRATION.md`, `.env.production.example`

---

## 2. SePay Production

| # | Mục | Ghi chú | Done |
|---|-----|---------|------|
| 2.1 | Tài khoản SePay / tài khoản ngân hàng nhận tiền production | Số TK doanh nghiệp | ☐ |
| 2.2 | `SEPAY_API_KEY` — Apikey webhook (`Authorization: Apikey …`) | SePay dashboard | ☐ |
| 2.3 | `SEPAY_WEBHOOK_SECRET` — HMAC (nếu bật) | Optional nhưng khuyến nghị | ☐ |
| 2.4 | `SEPAY_BANK_ACCOUNT` — số tài khoản hiển thị QR | Khớp TK thật | ☐ |
| 2.5 | `SEPAY_BANK_CODE` — mã ngân hàng (VD: `MB`, `VCB`) | Theo SePay docs | ☐ |
| 2.6 | `SEPAY_ACCOUNT_NAME` — tên chủ TK trên QR | Khớp giấy phép DN | ☐ |
| 2.7 | Webhook URL đăng ký SePay: `https://cardon.vn/api/v1/payments/webhook/sepay` | Public HTTPS | ☐ |
| 2.8 | Nội dung chuyển khoản: `CARDON {payment_reference}` | Khớp `sepay.types.ts` | ☐ |
| 2.9 | Test chuyển khoản nhỏ (1.000–10.000 VND) → order PAID | End-to-end | ☐ |
| 2.10 | Kiểm tra duplicate webhook (gửi 2 lần) → idempotent 200 | Không double fulfill | ☐ |

**Tham chiếu:** `docs/04_SEPAY_INTEGRATION.md`

---

## 3. eSale Production

| # | Mục | Ghi chú | Done |
|---|-----|---------|------|
| 3.1 | Hợp đồng / tài khoản agency eSale production | Agency code thật | ☐ |
| 3.2 | `ESALE_API_URL_CARD` — endpoint card shop production | Không dùng example.com | ☐ |
| 3.3 | `ESALE_API_URL_TOPUP` — endpoint topup production | Nếu bán topup | ☐ |
| 3.4 | `ESALE_AGENCY_CODE`, `ESALE_CLIENT_CODE`, `ESALE_SECRET_KEY` | Từ eSale | ☐ |
| 3.5 | `ESALE_PRIVATE_KEY` / `ESALE_PUBLIC_KEY` — PEM đúng format `\n` | Verify signature | ☐ |
| 3.6 | `ESALE_USE_MOCK` — **phải false / không set** | `production-env.rules.ts` chặn mock | ☐ |
| 3.7 | Sync provider products → mapping SKU ↔ `providerProductCode` | Admin providers | ☐ |
| 3.8 | Check balance provider ≥ `PROVIDER_LOW_BALANCE_THRESHOLD` | Alert email | ☐ |
| 3.9 | Test buy card 1 mệnh giá nhỏ → `fulfillmentStatus=COMPLETED` | Không mock | ☐ |
| 3.10 | User audit `system@cardon.local` tồn tại (provider audit actor) | Bootstrap script | ☐ |

**Tham chiếu:** `docs/04_PROVIDER_ESALE.md`, `docs/04_ESALE_BUYCARD_API.md`

---

## 4. SMTP (Email)

| # | Mục | Ghi chú | Done |
|---|-----|---------|------|
| 4.1 | SMTP host production (`SMTP_HOST`, `SMTP_PORT`) | VD: SendGrid, AWS SES, Mailgun | ☐ |
| 4.2 | `SMTP_USER`, `SMTP_PASS` — credentials | Không placeholder | ☐ |
| 4.3 | `SMTP_FROM` = `noreply@cardon.vn` (hoặc domain đã verify) | SPF/DKIM | ☐ |
| 4.4 | `SMTP_SECURE` — TLS (`true` port 465 / `false` STARTTLS 587) | Test connection | ☐ |
| 4.5 | `ADMIN_ALERT_EMAIL` — nhận alert ops | ops@ / on-call | ☐ |
| 4.6 | Gửi test: payment success, fulfillment failed, low balance | Notification worker | ☐ |
| 4.7 | DNS: SPF record cho domain gửi mail | Cloudflare DNS | ☐ |
| 4.8 | DNS: DKIM record (nếu provider yêu cầu) | Cloudflare DNS | ☐ |
| 4.9 | DMARC policy (`p=none` → `quarantine` sau ổn định) | Bảo vệ brand | ☐ |

---

## 5. DNS

| # | Record | Type | Value | Done |
|---|--------|------|-------|------|
| 5.1 | `cardon.vn` | A | IP VPS origin | ☐ |
| 5.2 | `www.cardon.vn` | CNAME | `cardon.vn` hoặc A | ☐ |
| 5.3 | `partner.cardon.vn` | A / CNAME | IP VPS | ☐ |
| 5.4 | `admin.cardon.vn` | A / CNAME | IP VPS | ☐ |
| 5.5 | `api` subdomain (nếu tách) | — | CardOn dùng path `/api/` trên cùng domain | ☐ |
| 5.6 | MX (nếu nhận mail @cardon.vn) | MX | Mail provider | ☐ |
| 5.7 | TXT SPF | TXT | `v=spf1 include:… -all` | ☐ |
| 5.8 | TXT DKIM | TXT | Theo SMTP provider | ☐ |
| 5.9 | TTL | — | Giảm TTL 300s trước cutover, tăng lại sau | ☐ |
| 5.10 | Verify propagation | — | `dig`, `nslookup` từ nhiều region | ☐ |

**Domain mapping (nginx):** `infra/nginx/conf.d/` — `cardon.vn`, `partner.cardon.vn`, `admin.cardon.vn`

---

## 6. Cloudflare

| # | Mục | Ghi chú | Done |
|---|-----|---------|------|
| 6.1 | Domain `cardon.vn` added to Cloudflare | Nameserver trỏ CF | ☐ |
| 6.2 | SSL/TLS mode: **Full (strict)** | Origin cert required | ☐ |
| 6.3 | Origin certificate tạo & mount (`infra/nginx/ssl/`) | `cardon.vn.pem`, `.key` | ☐ |
| 6.4 | HTTPS server blocks uncommented trong nginx conf | Reload nginx | ☐ |
| 6.5 | Always Use HTTPS — ON | Edge setting | ☐ |
| 6.6 | Minimum TLS Version — 1.2+ | Security | ☐ |
| 6.7 | WAF — managed rules basic | Bot / OWASP | ☐ |
| 6.8 | Rate limiting edge (optional) — bảo vệ login / webhook flood | CF Pro+ hoặc nginx | ☐ |
| 6.9 | Cache: **Bypass** cho `/api/*`, cache static assets web | Page Rules / Cache Rules | ☐ |
| 6.10 | Real IP header: `CF-Connecting-IP` → nginx `set_real_ip_from` | Log & rate limit đúng IP | ☐ |
| 6.11 | Firewall rule: chặn truy cập `admin.cardon.vn` theo IP ops (optional) | Zero Trust / IP allowlist | ☐ |
| 6.12 | Calendar reminder: renew origin cert (~15 năm CF origin) | `infra/nginx/ssl/README.md` | ☐ |

---

## 7. Application & Infrastructure (tóm tắt)

| # | Mục | Done |
|---|-----|------|
| 7.1 | `docker compose -f docker-compose.production.yml up -d --build` | ☐ |
| 7.2 | `prisma migrate deploy` — 7 migrations | ☐ |
| 7.3 | Bootstrap SUPER_ADMIN (không chạy `prisma db seed` production) | ☐ |
| 7.4 | `/health` và `/health/ready` — all OK | ☐ |
| 7.5 | Worker heartbeat Redis OK | ☐ |
| 7.6 | Import catalog từ template (`launch/catalog/`) — **sau legal review giá** | ☐ |
| 7.7 | Publish CMS legal pages (`launch/cms/`) | ☐ |
| 7.8 | Deploy `robots.txt`, `sitemap.xml` (`launch/seo/`) | ☐ |
| 7.9 | Upload OpenGraph images lên CDN / `public/og/` | ☐ |
| 7.10 | Monitoring: disk, memory, postgres connections, queue depth | ☐ |

---

## 8. Go / No-Go

| Gate | Điều kiện | Sign-off |
|------|-----------|----------|
| Payment | MegaPay + SePay webhook test PASS | ☐ |
| Fulfillment | eSale live buy 1 card PASS | ☐ |
| Email | SMTP test PASS | ☐ |
| Security | Admin policy + API key policy documented | ☐ |
| Legal | Terms / Privacy / Refund / Agent Agreement published | ☐ |
| Ops | SOP đọc & phân công on-call | ☐ |

**Không go-live** nếu bất kỳ gate payment/fulfillment chưa PASS.

---

*Phase 6C — checklist only, chưa deploy.*
