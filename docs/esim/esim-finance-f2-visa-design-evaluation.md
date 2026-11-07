# Đánh giá phương án F2 mới — SePay Visa (design-only)

**Ngày:** 2026-11-07  
**Phạm vi:** Audit + đánh giá phù hợp CardOn. **Chưa code, chưa migration, chưa gọi API.**  
**Nguồn đề xuất:** phương án GPT thu hẹp F2 (bỏ đối soát VietQR/NAPAS eSIM → thiết kế Visa qua SePay theo mô hình PG như MegaPay).

---

## 0. Kết luận ngắn

| Câu hỏi | Đánh giá |
|---------|----------|
| Có phù hợp hướng **thiết kế sẵn** Visa SePay, `NOT_REGISTERED`, không đụng checkout hiện tại? | **Có — phù hợp** với nguyên tắc CardOn (abstraction PG, estimated vs actual fee, không live khi thiếu tài liệu). |
| Có thể **thay thế nguyên F2 cũ** (SePay ↔ ngân hàng VietQR) ngay? | **Chỉ khi chủ dự án chấp nhận lỗ hổng đối soát VND hiện tại** — vì eSIM VN **đang** thu tiền qua SePay `BANK_TRANSFER` / method `VIETQR`. |
| Có nên **dev Visa checkout** trong F2 lần này? | **Không** — đồng ý GPT: design-only. |
| MegaPay có phải bản sao Visa thẻ? | **Một phần** — tái dụng được IPN/HMAC/reconcile/settlement pattern; **không** phải tích hợp thẻ Visa thật (legacy `MEGAPAY_VISA` → MegaPay `payType=QR` / VNPAYQR). |

**Khuyến nghị:** Chấp nhận **F2-D (Design Visa SePay)** như phase thiết kế tài liệu; **không** gọi là “bỏ VietQR eSIM” trong code/docs vì mâu thuẫn thực tế. Quyết định riêng: F2-bank-recon (sao kê NH cho `BANK_TRANSFER`) **hoãn / hủy / hạ ưu tiên** sau F3 PayPal hay không.

---

## 1. Hiệu chỉnh nghiệp vụ quan trọng (audit vs đề xuất GPT)

### 1.1 VietQR / SePay eSIM — đề xuất GPT cần sửa

GPT viết: *«Cardon hiện không dùng VietQR để thanh toán đơn hàng eSIM»*.

**Thực tế code (đã nghiệm thu):**

| Điểm | Bằng chứng |
|------|------------|
| eSIM SePay checkout | `EsimSepayPaymentService` gửi `payment_method: 'BANK_TRANSFER'` |
| Method code đơn | `PaymentService` map SEPAY eSIM → `methodCode: 'VIETQR'` |
| SePay PG abstraction | `SepayPgPaymentMethod = 'BANK_TRANSFER' \| 'NAPAS_BANK_TRANSFER'` — **không có** CARD/VISA |
| Refund schema | Cố ý **không** có `SEPAY_CARD` / `VISA_MASTERCARD` |

→ eSIM VND hiện tại = **SePay chuyển khoản / Viet QR (BANK_TRANSFER)**.  
→ “Không đối soát VietQR eSIM” là **quyết định ưu tiên kế toán**, không phải “không có giao dịch VietQR”.

### 1.2 NAPAS_247

- Default settings: `methodCode: NAPAS_247`, **enabled: false**, fee % 0.3.  
- Admin SePay PG config có option `NAPAS_BANK_TRANSFER`.  
- Legacy map: `SEPAY_NAPAS_QR → NAPAS_247`.  
- **Đúng:** không đưa NAPAS vào báo cáo eSIM đang chạy; **không xóa** config dùng chung.

### 1.3 Phí VIETQR «700đ»

