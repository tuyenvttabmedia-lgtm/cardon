# F0 / F1 — Kế hoạch triển khai chi tiết

## F0 — UX Ops KPI (phase hiện tại)

### Mục tiêu

Người vận hành thấy doanh thu VND/USD và trạng thái đơn **đầu trang**, không cuộn xuống cuối. Báo cáo gói/quốc gia/chi tiết kinh tế chuyển sang tab. Không đổi API backend nếu dashboard hiện có đủ số.

### Phạm vi

| Làm | Không làm |
|-----|-----------|
| KPI doanh thu commerce theo currency (VND, USD) đầu trang | Không đối soát NH / PayPal fee |
| KPI đơn: PAID, fulfilling, completed, cần xử lý (đã có — sắp xếp lại) | Không tạo `/finance/esim` |
| Tab: Doanh thu chi tiết · Gói · Quốc gia · Kinh tế snapshot | Không migration |
| Link chữ «Tài chính eSIM» (placeholder / ghi chú chờ F1) | Không đổi PaymentService |
| Giữ filter ngày/status/market/gateway/lane | Không cộng VND+USD |

### File dự kiến

- `apps/admin/app/esim-ops/page.tsx` (chính)
- Helper format nhỏ trong `esim-ops-ui` nếu cần
- `docs/esim/esim-finance-f0-report.md` khi xong

### AC nghiệm thu F0

1. Doanh thu VND và USD (commerce, payment SUCCESS) hiển thị trong viewport đầu trang, hai số tách biệt.  
2. Sandbox không cộng vào KPI thương mại (có thể ghi chú riêng).  
3. Số đơn PAID / đang fulfillment / hoàn tất / cần xử lý vẫn thấy đầu trang.  
4. Gói bán chạy & quốc gia nằm trong tab, không chỉ ở khối collapse cuối trang.  
5. Bộ lọc list hiện có vẫn hoạt động.  
6. Không gọi API mới bắt buộc; regression admin list/filters không vỡ.  
7. Báo cáo F0 có before/after UX và checklist AC.

### Dừng

PASS F0 → mới mở F1.

---

## F1 — Finance eSIM Revenue (sau F0)

### Mục tiêu

Lane Tài chính eSIM đọc doanh thu từ payment SUCCESS + snapshot, tách currency/gateway/sandbox; export; không đụng VAT thẻ game.

### Phạm vi

| Làm | Không làm |
|-----|-----------|
| Route `/finance/esim` (+ optional `/revenue`) trong FinanceShell | Không SePay bank match (F2) |
| API `GET /admin/finance/esim/revenue` (hoặc tái dùng dashboard + permission finance) | Không PayPal fee CSV (F3) |
| UI: totals VND/USD, theo ngày, theo gateway, link về Ops | Không ProfitService VND |
| Audit khi export (nếu có) | Không migration trừ khi bắt buộc — ưu tiên zero-migration |
| Phân biệt phí ước tính (`paymentFeeAmount`) vs «phí gateway thực: chưa có» | Không F4/F5 |

### Tái sử dụng

- Công thức Phase 4 `esim-ops-dashboard` (cùng định nghĩa SUCCESS / sandbox).  
- `finance.view` permission.  
- Date range pattern `FinanceDateContext`.

### AC nghiệm thu F1

1. Menu Tài chính có mục eSIM; ACCOUNTANT/`finance.view` vào được.  
2. Totals khớp Ops dashboard cùng bộ lọc ngày (sai số 0).  
3. Retail VAT pages không đổi số khi thêm đơn eSIM.  
4. Admin-test/sandbox tách khỏi commerce.  
5. Không cộng VND+USD.  
6. Báo cáo F1 + test list.

### Dừng

PASS F1 → mới mở F2 (ưu tiên) với F3 thiết kế song song.
