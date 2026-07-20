# VNPT ePay DepositCode (MegaPay gateway slot)

CardOn dùng `PaymentGatewayCode.MEGAPAY` để chạy **DepositCode VA** (tài liệu
`[DepositCode]API_For_Merchant_V1.4`).

## Luồng

1. `createPayment` → `registerVA` (pcode 9000, 3DES) → nhận `account_no` + QR
2. Khách chuyển đúng số tiền vào VA
3. EPAY gọi notify → `POST /api/v1/payments/webhook/megapay`
4. Verify chữ ký RSA (`RequestId|ReferenceId|RequestTime|Amount|Fee|VaAcc|MapId`)
5. `MapId` = `payment_reference` (PAY-… / DEP-…)
6. Response bắt buộc: `{ "ResponseCode": "200", "ResponseMessage": "Success" }`

## ENV

| Biến | Ý nghĩa |
|------|---------|
| `MEGAPAY_MERCHANT_ID` | merchant_code |
| `MEGAPAY_SECRET_KEY` | Key 3DES (24 ký tự) |
| `MEGAPAY_ENDPOINT` | URL `.../registerVA` |
| `MEGAPAY_BANK_CODE` | VD `WOORIBANK` |
| `MEGAPAY_NOTIFY_PUBLIC_KEY` hoặc `MEGAPAY_NOTIFY_PUBLIC_KEY_PATH` | Public key PEM verify notify |
| `MEGAPAY_CALLBACK_URL` | URL merchant khai báo cho EPAY |
| `MEGAPAY_RETURN_URL` | Redirect sau thanh toán (UI) |

## Sandbox demo (trong tài liệu EPAY)

```
MEGAPAY_MERCHANT_ID=VAP001
MEGAPAY_SECRET_KEY=31feae316de0a42520ef5ec4
MEGAPAY_ENDPOINT=https://sandboxva.ecollect.vn:10003/ApiResf_VirtualAccount/services/registerVA
MEGAPAY_BANK_CODE=WOORIBANK
MEGAPAY_NOTIFY_PUBLIC_KEY_PATH=secrets/megapay-notify-public.pem
```

Test nhanh register:

```bash
node scripts/uat/test-depositcode-sandbox.mjs
```

## Production

Khi VNPT gửi merchant thật: chỉ cần đổi các biến `MEGAPAY_*` (+ public key notify),
bật gateway MegaPay trong Admin, rebuild/restart API. Không cần sửa code.