- Default code: `fixedFee: 300` (không phải 700) trong `DEFAULT_PAYMENT_METHODS`.  
- Fee thực tế có thể đã đổi trong DB admin — cần đọc settings live khi triển khai; **không** lấy ảnh/đề xuất GPT làm phí hợp đồng.  
- Agent deposit dùng SePay gateway riêng (webhook deposit), không phải cùng dòng fee eSIM checkout.

### 1.4 MegaPay làm tham chiếu

Tái dụng được:

- `PaymentProviderInterface` (create / verifyWebhook / query / refund).  
- WebhookLog + chữ ký + idempotent settle.  
- `Payment.reconciliationStatus` / `settlementDate` / `bankReference`.  
- `PaymentReconcileService` + `ReconcileReport` / `ReconcileItem`.  
- `PaymentGatewayInvoice` (fee theo kỳ).  
- Admin «Cấu hình → Thanh toán»: methodCode, percentageFee, fixedFee, enabled, settlementType.

**Không** copy nguyên:

- MegaPay `MEGAPAY_VISA` → `VNPAYQR` / payType `QR` ≠ acquiring thẻ Visa.  
- DepositCode / VA path.  
- eSIM lane hiện chỉ SePay BANK_TRANSFER + PayPal.

---

## 2. Audit kỹ thuật (7 mục GPT)

### 2.1 SePay eSIM — một method hay nhiều?

- **Runtime eSIM:** cứng `BANK_TRANSFER`.  
- **Layer PG:** abstraction 2 method (`BANK_TRANSFER`, `NAPAS_BANK_TRANSFER`) — **chưa** card.  
- Mở Visa = **method / operation mới** trên cùng gateway `SEPAY` + `productLane=ESIM`, không tái dùng form QR hiện tại.

### 2.2 MegaPay

- Checkout form + IPN token + trx status + cancel.  
- Settlement type mặc định `GATEWAY_SETTLEMENT`.  
- Đủ làm **blueprint kiến trúc**, không phải spec Visa SePay.

### 2.3 Finance reconcile hiện có

- `PaymentReconcileService`: so khớp danh sách giao dịch gateway vs payment nội bộ theo ngày → `ReconcileReport` / items.  
- Schema payment đã có `reconciliationStatus`, `settlementDate`, `bankReference`.  
- **Chưa** có lane eSIM Visa / settlement batch riêng.  
- F1 revenue đã tách commerce/sandbox — mọi recon F2 phải filter `productLane=ESIM` + method code.

### 2.4 Cấu hình Thanh toán

- Methods SEPAY: VIETQR (on), NAPAS_247 (off).  
- MegaPay: ZALOPAY, DEPOSIT_CODE, VNPAYQR.  
- Thêm Visa SePay: nên là method **mới** (vd. `SEPAY_VISA` / `CARD`) **disabled / NOT_REGISTERED**, không đụng VIETQR.

### 2.5–2.7 VIETQR / NAPAS / không xóa

| Item | Kết luận |
|------|----------|
| VIETQR | Bán lẻ thẻ/nạp + **eSIM VND** + legacy map; agent deposit SePay tách webhook |
| NAPAS_247 | Config sẵn, tắt; PG hỗ trợ `NAPAS_BANK_TRANSFER` |
| Xóa? | **Cấm** — chỉ phân loại lane/method trong Finance eSIM |

---

## 3. So sánh F2 cũ vs F2 mới

| | F2 cũ (đã lock) | F2 mới (GPT) |
|--|-----------------|--------------|
| Mục tiêu | Sao kê NH ↔ SePay SUCCESS eSIM (chủ yếu VietQR) | Thiết kế đối soát **Visa card** qua SePay |
| Dữ liệu live hiện có | Có (SUCCESS VND F1) | **Chưa** (KEYON chưa đăng ký) |
| Rủi ro đụng prod | Import CSV / match — không sửa IPN nếu làm đúng | Design-only → rủi ro prod thấp |
| Giá trị kế toán ngắn hạn | Cao (đối soát tiền đang về) | Thấp đến khi Visa bật |
| Phụ thuộc tài liệu NCC | Mẫu sao kê NH | **Bắt buộc** SePay Visa docs |
| Xung đột F1 cashflow VND | Không | Tạo **khoảng trống** nếu hủy hẳn bank recon |

