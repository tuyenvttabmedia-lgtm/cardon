# F3-A — Audit PayPal Capture & Fee Reconciliation (CSV-first)

**Ngày:** 2026-11-07  
**Phạm vi:** Chỉ audit source / schema / dữ liệu local + đề xuất thiết kế.  
**Không:** migration, sửa code, sửa checkout/capture/webhook/PaymentService, gọi PayPal API live, tạo dữ liệu tài chính giả, mở F2-B / F2-I / F4 / F5.

Nguồn lock: `esim-finance-decisions-lock.md`, `esim-finance-f2-f3-technical-design.md`.

---

## 0. Kết luận ngắn

| Câu hỏi | Kết luận |
|---------|----------|
| Cardon đã có Capture ID để match? | **Có** — `payments.gateway_transaction_id` = `gateway_response.captureId` khi SUCCESS |
| PayPal Order ID? | **Có** — `gateway_response.paypalOrderId` (không cột riêng) |
| Payment reference trên PayPal? | **Có** — tạo order với `custom_id` + `reference_id` = `paymentReference` |
| Invoice ID trên PayPal? | **Không gửi** — `invoice_id` trống; **không** dùng Invoice Number làm primary key |
| Phí thực đã persist? | **Chưa** — webhook/capture không lưu fee/net; F1 `gatewayActualFees=UNAVAILABLE` |
| `paymentFeeAmount` = phí thực? | **Không** — chỉ estimated (local USD SUCCESS đang `0.00`) |
| CSV hỗ trợ đề xuất F3-B? | **Activity Download (ưu tiên vận hành)** + **Transaction Detail Report / TDR (SFTP, optional)** |
| Có thể implementation sau duyệt? | Có — cần migration bảng import + API/UI; **không** đụng luồng thanh toán |

---

## 1. Hiện trạng kỹ thuật

### 1.1 Payment / Order eSIM USD (schema)

`payments` (Prisma):

| Field | PayPal eSIM SUCCESS |
|-------|---------------------|
| `gateway` | `PAYPAL` |
| `productLane` | `ESIM` |
| `currency` | `USD` |
| `amount` | Gross capture Cardon (USD) |
| `paymentReference` | `PAY-…` (UNIQUE) |
| `gatewayTransactionId` | **Capture ID** PayPal |
| `gatewayResponse` JSON | `paypalOrderId`, `captureId`, `captureState`, `currency`, URLs… |
| `paidAt` | Thời điểm settle SUCCESS |
| `reconciliationStatus` | Mặc định `PENDING` (chưa dùng cho fee PayPal) |
| `settlementDate` / `bankReference` | Không set bởi PayPal capture |

`orders`:

| Field | Ghi chú |
|-------|---------|
| `orderCode` | Fallback match thứ cấp (không gửi lên PayPal) |
| `paymentFeeAmount` / `%` / `fixed` | **Estimated** lúc checkout — F3 **không** ghi đè thành actual |
| `clientTrace.adminTest` / `sandbox` | Phân biệt sandbox (đã có ở F1) |

### 1.2 Mẫu local (đọc DB `cardon-local-full-postgres`, không sửa)

| status | count |
|--------|------:|
| SUCCESS | 2 |
| EXPIRED | 7 |
| Refund PayPal | 0 |

SUCCESS thương mại (khớp F1 USD $10.51):

| orderCode | paymentReference | captureId (= gateway_transaction_id) | paypalOrderId | amount | paymentFeeAmount |
|-----------|------------------|--------------------------------------|---------------|--------|------------------|
| ORD-20261106-B7969A | PAY-F3104AC090934086A46A | `0EB56821XA562691D` | `4XF19314W77200201` | 6.55 | 0.00 |
| ORD-20261107-7D1D09 | PAY-1B83EE7B09F84AC3AA58 | `6GK65584H96475314` | `8D227054AC844344B` | 3.96 | 0.00 |

EXPIRED có `paypalOrderId` nhưng **không** có `captureId` → không vào revenue F1; F3 chỉ đối soát capture/fee trên dòng PayPal có capture (hoặc refund gắn capture gốc).

### 1.3 Tạo order PayPal (không sửa)

`PaypalClient.createOrder`:

- `intent: CAPTURE`
- `purchase_units[].reference_id` = `paymentReference`
- `purchase_units[].custom_id` = `paymentReference`
- **Không** set `invoice_id`

