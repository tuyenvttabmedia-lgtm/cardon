# MegaPay — bán lẻ CardOn (PG V1.4.6)

CardOn dùng `PaymentGatewayCode.MEGAPAY` cho **ba phương thức bán lẻ**, tất cả đi qua
**một luồng PG V1.4.6** duy nhất (`openPayment`):

| methodCode | UX | payType |
|------------|----|---------|
| `DEPOSIT_CODE` | Chuyển khoản VietQR / mã nộp tiền | `VA` |
| `VNPAYQR` | Chuyển khoản VNPAYQR | `QR` |
| `ZALOPAY` | Ví ZaloPay | `EW` (+ `bankCode=ZALO`) |

**SePay** giữ làm cổng **dự phòng** bán lẻ (priority 2). Khi `createPayment` MegaPay lỗi,
API tự failover sang SePay VietQR (legacy QR). Nạp hạn mức đại lý vẫn chỉ dùng SePay.

> API `registerVA` (DepositCode 3DES) **không còn dùng để tạo thanh toán**. Merchant sandbox
> `VAP001` không xử lý tiền thật, nên VietQR bắt buộc đi qua PG với merchant production.
> Verify notify RSA vẫn giữ để nhận báo có của các giao dịch cũ.

## Luồng MegaPay PG V1.4.6

1. `createPayment` → form fields + `merchantToken` =
   `Sha256(timeStamp + merTrxId + merId + amount + encodeKey)`
2. Web load `paymentClient.js/css` → `openPayment(1, domain)` với form `megapayForm`
3. IPN → `POST /api/v1/payments/webhook/megapay`; payload có `resultCd` + `merchantToken`
4. Verify IPN: `Sha256(resultCd + timeStamp + merTrxId + trxId + merId + amount + encodeKey)`
5. Thành công khi `resultCd = 00_000` (hoặc `00`)

### payType=VA (mã nộp tiền) — khác biệt bắt buộc

| Điểm | Quy tắc |
|------|---------|
| Form | Thêm `vaStartDt`, `vaEndDt`, `vaContent` (`vaContent` = `payment_reference`) |
| Hiệu lực | `vaEndDt` ≥ `vaStartDt` + 30 phút → đơn VietQR có cửa sổ thanh toán tối thiểu 30 phút |
| `resultCd = 00_005` | Đã cấp tài khoản VA nhưng **khách chưa chuyển tiền** → `PENDING`, tuyệt đối không giao thẻ |
| Giao thẻ | Chỉ khi IPN `00_000` (ngân hàng đã báo có) |
| Hoàn tiền | MegaPay **không hỗ trợ** hủy/hoàn cho `VA` → `refund()` trả lỗi, phải hoàn thủ công |

Web nhận `00_005` sẽ hiện màn hình “Chờ nhận chuyển khoản” (`/checkout/result`) kèm thông tin
tài khoản, và poll trạng thái đơn cho tới khi `PAID`.

Tài liệu: `MGP_Merchant_Interface_V1.4.6(VN).pdf`

## ENV

| Biến | Ý nghĩa |
|------|---------|
| `MEGAPAY_MERCHANT_ID` | merchant_code / merId |
| `MEGAPAY_SECRET_KEY` | Key 3DES DepositCode (24 ký tự) |
| `MEGAPAY_PG_ENCODE_KEY` | encodeKey PG V1.4.6 (fallback = SECRET_KEY) |
| `MEGAPAY_PG_MERCHANT_ID` | merId PG (vd `CARDON0001`) — fallback = `MEGAPAY_MERCHANT_ID` |
| `MEGAPAY_PG_REFUND_PASSWORD` | Password hoàn tiền API `paymentCancel.do` |
| `MEGAPAY_PG_ENVIRONMENT` | `sandbox` \| `production` (domain/JS) |
| `MEGAPAY_REQ_DOMAIN` | Site công khai (vd `https://cardon.vn`) |
| `MEGAPAY_ENDPOINT` | URL `.../registerVA` — chỉ còn dùng cho tra cứu/notify giao dịch cũ |
| `MEGAPAY_BANK_CODE` | VD `WOORIBANK` (DepositCode legacy) |
| `MEGAPAY_NOTIFY_PUBLIC_KEY` / `_PATH` | PEM verify DepositCode notify (giao dịch cũ) |
| `MEGAPAY_CALLBACK_URL` | IPN / DepositCode notify URL |
| `MEGAPAY_RETURN_URL` | Redirect sau thanh toán (callBackUrl PG) |

## Admin (Cấu hình → Thanh toán)

Card **MegaPay** tách rõ:

1. **Luồng 1 · DepositCode (legacy)** — merchantId, 3DES, endpoint `registerVA`, bank code, RSA notify PEM.
   Chỉ phục vụ tra cứu/notify giao dịch cũ; không tạo thanh toán mới.
2. **Luồng 2 · PG V1.4.6** — PG encodeKey, pgMerchantId, refund password, pgEnvironment, reqDomain, returnUrl.
   Đây là luồng duy nhất tạo thanh toán bán lẻ.
3. **3 công tắc method** — `DEPOSIT_CODE` | `VNPAYQR` | `ZALOPAY` (bật + phí).

SePay methods chỉnh riêng ở card **Phương thức SePay**. Priority: MegaPay = 1, SePay = 2 (dự phòng).

## Sandbox DepositCode demo

```
MEGAPAY_MERCHANT_ID=VAP001
MEGAPAY_SECRET_KEY=31feae316de0a42520ef5ec4
MEGAPAY_ENDPOINT=https://sandboxva.ecollect.vn:10003/ApiResf_VirtualAccount/services/registerVA
MEGAPAY_BANK_CODE=WOORIBANK
MEGAPAY_NOTIFY_PUBLIC_KEY_PATH=secrets/megapay-notify-public.pem
MEGAPAY_PG_ENVIRONMENT=sandbox
```

```bash
node scripts/uat/test-depositcode-sandbox.mjs
```
