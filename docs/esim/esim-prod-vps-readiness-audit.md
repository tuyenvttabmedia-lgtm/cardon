# Audit sẵn sàng Prod VPS — toàn bộ tính năng eSIM (và liên quan)

**Ngày:** 2026-11-07  
**Phạm vi:** Working tree localhost + nhánh `origin/feat/esim-airalo-refund` so với `main` (`d827fc6`).  
**Không:** deploy, migrate prod, bật flag live, commit/push.

---

## 0. Kết luận ngắn

| Câu hỏi | Trả lời |
|---------|---------|
| Có thể “ném hết localhost lên VPS” ngay? | **Không** — working tree chưa commit, đang ngồi nhánh sai (`cursor/frontend-healthcheck-port`), lẫn rất nhiều thay đổi ngoài eSIM. |
| Có gói eSIM đã có PR/commit sẵn? | **Có một phần:** `origin/feat/esim-airalo-refund` (3 commit trên `main`) — Airalo + refund gate, **sales closed by default**. |
| Localhost đang hơn PR đó những gì? | Finance F0–F3, SePay eSIM IPN/sandbox, Ops KPI UX, charge limits Phase A, FX/snapshot USD, i18n web, CMS translations migration, v.v. — **chưa đóng gói PR**. |
| Prod có an toàn nếu chỉ merge PR eSIM? | **Tương đối an toàn hơn** nếu giữ `customerEsimEnabled=false`, không arm live, `PAYPAL_ESIM_ENABLED=false` (rule prod **cấm** bật flag này). |
| Finance F3 PayPal CSV? | Chỉ local; header **provisional**; chưa PASS formal; **không** chặn bán eSIM nhưng migration F3 cần quyết định có lên cùng wave hay tách. |

**Khuyến nghị wave prod:**  
**Wave 1** = merge/stabilize `feat/esim-airalo-refund` (+ chốt env/migration của PR) với bán eSIM **tắt mặc định**.  
**Wave 2** = đóng gói delta localhost (SePay IPN prod, Ops/Finance, charge limits, FX) thành PR riêng sau nghiệm thu.  
**Không** gộp một lần “toàn bộ dirty tree”.

---

## 1. Bản đồ nguồn code (quan trọng cho deploy)

| Nguồn | Nội dung eSIM | Trạng thái git |
|-------|---------------|----------------|
| `main` | Chưa có lane eSIM Airalo/PayPal/refund eSIM | Production baseline |
| `origin/feat/esim-airalo-refund` | Core: Airalo, catalogue, checkout gates, refund, Ops/products admin cơ bản, PayPal nền, sales closed default | 3 commit; có thể làm nền PR deploy |
| Working tree hiện tại (localhost) | PR ở trên **+** SePay eSIM đầy đủ, Finance F0–F3, charge limits, FX snapshot, i18n, CMS locale, IPN tunnel docs… | **Uncommitted / untracked** (~500+ path eSIM-related), branch `cursor/frontend-healthcheck-port` (chỉ 1 commit docker healthcheck so `main`) |

→ Trước khi lên VPS: **phải** tách/commit đúng nhánh, review diff so `main`, CI xanh. Không rsync working tree.

---

## 2. Phân hệ tính năng eSIM trên localhost

### 2.1 Core bán hàng & fulfillment (có trên PR + local)

| Hạng mục | Mô tả | Prod readiness |
|----------|--------|----------------|
| Module `src/modules/esim` | Order, quote, Airalo adapter, queue, catalog public, policy market | Có trên PR; local có thêm file |
| Catalog Airalo | Sync lifecycle, admin products/esim | Cần credential + sync trên VPS; không auto-sell nếu sales off |
| Market VN / INTL | VN→SePay VND; INTL→PayPal USD | Rules đã có; PayPal khách bị chặn env prod nếu bật `PAYPAL_ESIM_ENABLED` |
| Fulfillment | Worker queue Airalo sau PAID — không gọi trong webhook | Đúng kiến trúc CardOn |
| Install / LPA reveal | Customer + admin reveal; redact secret khỏi notification log (commit PR) | OK nếu giữ redact |
| Admin Ops `/esim-ops` | List/detail, claim, reveal | PR có nền; local có F0 KPI tabs |
| Admin test order | Sandbox/admin-test tách commerce | Không dùng làm KPI thương mại |
| Refund eSIM | Gate sau install secret; manual; RBAC | Có trên PR |