**Phù hợp CardOn nếu:**

1. Đổi tên rõ: **F2-D SePay Visa Architecture** (design), không ghi “eSIM không dùng VietQR”.  
2. Ghi nhận **F2-B Bank recon** (optional backlog) cho `BANK_TRANSFER` hiện tại.  
3. Cân nhắc **đưa F3 PayPal CSV lên trước** implementation vì USD đã live; F2-D chạy song song research.

---

## 4. Kiến trúc SePay Visa đề xuất (design — chưa schema chốt)

### 4.1 Tái dụng MegaPay / Finance

```
Order (ESIM, charge VND)
  → Payment (gateway=SEPAY, methodCode=SEPAY_VISA|CARD, productLane=ESIM)
  → ProviderAdapter.createPayment (future)
  → WebhookLog + verify signature
  → Settle SUCCESS (idempotent) → Fulfillment queue
  → Finance: txn recon + settlement recon (estimated fee ≠ actual fee)
```

Trạng thái cấu hình: `NOT_REGISTERED` → `DOCS_READY` → `SANDBOX` → `ENABLED` (chỉ khi KEYON + SePay xác nhận).

### 4.2 Nhóm dữ liệu (đúng yêu cầu GPT — field optional nếu docs chưa có)

| Nhóm | Nội dung | Ghi chú |
|------|----------|---------|
| Payment txn | orderId, paymentReference, sepayTxnId, amount/currency, status, auth/capture?, timestamps | Capture riêng = **optional** đến khi docs xác nhận |
| Webhook log | providerTxnId, eventType, receivedAt, signatureOk, outcome, duplicate | Không PAN/CVV/expiry |
| Fee | contract % / fixed; report actual; estimated vs actual | Không lấy ảnh phí làm hợp đồng |
| Settlement | batchRef, gross/fee/net, settlementDate, bankRef, bankAmount, reconStatus | Có thể CSV-first giống PayPal F3 nếu API thiếu |

### 4.3 UI Finance eSIM (Visa)

Tab `/finance/esim/sepay-visa` (hoặc panel):

- Badge **NOT_REGISTERED** (không KPI thương mại giả).  
- Placeholder: merchant config, fee contract, txn list empty, IPN log empty, txn recon, settlement recon.  
- **Không** hiện Visa như đang bán.

### 4.4 Schema / API dự kiến (chỉ đề xuất — chờ duyệt + docs)

- Config: `StoredPaymentMethod` mới disabled + flags `registrationStatus`.  
- Có thể tái dụng `WebhookLog`, `payments.*`, `ReconcileReport`; bảng settlement batch **chỉ khi** docs SePay có batch.  
- API admin đọc-only stubs khi NOT_REGISTERED.  
- **Chưa migration** cho đến phase implementation được duyệt.

---

## 5. Tài liệu SePay — đã biết vs còn thiếu

### Đã có trong repo / code (BANK_TRANSFER)

- Checkout init URL sandbox/prod, signed field order, IPN secret/HMAC eSIM.  
- Query order PG (`querySepayPgOrder`), map status CAPTURED→SUCCESS.  
- Method enum hiện tại chỉ bank transfer / NAPAS bank transfer.

### Chưa xác minh (bắt buộc xin SePay trước khi code Visa)

1. Payment method code chính thức cho **thẻ Visa/Mastercard** (tên field `payment_method`).  
2. Auth-only vs Purchase/Capture; void/refund API.  
3. IPN/webhook event types + chữ ký cho card (có khác BANK_TRANSFER không).  
4. Settlement report / fee report API hoặc CSV mẫu.  
5. Sandbox merchant card + test cards.  
6. 3DS / return URL flow.  
7. Currency (chỉ VND?).  
8. PCI: hosted page vs raw card (CardOn phải hosted — không lưu PAN).  
9. Mapping transaction id ↔ `order_invoice_number`.  
10. SLA đối soát / chargeback.

