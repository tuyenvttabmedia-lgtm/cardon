# F2 / F3 — Thiết kế kỹ thuật (chưa triển khai code)

Cập nhật 2026-11-07 theo chốt chủ dự án sau `esim-finance-f2-visa-design-evaluation.md`.

**Thứ tự implementation đã lock:** F2-D (design, song song) → **F3 PayPal CSV** → **F2-B Bank recon** → **F2-I Visa** (khi đủ docs/đăng ký) → F4 → F5.

Tài liệu này chỉ thiết kế / kế hoạch. **Không** mở F3 hay F2-D1 code cho đến khi chủ dự án duyệt phase riêng.

---

## F2-D — SePay Visa Architecture (design-only)

### Mục tiêu

Chuẩn bị kiến trúc đối soát thanh toán thẻ Visa qua SePay (mô hình PG tương tự pattern MegaPay / Provider / Webhook / Idempotency / Reconciliation), sẵn sàng khi KEYON đăng ký được dịch vụ.

### Trạng thái mặc định

`NOT_REGISTERED` — không checkout, không gọi API thật, không tạo giao dịch giả, không bật storefront, không KPI thương mại giả từ sandbox.

### Tham chiếu kiến trúc

- Tái dụng: `PaymentProviderInterface`, WebhookLog + chữ ký + settle idempotent, `Payment.reconciliationStatus` / settlement fields, `PaymentReconcileService` / `ReconcileReport`.
- **Không** copy MegaPay `MEGAPAY_VISA` như Visa acquiring (legacy map VNPAYQR / payType QR).

### Nhóm dữ liệu đề xuất (field optional nếu docs SePay chưa xác nhận)

| Nhóm | Nội dung |
|------|----------|
| Payment txn | orderId, paymentReference, sepayTxnId, amount/currency, status, auth/capture? (optional), timestamps |
| Webhook/IPN log | providerTxnId, eventType, receivedAt, signatureOk, outcome, duplicate — không PAN/CVV |
| Fee | contract % / fixed; report actual; **estimated ≠ actual** — không lấy biểu phí ảnh làm hợp đồng |
| Settlement | batchRef, gross/fee/net, settlementDate, bankRef, bankAmount, reconStatus |

### UI đề xuất (sau duyệt F2-D1)

Panel `/finance/esim` (Visa): badge `NOT_REGISTERED`; placeholder merchant/fee config; danh sách txn / IPN / recon trống.

### Sub-phase

| Sub | Nội dung | Điều kiện mở |
|-----|----------|--------------|
| **F2-D0** | Đánh giá + lock quyết định | Done (evaluation + decisions-lock) |
| **F2-D1** | UI/config stub `NOT_REGISTERED` + checklist docs SePay | Duyệt riêng — **chưa mở** |
| **F2-D2** | Schema/API chi tiết theo docs SePay đã xác minh | Nhận tài liệu chính thức |

### Không làm trong F2-D

Checkout Visa, API thật, migration, sửa IPN BANK_TRANSFER, bật method trên storefront, F2-I*.

### Docs SePay còn thiếu (trước F2-D2 / F2-I)

Payment method code thẻ; auth vs capture; IPN card; settlement/fee report; sandbox + test cards; 3DS/return; currency; PCI hosted page; mapping txn id; chargeback/SLA.

---

## F2-B — SePay Bank Reconciliation (HOÃN sau F3 — không hủy)

### Mục tiêu (khi mở)

Đối chiếu SePay **`BANK_TRANSFER`** eSIM (method code **`VIETQR`**) với sao kê ngân hàng để xác minh tiền thực nhận.

### Bối cảnh nghiệp vụ

- eSIM VND **đang** thu qua SePay `BANK_TRANSFER` / `VIETQR`.
- Không đối soát VietQR ở thời điểm hiện tại = **ưu tiên kế toán**, không phải không có giao dịch.
- VietQR / NAPAS_247 **không xóa** khỏi cấu hình dùng chung; NAPAS không đưa vào báo cáo eSIM đang chạy.
- Default `fixedFee` VIETQR trong code = **300đ** (không lấy 700đ từ ảnh).

### Nguồn dữ liệu (khi triển khai)

| Nguồn | Nội dung | Cách nạp |
|-------|----------|----------|
| Cardon | `payments` SePay SUCCESS eSIM: amount, fee ước tính, paidAt, paymentReference, orderId, `productLane=ESIM` | DB nội bộ |
| Ngân hàng | Sao kê CSV/Excel (số tiền, ngày, nội dung CK, số tham chiếu) | Import admin |
| SePay (optional) | Query/reconcile API nếu đã dùng cho thẻ game | Chỉ đọc, không đổi webhook |

### Matching đề xuất

1. **Primary:** `payment_reference` / nội dung CK chứa mã đơn hoặc mã SePay.
2. **Secondary:** amount + ngày (±1 ngày) + chưa match.
3. **Manual:** accountant gán match + lý do (audit).

### Model dữ liệu (tương thích tương lai — chưa migrate)

```
bank_statement_imports (id, source, period, fileHash, importedBy, createdAt)
bank_statement_lines (id, importId, bookedAt, amount, currency, description, externalRef, raw)
finance_matches (
  id, lane=ESIM|RETAIL|..., gateway=SEPAY,
  paymentId, statementLineId, matchType=AUTO|MANUAL,
  status=MATCHED|UNMATCHED|DISPUTED,
  actorId, note, createdAt
)
```

