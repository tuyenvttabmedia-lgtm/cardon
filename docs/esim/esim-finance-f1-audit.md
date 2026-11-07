# F1 Audit — trước triển khai (2026-11-07)

## Kết luận

**Không cần migration / đổi schema.** Doanh thu eSIM đã có đủ nguồn trong `payments` (SUCCESS) + order snapshot; công thức thuần đã nằm ở `esim-ops-dashboard.ts`. F1 = lane Finance UI + endpoint `finance.view` tái sử dụng cùng query/logic, bổ sung series theo ngày và nhãn phí ước tính.

## Hiện trạng

| Hạng mục | Nơi | Ghi chú |
|----------|-----|---------|
| FinanceShell | `apps/admin/components/finance/FinanceShell.tsx` | Wrap `finance.view` + `FinanceDateProvider`; nav chỉ VAT |
| Date range | `FinanceDateContext` | `dateFrom`/`dateTo` VN calendar; preset today/7d/month |
| Quyền | `finance.view` | ACCOUNTANT có; Ops dashboard hiện `orders.read` |
| Doanh thu eSIM | `EsimAdminService.getOpsDashboard` → `buildEsimOpsDashboard` | SUCCESS, 1 payment/order, sandbox tách, không FX |
| Payment filter | `status: SUCCESS`, paidAt trong range, order ESIM B2C | Không PENDING/FAILED/EXPIRED |
| Fee | `order.paymentFeeAmount` | Snapshot ước tính — chưa có fee gateway thực |
| Export Finance | `ExportService` + `assertExportCsvSafe` | Có pattern; audit invoice/reconcile, chưa có export eSIM |

## Phương án F1 (đã chọn)

1. Pure helper `buildEsimFinanceRevenue` cùng primitives (`pickUniqueSuccessPayments`, `esimOpsLane`, currency rules).  
2. `EsimAdminService.getFinanceRevenue` tái dùng cùng Prisma query như dashboard (không query thứ hai khác định nghĩa).  
3. `GET /admin/finance/esim/revenue` (+ export CSV) trên FinanceController, permission `finance.view` only.  
4. Admin: `/finance/esim` + mục nav; panel dùng `useFinanceDates`.  
5. Ops badge «Tài chính eSIM» trỏ `/finance/esim`.

## Không làm

Migration · PaymentService/webhook · Profit/VAT VND · F2–F5 · Live PayPal/NH.

## Rủi ro còn lại (chấp nhận F1)

- «Theo ngày» theo `paidAt` (fallback `createdAt`) — khớp định nghĩa revenue payment, không theo `order.createdAt`.  
- So khớp Ops: cùng `from`/`to`; Ops preset `30d` ≠ Finance `month` nếu không chọn cùng ngày tay.