**Default an toàn (PR):** bán khách **đóng** (`customerEsimEnabled` / sales toggle off).  
**Prod env rule:** `PAYPAL_ESIM_ENABLED=true` → **fail boot** production (`production-env.rules.ts`). Live Airalo cần `ESIM_ENABLED` + `ESIM_PROVIDER_MODE=live` + `ESIM_LIVE_ARM` + Airalo credentials.

### 2.2 Thanh toán SePay eSIM (chủ yếu local, ngoài 3 commit PR)

| Hạng mục | Trạng thái | Prod note |
|----------|------------|-----------|
| Checkout `BANK_TRANSFER` / method `VIETQR` | Đã chạy local SUCCESS VND | Cần merchant SePay **prod**, IPN URL public, HMAC secret |
| IPN / HMAC eSIM | Docs phase-2b* (tunnel Cloudflare sandbox) | Prod: nginx/route IPN ổn định; **không** dùng tunnel sandbox |
| Agent wallet SePay | Tách webhook — không xóa VIETQR/NAPAS | Regression bắt buộc khi deploy |
| NAPAS_247 | Config tắt | Không đưa báo cáo eSIM; không xóa |

### 2.3 Thanh toán PayPal eSIM

| Hạng mục | Trạng thái | Prod note |
|----------|------------|-----------|
| Provider + webhook + capture | Local / PR nền | `PAYPAL_ESIM_ENABLED` **phải false** trên prod cho đến khi chốt live riêng |
| Checkout khách USD | Local đã có SUCCESS sandbox | Không bật live vội; rule prod đang chặn |
| Hạn mức PayPal | Rules + Phase A charge limits (local) | Đưa Wave 2 cùng charge limits |

### 2.4 Finance eSIM (local only — sau PR)

| Phase | Nội dung | Prod? |
|-------|----------|-------|
| **F0** Ops KPI UX | PASS local | An toàn (admin UI); nên kèm Wave 2 |
| **F1** `/finance/esim` revenue | Xác minh xong, **chưa ghi PASS chủ dự án** trên lock | Zero-migration; an toàn nếu RBAC OK |
| **F2-D** Visa design | Docs only | Không code |
| **F2-B** Bank recon VietQR | **HOÃN** | Không deploy |
| **F3-B** PayPal CSV fee | Implemented local; header **provisional**; chờ KEYON CSV + PASS | Migration `20261107180000_*` — chỉ lên nếu chấp nhận provisional hoặc chờ KEYON |
| **F4/F5** | Chưa | Không |

### 2.5 Khác liên quan (local / docs)

| Hạng mục | Ghi chú |
|----------|---------|
| Charge limits Phase A | Acceptance PASS WITH CONDITIONS; completion closed C1–C3 — nên có trong Wave 2 |
| FX / USD price snapshot | Phase 3 docs; migration `20261106140000_esim_price_snapshot_foundation` |
| i18n web (VI/EN) | Liên quan storefront eSIM; migration CMS translations `20261105120000_*` có thể cần nếu bật locale |
| Refund bank reference unique | `20261107140000_*` — nếu refund eSIM lên Wave 1/2 |
| eSIM Go | Kế hoạch: bỏ runtime; page admin stub — xác nhận không còn path live |

---

## 3. Migration bắt buộc / tùy chọn

### Có trên `feat/esim-airalo-refund` (Wave 1 tối thiểu)

1. `20261009160000_esim_phase_a_mock`  
2. `20261016150000_paypal_gateway_and_airalo`  
3. `20261023100000_esim_airalo_catalogue_lifecycle`  
4. `20261027160000_refund_request_attempt`  

### Có trên localhost, **chưa** nằm trong 3 commit PR (Wave 2 / quyết định riêng)

5. `20261105120000_cms_content_translations` — i18n CMS  
6. `20261106140000_esim_price_snapshot_foundation` — snapshot giá USD  
7. `20261107140000_refund_bank_reference_unique` — refund  
8. `20261107180000_esim_finance_f3_paypal_fee_reconcile` — F3 tables  

