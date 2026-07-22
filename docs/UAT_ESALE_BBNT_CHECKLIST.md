# UAT Checklist — eSale BBNT (Topup + Card)

> Nguồn biên bản: `BBNT_Esale_DoiTac_KeyOn_Topup.doc`, `BBNT_Esale_DoiTac_KeyOn_Card.doc` (14/07/2026)  
> Script matrix: `scripts/uat/esale-bbnt-matrix.mjs`  
> Mục tiêu: điền cột **Passed/Failed, Note mã GD** trên BBNT trước khi ký.

---

## 0. Điều kiện tiên quyết

| # | Việc cần làm | Done |
|---|--------------|------|
| 0.1 | Có credential sandbox eSale (agencyCode, clientCode, SecretKey, RSA private key) | ☐ |
| 0.2 | `ESALE_API_URL_CARD` = `https://partner3sb-esale.zing.vn/esale/cardshop/` | ☐ |
| 0.3 | `ESALE_API_URL_TOPUP` = `https://partner3sb-esale.zing.vn/esale/mobiletopup/` | ☐ |
| 0.4 | Số dư ví **Card** và **Topup** sandbox đủ cho batch (xem ước lượng §5) | ☐ |
| 0.5 | Có SĐT sandbox/test trả trước theo từng nhà mạng (ENV phone) | ☐ |
| 0.6 | IP whitelist đã gửi eSale (nếu sandbox yêu cầu) | ☐ |
| 0.7 | `ESALE_USE_MOCK=false` khi chạy script (gọi API thật) | ☐ |

### Biến môi trường

```bash
# Credentials (hoặc lấy từ DB settings.provider.esale nếu có DATABASE_URL + ENCRYPTION_KEY)
export ESALE_API_URL_CARD=https://partner3sb-esale.zing.vn/esale/cardshop/
export ESALE_API_URL_TOPUP=https://partner3sb-esale.zing.vn/esale/mobiletopup/
export ESALE_AGENCY_CODE=...
export ESALE_CLIENT_CODE=...
export ESALE_SECRET_KEY=...
export ESALE_PRIVATE_KEY="-----BEGIN PRIVATE KEY-----\n...\n-----END PRIVATE KEY-----"

# SĐT test (bắt buộc cho topup) — thuê bao trả trước hợp lệ trên sandbox
export ESALE_UAT_PHONE_VINA=09xxxxxxxx
export ESALE_UAT_PHONE_MOBI=09xxxxxxxx
export ESALE_UAT_PHONE_VIETTEL=09xxxxxxxx
export ESALE_UAT_PHONE_VIETNAMOBILE=09xxxxxxxx
```

---

## 1. Chạy script (thứ tự khuyến nghị)

### 1.1 Smoke (1 dens / nhóm) — xác nhận chữ ký + kết nối

```bash
node scripts/uat/esale-bbnt-matrix.mjs --mode=all --smoke --delay-ms=1500
```

| Kỳ vọng | Done |
|---------|------|
| `getbalance` card + topup trả `retCode=1` | ☐ |
| Ít nhất 1 topup smoke `retCode=1` (hoặc PENDING rồi check OK) | ☐ |
| Ít nhất 1 ZING buycard smoke `retCode=1` + có serial/PIN (không log PIN plain) | ☐ |
| File report JSON/MD được ghi vào `scripts/uat/reports/` | ☐ |

### 1.2 Full Topup matrix (theo BBNT)

```bash
node scripts/uat/esale-bbnt-matrix.mjs --mode=topup --delay-ms=2000
```

### 1.3 Full Card ZING matrix

```bash
# Script tự resolve cardId từ getcardlist (Game / ZING); fallback bảng docs nếu thiếu
node scripts/uat/esale-bbnt-matrix.mjs --mode=card --delay-ms=2000
```

### 1.4 Thiếu số dư (mục II)

```bash
# Dùng amount rất lớn để ép retCode=-3000 (không trừ ví nếu eSale reject đúng)
node scripts/uat/esale-bbnt-matrix.mjs --mode=low-balance
```

| Kỳ vọng | Done |
|---------|------|
| Topup: `retCode=-3000`, ví topup không giảm | ☐ |
| Card: `retCode=-3000`, ví card không giảm | ☐ |
| Ghi mã GD / transId vào BBNT mục II | ☐ |

### Tuỳ chọn tiết kiệm số dư

```bash
# Chỉ vài mệnh giá
node scripts/uat/esale-bbnt-matrix.mjs --mode=topup --amounts=5000,10000,50000

# Chỉ 1 nhà mạng
node scripts/uat/esale-bbnt-matrix.mjs --mode=topup --telco=viettel

# Dry-run: in kế hoạch, không gọi buy/topup
node scripts/uat/esale-bbnt-matrix.mjs --mode=all --dry-run
```

---

## 2. Checklist Topup (BBNT)

Điền từ report script: `status`, `transId`, `eSaleTransId`, `retCode`.

### I.1 Vinaphone (`telco=vina`)

