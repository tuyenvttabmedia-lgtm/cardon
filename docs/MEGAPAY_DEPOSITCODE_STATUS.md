# MegaPay / VNPT ePay — trạng thái bán lẻ

## Đã làm

- **3 phương thức bán lẻ** (V1.4.6 + DepositCode):
  - `DEPOSIT_CODE` — VietQR / mã nộp tiền (`registerVA`)
  - `VNPAYQR` — MegaPay PG `payType=QR` + `openPayment`
  - `ZALOPAY` — MegaPay PG `payType=EW`, `bankCode=ZALO`
- Webhook MegaPay nhận cả DepositCode RSA notify và PG IPN `merchantToken`.
- **SePay dự phòng bán lẻ**: failover khi MegaPay `createPayment` lỗi; nạp đại lý vẫn SePay-only.
- Default priority: MegaPay 1, SePay 2.
- Unit tests DepositCode + PG form/IPN.

## Khi VNPT gửi account production

1. `MEGAPAY_MERCHANT_ID`
2. `MEGAPAY_SECRET_KEY` (3DES DepositCode)
3. `MEGAPAY_PG_ENCODE_KEY` (nếu khác key 3DES)
4. `MEGAPAY_ENDPOINT` (registerVA production)
5. `MEGAPAY_PG_ENVIRONMENT=production`
6. `MEGAPAY_NOTIFY_PUBLIC_KEY`
7. `MEGAPAY_CALLBACK_URL=https://cardon.vn/api/v1/payments/webhook/megapay`
8. `MEGAPAY_RETURN_URL` / `MEGAPAY_REQ_DOMAIN`

Admin: bật gateway MegaPay + 3 method; giữ SePay enabled làm dự phòng.

Chi tiết: `docs/04_MEGAPAY_INTEGRATION.md`