→ Trên báo cáo PayPal: **Custom Number / custom_field** ≈ `paymentReference`.  
→ **Invoice Number / invoice_id** thường trống — không primary match.

### 1.4 Webhook / settlement hiện tại (không sửa)

Luồng eSIM: `EsimPaypalPaymentService` + `PaypalProvider.verifyWebhook`.

| Event | Hành vi |
|-------|---------|
| `PAYMENT.CAPTURE.COMPLETED` | Verify chữ ký → match `custom_id` + order id + amount/currency USD → set SUCCESS, `gatewayTransactionId=captureId` |
| Duplicate capture | Idempotent; không capture lại |
| `PAYMENT.CAPTURE.DENIED` / void / reversed | Parse có; settle fail/cancel theo plan — **không** ghi fee |
| Capture fee/net từ PayPal | **Không persist** |

`PaypalProvider.refund`: trả về manual-only sau khi đã issue eSIM secret — **không** auto-refund API trong scope F3.

### 1.5 Finance hiện có liên quan

| Thành phần | Liên quan F3 |
|------------|--------------|
| F1 `/finance/esim` revenue | Gross SUCCESS; estimated fee; actual **UNAVAILABLE** |
| `PaymentReconcileService` + `reconcile.engine` | So khớp gateway lines vs payment theo reference/amount — **mẫu** logic MATCHED/MISSING/AMOUNT_MISMATCH; chưa CSV PayPal fee |
| `PaymentGatewayInvoice` | Fee theo **kỳ** — không thay fee từng capture |
| `GatewayFeesService` | Aggregate từ `paymentFeeAmount` estimated — **không** dùng làm actual F3 |
| Finance file import | **Chưa có** pipeline import CSV trong finance |
| Audit | `ESIM_REVENUE_EXPORTED`; sẽ thêm action import/match PayPal |

### 1.6 Cấu hình phí PayPal

Method public PayPal: `percentageFee: 0`, `fixedFee: 0` (settings). Estimated trên đơn USD local = 0 → UI F3 phải hiển thị rõ estimated vs actual, không suy actual từ estimated.

---

## 2. Dữ liệu có thể matching

### 2.1 Khóa Cardon → PayPal

| Ưu tiên | Cardon | PayPal CSV | Độ tin cậy |
|---------|--------|------------|------------|
| **P1** | `gatewayTransactionId` / `gatewayResponse.captureId` | Activity: `Transaction ID`; TDR: `transaction_id` (dòng capture) | Cao — ID capture PayPal |
| **P2** | `paymentReference` | Activity: `Custom Number`; TDR: `custom_field` | Cao — Cardon luôn gửi `custom_id` |
| **P3** | `gatewayResponse.paypalOrderId` | TDR: `paypal_reference_id` khi type `ODR`; Activity: đôi khi `Reference Txn ID` | Trung bình — phụ thuộc loại dòng |
| **P4** | `paymentReference` / `orderCode` + amount + ngày | Khi thiếu custom | Thấp — manual |

**Không dùng làm P1:** Invoice Number (Cardon không set `invoice_id`).

### 2.2 Phạm vi payment nội bộ khi match doanh thu

- `gateway=PAYPAL` AND `productLane=ESIM` AND `status=SUCCESS` AND `currency=USD` (hoặc null legacy → treat USD nếu gateway PAYPAL, cùng quy ước F1).
- Tách **commerce / sandbox** theo F1 (`clientTrace.adminTest` / `sandbox` / MOCK).
- EXPIRED / PENDING / FAILED: không kỳ vọng dòng capture COMPLETED; nếu CSV có capture lạ → `MISSING_LOCAL`.

### 2.3 Không double-count

| Loại dòng PayPal | Xử lý F3 |
|------------------|----------|
| Capture / payment (gross credit bán hàng) | Match doanh thu + fee actual |
| Refund / reversal / chargeback | Phân loại riêng; **không** cộng vào doanh thu capture; gắn parent capture nếu có |
| Withdrawal / payout / bank transfer ra | **F4** — classify `PAYOUT_OR_BALANCE`; không ghi revenue |
| Currency conversion / general hold / fee-only memo | Classify `NON_SALE`; không revenue |
| Balance / opening-closing rows (nếu có) | Bỏ qua hoặc metadata only |