| Amount (VND) | Kỳ vọng | Kết quả | Mã GD / note |
|-------------|---------|---------|--------------|
| 5.000 | PASS | ☐ | |
| 10.000 | PASS | ☐ | |
| 20.000 | PASS | ☐ | |
| 25.000 | PASS | ☐ | |
| 30.000 | PASS | ☐ | |
| 50.000 | PASS | ☐ | |
| 100.000 | PASS | ☐ | |
| 200.000 | PASS | ☐ | |
| 300.000 | PASS | ☐ | |
| 500.000 | PASS | ☐ | |
| 1.000.000 | **EXPECTED_FAIL** eSale `ret_code=2` (BBNT) | ☐ | |

### I.2 Mobifone (`telco=mobi`)

| Amount | Kỳ vọng | Kết quả | Mã GD |
|--------|---------|---------|-------|
| 5k, 10k, 15k, 20k, 25k, 30k, 35k, 40k, 45k, 50k | PASS | ☐ | |
| 55k, 60k, 65k, 70k, 75k, 80k, 85k, 90k, 95k, 100k | PASS | ☐ | |
| 120k, 150k, 200k, 300k, 500k, 1.000k | PASS | ☐ | |
| 1.005.000 | **EXPECTED_FAIL** `ret_code=2` | ☐ | |

### I.3 Viettel (`telco=viettel`)

| Amount | Kỳ vọng | Kết quả | Mã GD |
|--------|---------|---------|-------|
| 5k, 10k, 15k, 20k, 25k, 30k, 35k, 40k, 45k, 50k | PASS | ☐ | |
| 100k, 200k, 300k, 500k, 1.000k | PASS | ☐ | |
| 1.005.000 | **EXPECTED_FAIL** `ret_code=2` | ☐ | |

### I.4 Vietnamobile (`telco=vietnamobile`)

| Amount | Kỳ vọng | Kết quả | Mã GD |
|--------|---------|---------|-------|
| 10k→100k (bước 5k từ 25k), 120k, 150k, 200k, 300k, 500k, 1.000k | PASS | ☐ | |
| 1.005.000 | **EXPECTED_FAIL** `ret_code=2` | ☐ | |

### II. Topup — số dư không đủ

| Tình huống | Kỳ vọng | Kết quả | Mã GD |
|------------|---------|---------|-------|
| Số dư topup &lt; amount | Fail, không trừ tiền, trạng thái không thành công | ☐ | |

---

## 3. Checklist Card — ZING (BBNT)

| STT | Mệnh giá | Kỳ vọng | Kết quả | Mã GD / eSaleTransId |
|-----|----------|---------|---------|----------------------|
| 1 | 10.000 | PASS + nhận mã thẻ | ☐ | |
| 2 | 20.000 | PASS + nhận mã thẻ | ☐ | |
| 3 | 50.000 | PASS + nhận mã thẻ | ☐ | |
| 4 | 100.000 | PASS + nhận mã thẻ | ☐ | |
| 5 | 200.000 | PASS + nhận mã thẻ | ☐ | |
| 6 | 500.000 | PASS + nhận mã thẻ | ☐ | |
| 7 | 1.000.000 | PASS + nhận mã thẻ | ☐ | |
| II | Số dư card không đủ | Fail, không trừ tiền | ☐ | |

> `cardId` sandbox có thể khác production. Script ưu tiên map từ `/getcardlist` (`supplierCode=ZING`, `faceValue`).

---

## 4. Sau khi matrix PASS

| # | Việc | Done |
|---|------|------|
| 4.1 | Copy mã GD từ `scripts/uat/reports/esale-bbnt-*.md` vào cột BBNT | ☐ |
| 4.2 | Điền thông tin Bên B (KeyOn) trên biên bản | ☐ |
| 4.3 | Hai bên ký BBNT | ☐ |
| 4.4 | Đồng bộ catalog CardOn (SKU + provider mapping) theo dens đã PASS | ☐ |
| 4.5 | Không đưa dens EXPECTED_FAIL lên bán (hoặc ẩn) | ☐ |

---

## 5. Ước lượng chi phí sandbox (tham khảo)

| Batch | Số GD (ước lượng) | Ghi chú |
|-------|-------------------|---------|
| Smoke all | ~5 | An toàn để verify |
| Topup full (trừ EXPECTED_FAIL) | ~80+ | Cần số dư lớn; nên chạy theo `--telco` / `--amounts` |
| ZING full | 7 | Mệnh giá cao (tổng face ~1.88M trước CK) |
| Low-balance | 2 | Không trừ nếu reject đúng |

---

## 6. Mapping kết quả script → BBNT

| Script `verdict` | Ý nghĩa điền BBNT |
|------------------|-------------------|
| `PASS` | Passed + ghi `transId` / `eSaleTransId` |
| `EXPECTED_FAIL` | Failed đúng như BBNT note (ret_code 2) — **không** tính thiếu sót CardOn |
| `FAIL` | Failed ngoài dự kiến — cần điều tra trước khi ký |
| `SKIP` | Thiếu phone / thiếu cardId / dry-run |

---

## Related

- [04_ESALE_TOPUP_API.md](./04_ESALE_TOPUP_API.md)
- [04_ESALE_BUYCARD_API.md](./04_ESALE_BUYCARD_API.md)
- [04_PROVIDER_ESALE.md](./04_PROVIDER_ESALE.md)
- Script: `scripts/uat/esale-bbnt-matrix.mjs`
