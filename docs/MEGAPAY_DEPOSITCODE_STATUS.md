# MegaPay / VNPT ePay DepositCode — trạng thái

## Đã làm

- Adapter **DepositCode VA** gắn vào gateway `MEGAPAY` (reuse enum/webhook/agent-deposit).
- Sandbox demo (`VAP001`) cấu hình trong `.env.local-full`.
- Webhook response đúng chuẩn EPAY: `ResponseCode` 200/102/103/125.
- Unit tests MegaPay/DepositCode: pass.
- Local API rebuild; `settings.payment.gateway.megapay.enabled=true`.

## Khi VNPT gửi account production

Đổi ENV (hoặc Admin Settings MegaPay):

1. `MEGAPAY_MERCHANT_ID`
2. `MEGAPAY_SECRET_KEY` (Key 3DES 24 ký tự)
3. `MEGAPAY_ENDPOINT` (URL registerVA production)
4. `MEGAPAY_BANK_CODE`
5. `MEGAPAY_NOTIFY_PUBLIC_KEY` (PEM public key verify notify)
6. `MEGAPAY_CALLBACK_URL=https://cardon.vn/api/v1/payments/webhook/megapay`

Khai báo URL notify + IP server với EPAY, restart API — không cần sửa code.

## Test sandbox nhanh

```bash
node scripts/uat/test-depositcode-sandbox.mjs
```

Chi tiết kỹ thuật: `docs/04_MEGAPAY_INTEGRATION.md`