**Prod:** chỉ `prisma migrate deploy` sau backup; **additive** theo audit F3; không destructive.  
Local đã apply F3 thủ công trên Docker — prod phải qua migrate chuẩn, không copy tay lung tung.

---

## 4. Biến môi trường & cấu hình prod (checklist)

### Bắt buộc giữ an toàn lúc mới lên

| Key / setting | Giá trị khuyến nghị lần 1 |
|---------------|---------------------------|
| `ESIM_ENABLED` | `false` hoặc chỉ bật khi sẵn sàng catalogue |
| `ESIM_PROVIDER_MODE` | `mock` cho đến khi arm |
| `ESIM_LIVE_ARM` | `false` |
| `PAYPAL_ESIM_ENABLED` | **`false` (bắt buộc — prod validator)** |
| `PAYPAL_MODE` | `sandbox` hoặc live chỉ khi đủ CLIENT/SECRET/WEBHOOK_ID và **không** bật esim checkout |
| DB `settings` `customerEsimEnabled` | **false** |
| Airalo account mode | sandbox/production khớp credential |

### Khi mở bán VN (SePay)

- SePay prod merchant, IPN URL `https://<domain>/…` đúng path eSIM  
- HMAC/IPN secret khớp admin config  
- Nginx/firewall chỉ expose endpoint cần thiết  
- Regression: ví đại lý SePay + bán thẻ MegaPay/SePay

### Khi mở bán INTL (PayPal) — wave sau

- Đổi rule `production-env.rules.ts` (hiện **cấm** `PAYPAL_ESIM_ENABLED`) bằng quyết định chủ dự án có văn bản  
- Webhook PayPal live + capture AC  
- Charge limits + FX snapshot đã nghiệm thu

### Secrets cần có trên VPS khi live Airalo

`AIRALO_CLIENT_ID`, `AIRALO_CLIENT_SECRET`, (optional encrypted settings), SePay/PayPal secrets theo cổng bật.

`.env.example` hiện **thiếu** block eSIM/PayPal/Airalo rõ — nên bổ sung trước deploy để ops không đoán.

---

## 5. Rủi ro prod (ưu tiên)

| # | Rủi ro | Mức | Giảm thiểu |
|---|--------|-----|------------|
| 1 | Deploy working tree lẫn non-eSIM / chưa review | Cao | Chỉ merge PR đã review; tách wave |
| 2 | Bật sales + live arm thiếu catalogue/credential | Cao | Default off; checklist sync Airalo trước |
| 3 | IPN SePay eSIM sai URL/HMAC → treo PAID | Cao | Smoke IPN staging/prod; không dùng tunnel sandbox |
| 4 | Regression agent deposit / MegaPay | Cao | Test case bắt buộc sau deploy |
| 5 | LPA/QR lộ log notification | Trung bình | Giữ commit redact; audit log prod |
| 6 | F3 provisional header → match sai nếu import CSV | Trung bình | Không dùng F3 kế toán chính thức đến KEYON CSV; hoặc chưa migrate F3 |
| 7 | `PAYPAL_ESIM_ENABLED` bật → app **không start** | Trung bình | Giữ false; đổi rule có chủ đích |
| 8 | Trộn sandbox payment vào báo cáo | Trung bình | F0/F1 đã tách; Ops/Finance filter sandbox |
| 9 | Migration thiếu thứ tự / thiếu backup | Cao | Backup DB → migrate deploy → verify `_prisma_migrations` |
| 10 | RBAC ACCOUNTANT/FINANCE thiếu quyền mới | Trung bình | Chạy `sync-rbac-production` nếu script có role eSIM/refund |

---

## 6. Trạng thái nghiệm thu (theo docs)

