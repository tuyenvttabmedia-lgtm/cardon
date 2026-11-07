# Fixture — PayPal Activity Download (KEYON)

**Trạng thái:** Chưa có file. F3-B parser **blocked** cho đến khi KEYON đặt CSV thật vào thư mục này.

## Đặt file

```
docs/esim/fixtures/paypal-activity-download-KEYON-sample.csv
```

Tuỳ chọn kèm ghi chú môi trường:

```
docs/esim/fixtures/paypal-activity-download-KEYON-sample.meta.md
```

Nội dung meta gợi ý: sandbox|live, ngày xuất, khoảng ngày, PayPal account email (có thể che), người xuất.

## Yêu cầu tối thiểu

Xem checklist đầy đủ: `docs/esim/esim-finance-f3-b-implementation-plan.md` §4.

Tóm tắt: CSV UTF-8 từ PayPal Business → Activity Download; giữ nguyên header; có Transaction ID, Gross, Fee, Net, Currency, Date/Time, Type hoặc Transaction Event Code, Status, Balance Impact; ideally Custom Number + Reference Txn ID.

**Không** tạo file CSV giả trong repo để “giả lập” tương thích.