---

## 6. Ảnh hưởng cấu hình hiện tại

| Hành động | Cho phép? |
|-----------|-----------|
| Thêm method Visa disabled / NOT_REGISTERED | Sau duyệt design |
| Tắt/xóa VIETQR hoặc NAPAS_247 | **Không** |
| Sửa IPN/HMAC eSIM BANK_TRANSFER | **Không** trong F2-D |
| Đổi fee VIETQR / agent deposit | **Không** |
| Hiển thị Visa enabled trên storefront | **Không** đến khi ENABLED |

---

## 7. File dự kiến thay đổi (khi được duyệt implementation — chưa làm)

**Design-only (bước này):** chỉ docs (`esim-finance-f2-visa-*.md`, cập nhật decisions-lock).

**Sau duyệt + đủ docs SePay (ước lượng):**

- `docs/esim/esim-finance-decisions-lock.md` — đổi định nghĩa F2  
- `docs/esim/esim-finance-f2-f3-technical-design.md` — tách F2-D / F2-B  
- Settings types + admin payment config (method stub)  
- Finance eSIM UI panel NOT_REGISTERED  
- (Muộn hơn) SePay card adapter, IPN branch, reconcile services  

**Không đụng:** `esim-sepay-payment.service` checkout QR, agent-deposit, MegaPay live, PayPal.

---

## 8. Đề xuất chia phase khi đủ tài liệu

| Phase | Nội dung | Điều kiện mở |
|-------|----------|--------------|
| **F2-D0** | Báo cáo này + lock quyết định chủ dự án | Đang làm |
| **F2-D1** | UI/config stub NOT_REGISTERED + checklist docs SePay | Duyệt F2-D |
| **F2-D2** | Schema/API design chi tiết theo docs SePay đã xác minh | Nhận docs chính thức |
| **F2-I1** | Sandbox adapter + IPN (không prod) | Merchant sandbox + test cards |
| **F2-I2** | Txn recon + fee actual (CSV/API) | Mẫu settlement |
| **F2-I3** | Enable prod | KEYON đăng ký + AC pháp lý/PCI |
| **F2-B** (optional) | Bank recon VietQR eSIM | Nếu vẫn cần đối soát VND đang live |
| **F3** | PayPal CSV fee | Có thể **song song / ưu tiên trước F2-I*** |

---

## 9. Rủi ro nếu chốt sai

1. Tin GPT “eSIM không VietQR” → tài liệu/ops nhầm → bỏ sót tiền VND.  
2. Coi MegaPay VISA = thẻ → design sai PCI/3DS.  
3. Migration sớm khi chưa docs → schema vứt.  
4. Bật UI như đã bán → khách/checkout nhầm.  
5. Xóa NAPAS/VIETQR config → gãy bán lẻ / agent.

---

## 10. Câu hỏi cần chủ dự án chốt (trước mọi code)

1. **F2-B** (đối soát sao kê NH cho SePay `BANK_TRANSFER` eSIM hiện tại): **hủy / hoãn sau F3 / vẫn làm song song F2-D?**  
2. Có xác nhận KEYON **chỉ** cần chuẩn bị Visa, và tạm chấp nhận chưa đối soát NH cho QR eSIM?  
3. F3 PayPal CSV có được **ưu tiên implementation** trước F2-I (Visa sandbox)?  
4. Tên method nội bộ: `SEPAY_VISA` vs `CARD` — chờ SePay docs.

---

## 11. Điều kiện dừng

Báo cáo thiết kế/đánh giá xong.  
**Không** sửa checkout, IPN, PaymentService, ví đại lý, migration, API live, F3/F4/F5.

**Chờ duyệt** trước khi cập nhật `esim-finance-decisions-lock.md` chính thức và trước mọi stub code.