| Hạng mục | Docs | PASS? |
|----------|------|-------|
| Charge limits Phase A | `esim-order-amount-limit-phase-a-acceptance.md` + completion | PASS WITH CONDITIONS → C1–C3 closed |
| Finance F0 | `esim-finance-f0-report.md` | PASS |
| Finance F1 | `esim-finance-f1-report.md` | Xác minh xong — **chờ chủ dự án PASS** trên lock |
| Finance F3-A | `esim-finance-f3-audit.md` | PASS |
| Finance F3-B | `esim-finance-f3-report.md` | Implementation local — **chờ PASS**; CSV KEYON thiếu |
| SePay sandbox phases 2b* | Nhiều doc readiness | Sandbox — **chưa** = prod IPN AC |
| PayPal USD 2c | readiness + implementation docs | Local/sandbox — prod checkout OFF |
| Core Airalo+refund PR | 3 commit message “sales closed by default” | Chưa thấy báo cáo PASS deploy VPS riêng |

---

## 7. Checklist trước khi update VPS

### A. Git / đóng gói

- [ ] Không deploy từ `cursor/frontend-healthcheck-port` dirty tree  
- [ ] Wave 1: PR dựa `feat/esim-airalo-refund` (hoặc rebase `main`) + CI  
- [ ] Wave 2: PR delta (SePay eSIM prod-ready, Finance F0/F1, charge limits, FX, …)  
- [ ] Loại file không thuộc prod: `e2e-esim-mock`, gallery audit HTML, tunnel sandbox docs (chỉ docs OK)

### B. Database

- [ ] Backup Postgres prod  
- [ ] `prisma migrate deploy` đúng tập migration wave  
- [ ] Verify enum/table eSIM/refund; (optional) F3 tables  
- [ ] Không chạy seed local-full trên prod  

### C. Build / process

- [ ] Build `api` + `worker` + `admin` + `web` (+ partner nếu đụng)  
- [ ] Restart pm2/docker: api, worker, admin, web  
- [ ] Confirm boot với env an toàn (PayPal esim off)

### D. Cấu hình nghiệp vụ

- [ ] `customerEsimEnabled=false` đến khi catalogue + thanh toán sẵn  
- [ ] Airalo credential đúng mode  
- [ ] SePay eSIM IPN chỉ khi mở bán VN  
- [ ] RBAC: esim-ops, refunds, finance.view  

### E. Smoke sau deploy (bán vẫn tắt)

- [ ] Admin login → Products eSIM / Ops (empty OK)  
- [ ] Storefront `/esim` hiện notice off / không checkout  
- [ ] Bán thẻ + nạp + ví đại lý vẫn OK  
- [ ] Không có ERROR boot liên quan PayPal esim flag  

### F. Khi mở bán VN (riêng)

- [ ] Bật sales + SePay prod IPN test 1 đơn nhỏ  
- [ ] Fulfill Airalo live arm có kiểm soát  
- [ ] Ops + (nếu có) Finance F1 số liệu khớp  

---

## 8. Đề xuất thứ tự update VPS

```
1) Backup DB + code hiện tại
2) Merge Wave 1 (Airalo + refund, sales OFF) → migrate 4 migration PR → rebuild → smoke retail
3) Cấu hình Airalo sandbox/prod + sync catalogue (vẫn OFF bán)
4) Wave 2 PR (SePay eSIM + Ops/Finance F0/F1 + charge limits + FX) → migrate còn lại (trừ hoặc gồm F3 theo quyết định)
5) Mở bán VN có kiểm soát
6) PayPal INTL + F3 CSV: wave riêng sau KEYON + đổi production-env rule
```

---

## 9. Việc chủ dự án cần chốt

1. Wave 1 có dùng đúng `feat/esim-airalo-refund` hay gói lại từ localhost?  
2. F1 / F3-B có cần PASS trước khi lên VPS không (hay chỉ Ops + bán)?  
3. F3 migration lên cùng Wave 2 hay hoãn đến có CSV KEYON?  
4. Ngày mở `customerEsimEnabled` và SePay IPN prod?  
5. PayPal INTL: giữ rule cấm `PAYPAL_ESIM_ENABLED` đến khi nào?

---

## 10. Điều kiện dừng audit

Báo cáo này chỉ chuẩn bị. **Không** deploy VPS trong bước này.  
Chi tiết Finance: `esim-finance-decisions-lock.md`, `esim-finance-f3-report.md`.  
Chi tiết nền Airalo: `docs/ESIM_AIRALO_PAYPAL_PLAN.md`, nhánh `feat/esim-airalo-refund`.