---

## 3. Định dạng CSV đề xuất hỗ trợ

### 3.1 Format A — **Activity Download** (ưu tiên F3-B)

Nguồn: PayPal Business → Reports → Activity Download (CSV).  
Docs: [Activity Download](https://developer.paypal.com/reports/activity-download).

**Lý do ưu tiên:** KEYON tải được từ portal, có sẵn **Gross / Fee / Net**, `Transaction ID`, `Custom Number`, `Type` / `Transaction Event Code`, `Balance Impact` — đủ CSV-first không cần SFTP.

Cột bắt buộc khi export (merchant phải chọn đủ):

| Cột Activity | Map nội bộ |
|--------------|------------|
| `Transaction ID` | `paypalTxnId` (capture hoặc txn liên quan) |
| `Reference Txn ID` | `paypalReferenceId` (parent / refund link) |
| `Custom Number` | `customId` → match `paymentReference` |
| `Invoice Number` / `Invoice Number Text` | `invoiceId` (thường trống với Cardon) |
| `Gross` | `gross` |
| `Fee` | `fee` (chuẩn hóa dấu → absolute fee) |
| `Net` | `net` (hoặc gross−fee sau normalize) |
| `Currency` | `currency` |
| `Date` + `Time` + `TimeZone` | `bookedAt` |
| `Status` | `statusRaw` |
| `Type` | `typeRaw` |
| `Transaction Event Code` | `txnEventCode` (nếu chọn) |
| `Balance Impact` | `Debit` / `Credit` / `Memo` |

### 3.2 Format B — **Transaction Detail Report (TDR)** (optional / tương lai)

Docs: [Transaction detail report](https://developer.paypal.com/reports/transaction-detail) (SFTP `TRR-*.CSV`, row type `SB`).

| Cột TDR | Map nội bộ |
|---------|------------|
| `transaction_id` | `paypalTxnId` |
| `paypal_reference_id` + `paypal_reference_id_type` | reference / ODR order |
| `invoice_id` | thường trống |
| `custom_field` | `customId` |
| `gross_transaction_amount` + `gross_transaction_currency` | gross |
| `fee_amount` + `fee_currency` + debit/credit flags | fee |
| `transaction_event_code` | T-code |
| `transaction_completion_date` | bookedAt |
| `transactional_status` | S/D/P/V/F/R |

Net TDR: tính `gross − fee` theo chiều CR/DR (không có cột Net sẵn).

### 3.3 Detector

Import nhận `format=AUTO|ACTIVITY_DOWNLOAD|TDR`:

1. Header có `Gross` + `Fee` + `Net` + `Transaction ID` → Activity.
2. Có `column_type` / rows `SB` / `transaction_id` + `gross_transaction_amount` → TDR.
3. Không nhận diện → reject rõ ràng; **không** đoán mơ hồ.

---

## 4. Mapping CSV → Payment Cardon

```
CSV.transaction_id / Transaction ID
  → match payments.gateway_transaction_id
  → fallback gateway_response.captureId

CSV.Custom Number / custom_field
  → match payments.payment_reference

CSV.gross + currency
  → so với payments.amount + payments.currency (tolerance 0.00 USD cent)

CSV.fee / net
  → actual fee/net trên bảng match (KHÔNG ghi đè orders.payment_fee_amount)

CSV.refund / reversal (T-code hoặc Type)
  → paypal_report_lines.kind = REFUND|REVERSAL
  → link Reference Txn ID → capture gốc nếu có
```

Estimated (chỉ đọc):

```
estimatedFee = orders.paymentFeeAmount
estimatedGross = payments.amount
```

---

## 5. Quy tắc đối soát

### 5.1 Matching

1. Lọc dòng CSV `kind=SALE_CAPTURE` (payment completed, credit bán hàng).
2. **Exact** `paypalTxnId` ↔ `gatewayTransactionId`.
3. Nếu chưa match: exact `customId` ↔ `paymentReference` + cùng currency + `|gross−amount| ≤ 0.00` (hoặc 0.01 nếu làm tròn locale — mặc định **0.00** strict, lệch → `AMOUNT_MISMATCH` khi đã gắn reference).
4. Manual match + note + audit (accountant).

### 5.2 Trạng thái match (đề xuất)

| Status | Nghĩa |
|--------|--------|
| `MATCHED` | Capture khớp; amount+currency khớp |
| `AMOUNT_MISMATCH` | Cùng ID/ref nhưng gross/currency lệch |
| `CURRENCY_MISMATCH` | ID khớp, currency ≠ USD/payment |
| `FEE_DELTA` | Gross khớp nhưng cần review fee (optional flag; vẫn MATCHED kèm delta) |
| `MISSING_LOCAL` | Có trên CSV, không có payment Cardon SUCCESS |
| `MISSING_GATEWAY` | Có payment SUCCESS trong kỳ, không có dòng CSV sale |
| `DUPLICATE_CSV` | Cùng `paypalTxnId` xuất hiện >1 lần trong 1 import (hoặc conflict fee khác nhau) |
| `DUPLICATE_PAYMENT` | Hai payment Cardon cùng captureId (vi phạm kỳ vọng — escalate) |
| `NON_SALE` | Refund/payout/FX/… đã classify, không tính revenue |
| `MANUAL_MATCHED` | Accountant gán |

### 5.3 Duplicate detection

- Trong 1 file: unique `paypalTxnId` (+ kind); trùng → `DUPLICATE_CSV`, không match tự động.
- Cross-import: cùng `paypalTxnId` đã có line `MATCHED` → re-import **idempotent** (không tạo match thứ hai; cập nhật raw nếu cùng hash hoặc reject nếu fee/gross conflict).

### 5.4 Missing

- `MISSING_GATEWAY`: SUCCESS PayPal eSIM `paidAt` trong `[periodFrom, periodTo]` không có sale line.
- `MISSING_LOCAL`: sale line không map được payment (sai account sandbox/live, capture ngoài hệ thống, hoặc data cũ thiếu `productLane`).

### 5.5 Refund / reversal / chưa capture

| Trường hợp | Quy tắc F3 |
|------------|------------|
| Refund / Reversed / Chargeback trên CSV | `kind=REFUND|REVERSAL|CHARGEBACK`; lưu gross/fee/net; link `paypalReferenceId` → capture; **không** giảm doanh thu F1 tự động trong F3-B (hiển thị queue riêng; chỉnh sổ doanh thu = quyết định kế toán sau / phase riêng) |
| Pending / Processing / Denied | Không match SUCCESS; classify `NON_SETTLED` |
| Chỉ có PayPal Order, chưa capture | Không có Transaction ID capture; bỏ qua hoặc `NON_SALE` — Cardon EXPIRED tương ứng không vào MISSING_GATEWAY |
| Partial refund | Lưu dòng; status `PARTIAL_REFUND`; manual review |

### 5.6 Idempotency import lại nhiều lần

1. `fileHash = SHA-256(raw bytes)` UNIQUE trên `paypal_report_imports` (cùng file → trả về import cũ, không parse lại tạo line mới).
2. Unique `(paypalTxnId, kind)` trên lines **đã accepted** (global hoặc per merchant account) — UPSERT an toàn.
3. Re-run match trên cùng period: không nhân đôi `paypal_fee_matches`; cập nhật delta nếu CSV mới supersede (cần `supersededByImportId` hoặc chỉ cho phép 1 active match / paymentId).
4. Audit mỗi lần upload / rematch / manual resolve.

---

## 6. Schema / API / UI đề xuất (chưa migrate)

### 6.1 Schema (tương thích `source=CSV|API` sau này)

```
paypal_report_imports (
  id, source=CSV|API,
  format=ACTIVITY_DOWNLOAD|TDR,
  periodFrom, periodTo,
  originalFilename, fileHash, storageKey?,  -- lưu file nguồn (disk/S3) hoặc bắt buộc audit blob
  rowCount, saleCount, nonSaleCount,
  status=PARSED|MATCHED|FAILED,
  importedBy, createdAt, errorSummary?
)

paypal_report_lines (
  id, importId,
  kind=SALE_CAPTURE|REFUND|REVERSAL|CHARGEBACK|PAYOUT_OR_BALANCE|FX|OTHER|NON_SETTLED,
  paypalTxnId, paypalReferenceId?, customId?, invoiceId?,
  paypalOrderIdHint?,
  gross, fee, net, currency,
  txnEventCode?, statusRaw?, typeRaw?, balanceImpact?,
  bookedAt, rawJson,
  UNIQUE (importId, paypalTxnId, kind)  -- hoặc mạnh hơn: unique paypalTxnId+kind active
)

paypal_fee_matches (
  id,
  paymentId?,              -- null nếu MISSING_LOCAL
  reportLineId,
  matchStatus,
  grossCardon, grossPaypal, feeEstimated, feeActual, netPaypal,
  grossDelta, feeDelta, netDelta,
  currency,
  matchType=AUTO|MANUAL,
  actorId?, note?, createdAt, updatedAt
)

-- Optional: không bắt buộc F3-B nếu ghi file trên disk + hash đủ audit
paypal_report_files (importId, contentType, byteSize, sha256, storedAt)
```

**Cấm:** ghi actual fee vào `orders.payment_fee_amount`.  
**Cho phép (sau duyệt F3-B):** cập nhật `payments.reconciliationStatus` / metadata fee actual trên `gatewayResponse` **chỉ** nếu AC rõ; ưu tiên bảng match tách để không đụng settle.

### 6.2 API đề xuất (`finance.view` / `finance.manage`)

| Method | Path | Mục đích |
|--------|------|----------|
| `POST` | `/admin/finance/esim/paypal/imports` | Upload CSV + parse |
| `GET` | `/admin/finance/esim/paypal/imports` | Danh sách batch |
| `GET` | `/admin/finance/esim/paypal/imports/:id` | Chi tiết + summary |
| `POST` | `/admin/finance/esim/paypal/imports/:id/match` | Chạy/re-run match |
| `GET` | `/admin/finance/esim/paypal/matches` | Queue filter status |
| `POST` | `/admin/finance/esim/paypal/matches/:id/resolve` | Manual match / dismiss |
| `GET` | `/admin/finance/esim/paypal/export` | CSV kết quả đối soát |

Audit actions đề xuất: `ESIM_PAYPAL_IMPORT_CREATED`, `ESIM_PAYPAL_MATCH_RUN`, `ESIM_PAYPAL_MATCH_RESOLVED`, `ESIM_PAYPAL_RECON_EXPORTED`.

### 6.3 UI — Finance eSIM → PayPal

Mở rộng `/finance/esim` (Method C): tab/subnav **Doanh thu | PayPal fee**.

Panel PayPal:

1. Upload CSV + chọn period + format AUTO.  
2. Summary: sales matched / missing gateway / missing local / amount mismatch / non-sale (payout tách nhãn «không phải doanh thu»).  
3. Bảng: Gross Cardon | Gross PayPal | Fee ước tính | Fee PayPal | Net | Delta | Status.  
4. Queue refund/reversal (read-only F3).  
5. Lịch sử import (filename, hash, user, time).  
6. Không KPI giả; sandbox filter như F1.

Permissions: cùng `finance.view` xem; `finance.manage` upload/resolve (hoặc ACCOUNTANT theo RBAC hiện có — xác nhận lúc F3-B).

---

## 7. Estimated vs actual fee

| Khái niệm | Nguồn | Dùng để |
|-----------|-------|---------|
| **Estimated fee** | `orders.paymentFeeAmount` (+ settings %/fixed lúc checkout) | So sánh / hiển thị cột ước tính |
| **Actual fee** | CSV `Fee` (chuẩn hóa) | Đối soát kế toán; lưu trên `paypal_fee_matches.feeActual` |
| **Net thực** | CSV `Net` hoặc gross−fee | Cashflow PayPal (trước rút — F4) |

F1 giữ nguyên: `gatewayActualFees` chuyển từ `UNAVAILABLE` → có dữ liệu **chỉ khi** đã có match actual trong kỳ (F3-B wire-up tùy chọn, không bắt buộc cùng PR).

`GatewayFeesService` / VAT retail: **không** đổi sang actual PayPal trong F3.

---

## 8. Rủi ro

| Rủi ro | Mức | Giảm thiểu |
|--------|-----|------------|
| Merchant bỏ cột Custom Number / Transaction Event Code | Cao | Checklist UI; reject nếu thiếu Transaction ID + Gross/Fee |
| Sandbox CSV trộn live | Cao | Cảnh báo mode; filter `productLane` + tách sandbox orders |
| Locale số (`1,23` vs `1.23`) / Fee dấu âm | Trung bình | Parser chuẩn hóa; fixture golden |
| TDR vs Activity khác schema | Trung bình | Detector + 2 mapper |
| Payout bị tính doanh thu | Cao | Classifier `PAYOUT_OR_BALANCE` + AC test |
| Re-import nhân đôi fee | Cao | fileHash + unique txn + 1 active match/payment |
| Coi `paymentFeeAmount` là actual | Cao | AC + UI label; không ghi đè order fee |
| Docs phase-2c1 cũ (PayPal chỉ admin-test) | Thấp | Hiện đã có `EsimPaypalPaymentService` + SUCCESS live path — audit này supersede phần readiness cũ về matching |

---

## 9. Test cases (F3-B)

1. Import Activity CSV golden: 2 capture khớp 2 SUCCESS local (`0EB56821…`, `6GK65584…`) → MATCHED; fee actual lưu; estimated 0.  
2. Thiếu 1 capture trên CSV → MISSING_GATEWAY.  
3. Thêm capture lạ → MISSING_LOCAL.  
4. Sai gross 3.96→3.95 → AMOUNT_MISMATCH.  
5. Currency EUR trên CSV → CURRENCY_MISMATCH.  
6. Duplicate Transaction ID trong file → DUPLICATE_CSV.  
7. Upload lại cùng file (hash) → idempotent, không thêm lines.  
8. Dòng Type=Withdrawal / Balance Impact payout → NON_SALE / PAYOUT; không tăng revenue.  
9. Dòng Refund + Reference = capture → kind REFUND; không MATCHED sale.  
10. Manual resolve + audit actor.  
11. ACCOUNTANT/forbidden roles.  
12. Regression: checkout/webhook PayPal + F1 revenue không đổi số gross.

---

## 10. File dự kiến thay đổi (khi được duyệt F3-B — chưa làm)

**Backend**

- `prisma/schema.prisma` + migration `paypal_report_*`
- `src/modules/finance/` — service import/parse/match, controller routes, dto, audit constants
- Tests: parser Activity + TDR stub, match engine, idempotency, permission

**Admin**

- `apps/admin/app/finance/esim/` — tab PayPal hoặc `…/paypal/page.tsx`
- `FinanceEsimPaypalPanel.tsx`, api-client, types, i18n
- `FinanceShell` subnav nếu cần

**Docs**

- `esim-finance-f3-report.md` (sau implementation)
- Cập nhật nhẹ decisions-lock trạng thái F3 khi PASS

**Không đụng**

- `esim-paypal-payment.service.ts`, `paypal.provider.ts`, `paypal.client.ts`, webhook controller  
- `PaymentService` settle  
- SePay / F2-B / F2-I / F4 payout / F5 e-invoice  

---

## 11. Acceptance Criteria (implementation F3-B)

1. Accountant upload được **Activity Download CSV** (và detector reject file sai).  
2. Match P1 Capture ID; P2 `Custom Number` = `paymentReference`.  
3. Lưu gross / fee actual / net; hiển thị estimated tách biệt; **không** dùng `paymentFeeAmount` làm actual.  
4. Phát hiện missing local/gateway, amount/currency mismatch, duplicate CSV.  
5. Re-import cùng file (hash) idempotent.  
6. Payout/withdrawal **không** vào doanh thu.  
7. Refund/reversal lưu và phân loại, không auto-đổi F1 gross trong F3-B trừ khi AC bổ sung được duyệt.  
8. File nguồn + audit import/match.  
9. Không sửa checkout, capture, webhook, PaymentService.  
10. Không gọi PayPal API live; không mở F2-B/F2-I/F4/F5.  
11. Test unit/integration phủ §9; báo cáo `esim-finance-f3-report.md` + chờ PASS.

---

## 12. Đề xuất chia F3 implementation (sau duyệt F3-A)

| Sub | Nội dung |
|-----|----------|
| **F3-B0** | Nghiệm thu audit này |
| **F3-B1** | Migration + parser Activity + import API + audit |
| **F3-B2** | Match engine + UI queue + export |
| **F3-B3** | TDR mapper (nếu KEYON có SFTP) — optional cùng hoặc sau |
| **F3-B4** | Wire F1 `gatewayActualFees` từ matches (optional) |

---

## 13. Điều kiện dừng F3-A

Audit + đề xuất xong trong `docs/esim/esim-finance-f3-audit.md`.  
**Chờ chủ dự án nghiệm thu** trước khi migration / code F3-B.