Ưu tiên: nếu Finance thẻ game đã có import sao kê — mở rộng cột `productLane` / filter eSIM thay vì bảng mới trùng.

### UI (khi mở)

- Tab «Ngân hàng / SePay» trong `/finance/esim`.
- Queue: unmatched payments, unmatched lines, matched.
- Báo cáo dòng tiền VND: doanh thu SePay SUCCESS → chờ về NH → đã match → lệch.

### Rủi ro

- Nội dung CK không chuẩn → tăng manual match.
- Fee SePay trên sao kê ≠ `paymentFeeAmount` ước tính → cột «fee thực» từ dòng NH hoặc báo cáo SePay riêng.

### Không làm khi triển khai F2-B

- Không đổi SePay IPN/HMAC, checkout QR, webhook ví đại lý.
- Không đụng PayPal fee/balance, e-invoice, Visa.

### Điều kiện mở F2-B

F3 PayPal CSV đã nghiệm thu (hoặc chủ dự án chốt sớm hơn bằng văn bản).

---

## F2-I — SePay Visa Implementation (chưa mở)

| Sub | Nội dung | Điều kiện |
|-----|----------|-----------|
| **F2-I1** | Sandbox adapter + IPN (không prod) | Merchant sandbox + test cards + docs |
| **F2-I2** | Txn recon + fee actual (CSV/API) | Mẫu settlement |
| **F2-I3** | Enable prod | KEYON đăng ký + AC pháp lý/PCI |

**Cấm** mở F2-I trước khi F3 xong và đủ tài liệu/đăng ký.

---

## F3 — PayPal Capture + Fee (CSV-first) — ưu tiên implementation tiếp theo

### Mục tiêu

Đối chiếu gross / fee / net PayPal với Capture ID Cardon; phân biệt phí ước tính vs phí báo cáo chính thức; phát hiện missing / duplicate / amount-currency mismatch.

### Phạm vi CSV-first (đã chốt)

1. Import **PayPal Transaction Report** (file chính thức).
2. Match **Capture ID / Transaction ID** với Payment Cardon.
3. Ghi nhận Gross / Fee / Net.
4. Phát hiện missing, duplicate, amount/currency mismatch.
5. Lưu file nguồn + **audit import**.
6. Phân biệt **estimated fee** vs **actual fee**.
7. **Không** double-count payout thành doanh thu (payout = F4).

### Nguồn dữ liệu

1. **CSV chính thức PayPal** (Transaction / Activity download) — bắt buộc giai đoạn 1.
2. Cardon: `payments` PayPal SUCCESS — captureId / transactionId, amount USD, fee ước tính nếu có.
3. API PayPal Transaction Search — optional sau; schema import giữ `source=CSV|API`.

### Schema import (tương thích API)

```
paypal_report_imports (id, source=CSV|API, periodFrom, periodTo, fileHash?, importedBy, createdAt)
paypal_report_lines (
  id, importId,
  paypalTxnId, captureId?, invoiceId?,
  gross, fee, net, currency,
  txnEventCode, bookedAt, rawJson
)
paypal_fee_matches (
  id, paymentId, reportLineId,
  grossDelta, feeDelta, netDelta,
  status, actorId, note, createdAt
)
```

### Matching

1. Capture ID / Transaction ID exact.
2. Fallback: invoice/custom = orderCode + amount + ngày.
3. Manual + audit.

### UI / báo cáo

- Cột: Gross Cardon | Gross PayPal | Fee ước tính | Fee PayPal | Net | Delta.
- Cashflow USD: doanh thu capture → fee → net PayPal (chưa rút — F4).
- Filter `productLane=ESIM`; tách sandbox nếu F1 đã có quy ước.

### Chuẩn bị trước khi code F3 (research — không gọi live prod)

- Xác định mẫu CSV PayPal Business (cột Capture ID).
- Map field Cardon hiện có (`providerTxnId`, metadata).
- Không gọi live API production trong giai đoạn thiết kế.

### Không làm trong F3

Balance/Payout (F4), e-invoice (F5), đổi webhook PayPal đã nghiệm thu, Visa SePay, bank recon SePay (F2-B).

### Điều kiện mở F3

Chủ dự án duyệt bắt đầu implementation F3 (sau bước cập nhật tài liệu này). Tài liệu lock **không** tự mở F3.

---

## Ranh giới chung (F2-* / F3 design)

| Được | Không được |
|------|------------|
| Cập nhật docs quyết định / thiết kế | Sửa checkout SePay QR / IPN / HMAC |
| Design schema/API/UI trên giấy | Sửa PaymentService, ví đại lý, MegaPay, PayPal live |
| Filter Finance theo lane + method | Xóa VIETQR / NAPAS_247 |
| | Migration / API giao dịch thật Visa |
| | Tự nhảy sang code F3 hoặc F2-D1 |

---

## Tham chiếu

- Quyết định lock: `esim-finance-decisions-lock.md`
- Đánh giá Visa: `esim-finance-f2-visa-design-evaluation.md`
- Kiến trúc tổng: `esim-finance-reconciliation-architecture.md`
