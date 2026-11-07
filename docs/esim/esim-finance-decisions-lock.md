# eSIM Finance — Quyết định đã chốt (2026-11-07)

Nguồn:
- Phê duyệt chủ dự án trên `esim-finance-reconciliation-architecture.md`.
- Chốt điều chỉnh F2/F3 sau `esim-finance-f2-visa-design-evaluation.md` (2026-11-07).

## Kiến trúc

- **Phương án C:** Finance shell + lane eSIM song song.
- Không hệ thống Finance riêng.
- Không trộn eSIM vào VAT/Profit VND thẻ game.
- Giữ nguyên: checkout/webhook/IPN, Airalo fulfillment, ví đại lý, snapshot/payment lịch sử.

## Thứ tự phase (đã chốt lại)

| Phase | Nội dung | Trạng thái / ghi chú |
|-------|----------|----------------------|
| **F0** | UX Ops KPI | **PASS** (`esim-finance-f0-report.md`) |
| **F1** | Finance eSIM Revenue | **Xác minh cuối xong — chờ PASS** (`esim-finance-f1-report.md`) |
| **F2-D** | SePay Visa Architecture (design-only) | Được chuẩn bị song song; **không** implementation Visa trước F3 |
| **F3** | PayPal Capture + Fee (CSV-first) | F3-A **PASS**; F3-B implementation local **chờ nghiệm thu** (`esim-finance-f3-report.md`) — header map vẫn provisional đến khi có CSV KEYON |
| **F2-B** | SePay Bank Reconciliation (`BANK_TRANSFER` / VIETQR eSIM ↔ sao kê NH) | **HOÃN, KHÔNG HỦY** — sau F3 |
| **F2-I** | SePay Visa Sandbox → Prod (I1/I2/I3) | Chỉ khi đủ tài liệu SePay + đăng ký KEYON; **sau F3**; chưa mở |
| **F4** | PayPal Balance + Payout ↔ NH | Chưa triển khai |
| **F5** | HĐĐT phát hành | Chỉ sau phê duyệt thuế KEYON; trước đó chỉ khảo sát NCC |

**Thứ tự cứng (implementation):**  
F0 → F1 → **F3** → **F2-B** → **F2-I** (khi đủ điều kiện) → F4 → F5.  
F2-D (design/docs/stub sau duyệt riêng) có thể chạy song song nhưng **không** vượt F3 về thứ tự code Visa.

### Phân tách F2 (không còn một khối «F2 = SePay ↔ NH»)

| Sub-phase | Phạm vi | Được làm gì ngay |
|-----------|---------|------------------|
| **F2-D** | Kiến trúc / schema đề xuất / UI stub `NOT_REGISTERED` (sau duyệt F2-D1) | Design + docs; F2-D2 chờ docs SePay chính thức |
| **F2-B** | Đối chiếu SePay `BANK_TRANSFER` eSIM với sao kê ngân hàng (tiền thực nhận) | Hoãn sau F3; không sửa IPN/HMAC/checkout/ví đại lý |
| **F2-I** | Adapter/IPN/recon Visa sandbox → enable prod | Chưa mở (I1/I2/I3) |

## Thanh toán eSIM & cấu hình dùng chung (bảo toàn)

- eSIM VND **đang** checkout SePay `payment_method=BANK_TRANSFER`, method code **`VIETQR`**. Không đối soát VietQR lúc này = **ưu tiên kế toán**, không phải «không có giao dịch».
- **Không xóa** `VIETQR` hoặc `NAPAS_247` khỏi hệ thống dùng chung.
- `NAPAS_247` hiện tắt: không đưa vào báo cáo eSIM đang chạy; giữ config.
- Default code `fixedFee` VIETQR = **300đ** — không lấy 700đ từ ảnh làm phí hợp đồng/thực tế.
- **Không sửa** SePay checkout/IPN/HMAC, agent wallet, MegaPay live, PaymentService, hoặc PayPal đang hoạt động trong các phase design/hoãn này.

## SePay Visa (F2-D / F2-I)

- Trạng thái mặc định: **`NOT_REGISTERED`**.
- Design-only: không checkout, không gọi API thật, không tạo giao dịch giả, không bật storefront.
- Tái dụng pattern Provider / Webhook / Idempotency / Reconciliation.
- **Không** coi MegaPay `MEGAPAY_VISA` là Visa acquiring thật (hiện map VNPAYQR / payType QR).
- F2-D1 (UI/config stub): chỉ sau duyệt riêng. F2-D2: chờ tài liệu SePay. F2-I*: chưa mở.

## PayPal dữ liệu (F3)

- Giai đoạn đầu: **CSV-first** (Transaction Report chính thức).
- Match Capture ID / Transaction ID ↔ Payment Cardon; Gross / Fee / Net; missing / duplicate / amount-currency mismatch.
- Lưu file nguồn + audit import; estimated fee ≠ actual fee.
- Không double-count payout thành doanh thu (payout thuộc F4).
- Schema/API thiết kế sẵn để bổ sung sync API sau.
- F4: nghiên cứu Balance/Payout API; thiếu thì CSV + sao kê NH.

## Hóa đơn điện tử

- Chưa chốt NCC, chưa auto-issue.
- Khảo sát NCC/API/chi phí/sandbox trước (doc riêng).
- Không mặc định VAT 8%/10% cho eSIM; không lấy SePay SUCCESS làm điều kiện duy nhất xuất HĐ.

## Bổ sung bắt buộc (toàn lộ trình)

- Dashboard Tài chính tổng quan Cardon có thể mở rộng sau, vẫn tách sản phẩm + currency.
- Phân biệt phí ước tính vs phí gateway thực.
- Báo cáo dòng tiền: doanh thu · chờ settlement · số dư PayPal · đã rút · NH nhận · chưa đối soát.
- Lợi nhuận eSIM chỉ khi đủ cost + fee + quy tắc FX kế toán được chốt.
- Mọi thao tác tài chính có audit log.

## Ranh giới kỹ thuật (mọi phase)

- Không tự migration / đổi DB production.
- Không API live / cấu hình production ngoài phạm vi được duyệt.
- Không sửa luồng thanh toán đã nghiệm thu.
- Không tự nhảy phase; mỗi phase có báo cáo + test + AC rồi chờ duyệt.
- Cập nhật tài liệu quyết định/kế hoạch **không** đồng nghĩa mở F3 hoặc F2-D1 code.

## Tham chiếu

- Đánh giá Visa / F2 thu hẹp: `esim-finance-f2-visa-design-evaluation.md`
- Thiết kế kỹ thuật F2/F3: `esim-finance-f2-f3-technical-design.md`
- Kiến trúc tổng: `esim-finance-reconciliation-architecture.md`
