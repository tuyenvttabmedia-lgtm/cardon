# MegaPay / VNPT ePay — trạng thái bán lẻ

## Đã làm

- **3 phương thức bán lẻ, một luồng PG V1.4.6**:
  - `DEPOSIT_CODE` — VietQR / mã nộp tiền, `payType=VA`
  - `VNPAYQR` — `payType=QR`
  - `ZALOPAY` — `payType=EW`, `bankCode=ZALO`
- Webhook MegaPay **chỉ** nhận PG IPN `merchantToken` (Luồng 1 DepositCode RSA notify đã tắt).
- `resultCd=00_005` (VA đã cấp, chưa có tiền) → `PENDING`; chỉ IPN `00_000` mới giao thẻ.
- Refund `payType=VA` bị chặn ở provider (MegaPay không hỗ trợ hủy giao dịch VA).
- Đơn dùng mã nộp tiền có cửa sổ thanh toán tối thiểu 30 phút, khớp `vaEndDt`.
- **SePay dự phòng bán lẻ**: failover khi MegaPay `createPayment` lỗi; nạp đại lý vẫn SePay-only.
- Default priority: MegaPay 1, SePay 2.
- Unit tests: PG form (QR/EW/VA), IPN `00_000`/`00_005`, refund VA bị chặn.

## Trạng thái go-live

| Method | MegaPay bật? | Ghi chú |
|--------|--------------|---------|
| `VNPAYQR` | Có | Đang chạy production |
| `DEPOSIT_CODE` | Có (`payType=VA`) | Đã chuyển sang PG production |
| `ZALOPAY` | **Chưa** | MegaPay trả `PayType is not supported` cho `EW` — chờ họ mở cho `CARDON0001` |

## ENV production bắt buộc

1. `MEGAPAY_PG_MERCHANT_ID=CARDON0001`
2. `MEGAPAY_PG_ENCODE_KEY`
3. `MEGAPAY_PG_REFUND_PASSWORD`
4. `MEGAPAY_PG_ENVIRONMENT=production`
5. `MEGAPAY_CALLBACK_URL=https://cardon.vn/api/v1/payments/webhook/megapay`
6. `MEGAPAY_RETURN_URL=https://cardon.vn/checkout/result`
7. `MEGAPAY_REQ_DOMAIN=https://cardon.vn`

`MEGAPAY_MERCHANT_ID` / `MEGAPAY_SECRET_KEY` / `MEGAPAY_ENDPOINT` (sandbox `VAP001`) là
credential DepositCode cũ — **không dùng** cho bán lẻ; có thể để trống trong admin.
Runtime chỉ cần PG: `MEGAPAY_PG_*` + callback/return/reqDomain.

Chi tiết: `docs/04_MEGAPAY_INTEGRATION.md`
