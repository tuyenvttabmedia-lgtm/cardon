# MegaPay — bán lẻ CardOn (DepositCode + PG V1.4.6)

CardOn dùng `PaymentGatewayCode.MEGAPAY` cho **ba phương thức bán lẻ**:

| methodCode | UX | Tích hợp |
|------------|----|----------|
| `DEPOSIT_CODE` | Chuyển khoản VietQR (QR inline) | DepositCode `registerVA` (3DES) |
| `VNPAYQR` | Chuyển khoản VNPAYQR | MegaPay PG `payType=QR` + `openPayment` |
| `ZALOPAY` | Ví ZaloPay | MegaPay PG `payType=EW` + `bankCode=ZALO` |

**SePay** giữ làm cổng **dự phòng** bán lẻ (priority 2). Khi `createPayment` MegaPay lỗi,
API tự failover sang SePay VietQR (legacy QR). Nạp hạn mức đại lý vẫn chỉ dùng SePay.

## Luồng DepositCode (VietQR)

1. `createPayment` → `registerVA` (pcode 9000, 3DES) → `account_no` + QR
2. Khách chuyển đúng số tiền vào VA
3. EPAY notify → `POST /api/v1/payments/webhook/megapay`
4. Verify chữ ký RSA (`RequestId|ReferenceId|RequestTime|Amount|Fee|VaAcc|MapId`)
5. `MapId` = `payment_reference`
6. Response: `{ "ResponseCode": "200", "ResponseMessage": "Success" }`

## Luồng MegaPay PG V1.4.6 (VNPAYQR / ZaloPay)

1. `createPayment` → form fields + `merchantToken` =
   `Sha256(timeStamp + merTrxId + merId + amount + encodeKey)`
2. Web load `paymentClient.js/css` → `openPayment(1, domain)` với form `megapayForm`
3. IPN → cùng webhook URL; payload có `resultCd` + `merchantToken`
4. Verify IPN: `Sha256(resultCd + timeStamp + merTrxId + trxId + merId + amount + encodeKey)`
5. Thành công khi `resultCd = 00_000` (hoặc `00`)

Tài liệu: `MGP_Merchant_Interface_V1.4.6(VN).pdf`

## ENV

| Biến | Ý nghĩa |
|------|---------|
| `MEGAPAY_MERCHANT_ID` | merchant_code / merId |
| `MEGAPAY_SECRET_KEY` | Key 3DES DepositCode (24 ký tự) |
| `MEGAPAY_PG_ENCODE_KEY` | encodeKey PG V1.4.6 (fallback = SECRET_KEY) |
| `MEGAPAY_PG_ENVIRONMENT` | `sandbox` \| `production` (domain/JS) |
| `MEGAPAY_REQ_DOMAIN` | Site công khai (vd `https://cardon.vn`) |
| `MEGAPAY_ENDPOINT` | URL `.../registerVA` |
| `MEGAPAY_BANK_CODE` | VD `WOORIBANK` (DepositCode) |
| `MEGAPAY_NOTIFY_PUBLIC_KEY` / `_PATH` | PEM verify DepositCode notify |
| `MEGAPAY_CALLBACK_URL` | IPN / DepositCode notify URL |
| `MEGAPAY_RETURN_URL` | Redirect sau thanh toán (callBackUrl PG) |

## Admin

- Bật 3 method MegaPay trong **Phương thức thanh toán**.
- Priority: MegaPay = 1, SePay = 2 (dự phòng).
- Nếu DB đã lưu method `enabled=false`, bật lại ZALOPAY / VNPAYQR trên Admin.

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
