# F0 — Báo cáo nghiệm thu (UX Ops KPI)

**Ngày:** 2026-11-07  
**Trạng thái:** Chờ chủ dự án nghiệm thu — **không tự mở F1**.

## Mục tiêu đã làm

Đưa doanh thu VND/USD thương mại lên đầu trang Ops eSIM; chuyển báo cáo gói/quốc gia/kinh tế snapshot sang tab; giữ API dashboard hiện có.

## Thay đổi

| File | Nội dung |
|------|----------|
| `apps/admin/app/esim-ops/page.tsx` | KPI doanh thu VND/USD đầu trang; KPI đơn; tab Doanh thu / Gói / Quốc gia / Kinh tế; badge «Tài chính eSIM · chờ F1» |
| `apps/admin/components/esim-ops/esim-ops-ui.ts` | `sumMoneyBucketsByCurrency`, `pickCurrencyBucket` |
| `apps/admin/components/esim-ops/esim-ops-ui.test.ts` | Unit: không cộng VND+USD |

## Không đổi

- Backend / dashboard API  
- DB / migration  
- Payment webhook/IPN / Airalo  
- Module Finance thẻ game  
- F1 route `/finance/esim`

## Before / After (UX)

- **Before:** Doanh thu nằm trong khối collapse cuối trang → phải cuộn + mở.  
- **After:** VND và USD (commerce, SUCCESS) ở viewport đầu; sandbox ghi chú riêng; chi tiết theo cổng/gói/quốc gia/snapshot trong tab luôn mở phía dưới list.

## Test

```bash
cd apps/admin && npx vitest run components/esim-ops/esim-ops-ui.test.ts
```

## Checklist AC

- [ ] Doanh thu VND và USD hiển thị đầu trang, hai số tách biệt  
- [ ] Sandbox không cộng vào KPI thương mại (có dòng ghi chú riêng nếu có)  
- [ ] PAID / đang xử lý / hoàn tất / cần xử lý vẫn đầu trang  
- [ ] Gói & quốc gia nằm trong tab, không chỉ collapse cuối  
- [ ] Bộ lọc list vẫn hoạt động  
- [ ] Không bắt buộc API mới  
- [ ] Không cộng VND+USD (unit test)

## Bằng chứng cần owner

1. Mở Admin → eSIM Ops với khoảng ngày có payment SUCCESS.  
2. Xác nhận KPI VND/USD khớp tab «Doanh thu» (cùng bộ lọc báo cáo).  
3. Đổi tab Gói / Quốc gia / Kinh tế.  
4. Xác nhận list + quick tabs vẫn lọc đúng.

## Kết luận đề xuất

PASS F0 → chủ dự án duyệt → mới mở F1 theo `esim-finance-f0-f1-implementation-plan.md`.
