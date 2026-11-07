# F1 — Báo cáo nghiệm thu (Finance eSIM Revenue)

**Ngày:** 2026-11-07  
**Trạng thái:** Xác minh cuối hoàn tất — **chờ chủ dự án PASS**. Không mở F2.

## 1. Phạm vi đã triển khai (nhắc lại)

- Route `/finance/esim` trong FinanceShell (`finance.view`).
- API `GET /admin/finance/esim/revenue` + `…/export` (audit `ESIM_REVENUE_EXPORTED`).
- Cùng loader SUCCESS với Ops dashboard; sandbox tách; không FX; phí thực `UNAVAILABLE`.
- Zero migration; không đụng PaymentService / webhook / VAT Profit.

Chi tiết audit: `esim-finance-f1-audit.md`.

## 2. Bảng đối chiếu cuối — 08/10/2026 → 07/11/2026

Nguồn: API local + UI cùng khoảng (custom `from`/`to`).

| Hạng mục | Ops `/esim-ops` | Finance `/finance/esim` | Khớp? |
|----------|-----------------|-------------------------|-------|
| **VND thương mại** | 9 payment · **1.074.000 ₫** | 9 payment · **1.074.000 ₫** | Có |
| **USD thương mại** | 2 payment · **$10.51** | 2 payment · **$10.51** | Có |
| **Sandbox / admin-test** | 1 payment · **78.000 ₫** (tách) | 1 payment · **78.000 ₫** (tách) | Có |
| Payment SUCCESS khớp (unique order) | `matchedSuccessPayments=12` | `matchedSuccessPayments=12` | Có |
| Phí gateway thực | — | `UNAVAILABLE` | Đúng F1 |

Gateway breakdown (commerce, cả hai nguồn):

| Currency | Gateway | Payments | Amount |
|----------|---------|----------|--------|
| VND | SEPAY | 9 | 1074000.00 |
| USD | PAYPAL | 2 | 10.51 |

## 3. SUCCESS / không trùng / loại trừ trạng thái khác

SQL local (`payments` eSIM trong khoảng paidAt/createdAt):

| status | count |
|--------|------:|
| SUCCESS | 12 |
| EXPIRED | 35 |

- Đơn có **>1 SUCCESS** trong khoảng: **0 hàng** (không đếm trùng ở DB; engine vẫn `pickUniqueSuccessPayments`).
- Revenue API/UI chỉ lấy SUCCESS → **EXPIRED/PENDING/FAILED không vào doanh thu**.
- 12 SUCCESS = 11 commerce + 1 sandbox.

## 4. Export CSV + audit

- `GET …/export?dateFrom=2026-10-08&dateTo=2026-11-07` → HTTP 200; payload CSV chứa VND/USD/sandbox/estimated_fee/`UNAVAILABLE` khớp bảng trên.
- `audit_logs`: **1** dòng `ESIM_REVENUE_EXPORTED` (2026-11-07 14:25:57Z) với metadata `commercePayments=11`, `sandboxPayments=1`, `dateFrom/dateTo` đúng.
- Ghi chú: interceptor API bọc CSV trong envelope JSON `success.data`; client admin `apiRequest` unwrap đúng. Không sửa code trong vòng xác minh.

## 5. Quyền

| Kiểm tra | Kết quả |
|----------|---------|
| ACCOUNTANT `maint@keyon.vn` có `finance.view` | True |
| ACCOUNTANT `GET /admin/finance/esim/revenue` cùng khoảng | 200 · VND/USD khớp bảng |
| ACCOUNTANT `GET /admin/customers` | **403** |
| Không token → finance eSIM | **401** |
| Unit: ACCOUNTANT `finance.view` = true; SUPPORT = false (`finance.integrity-audit`) | PASS |

## 6. Ảnh cùng khoảng ngày

| File | Nội dung |
|------|----------|
| `docs/esim/evidence/f1-finance-esim-2026-10-08_2026-11-07.png` | `/finance/esim` — KPI 1.074.000 ₫ / $10.51 / sandbox 1 / UNAVAILABLE |
| `docs/esim/evidence/f1-esim-ops-2026-10-08_2026-11-07.png` | `/esim-ops` custom 08/10–07/11 — cùng VND/USD + sandbox 78.000 ₫ |

## 7. Test đã chạy (có bằng chứng PASS)

| Suite | Kết quả |
|-------|---------|
| `esim-finance-revenue.spec.ts` | PASS |
| `esim-finance-revenue.permission.spec.ts` | PASS |
| `finance.service.spec.ts` | PASS |
| `finance.integrity-audit.spec.ts` | PASS (40 tests trong batch gồm RBAC finance) |
| `vat-invoice.engine.spec.ts` | PASS (11) — VAT thẻ game/engine không đổi hành vi eSIM tax |
| admin `esim-finance-ui.test.ts` | PASS |

**Không ghi PASS** cho: Playwright E2E ACCOUNTANT UI full flow; snapshot số VAT retail before/after (VAT code path không import eSIM revenue).

## 8. Giới hạn còn lại (không chặn F1)

- F2/F3 fee gateway thực chưa có.
- Profit kế toán eSIM chưa mở.
- Export raw HTTP vẫn qua JSON envelope (client unwrap OK).

## 9. Kết luận xác minh

Đối chiếu Ops ↔ Finance **khớp tuyệt đối** trên khoảng 08/10–07/11/2026; sandbox tách; SUCCESS không trùng; EXPIRED không vào doanh thu; export + audit có; ACCOUNTANT vào được / không quyền bị từ chối.

**Dừng — chờ PASS chủ dự án. Không mở F2.**
