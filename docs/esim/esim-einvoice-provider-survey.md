# Khảo sát nhà cung cấp hóa đơn điện tử (F5 — research only)

**Trạng thái:** chỉ khảo sát. Không chọn NCC cuối, không tích hợp, không phát hành.  
**Điều kiện mở F5 phát hành:** KEYON phê duyệt chính sách thuế eSIM + chọn NCC.

## Nguyên tắc Cardon (đã chốt)

- Tách **workflow hóa đơn** (nháp / chờ duyệt / phát hành / điều chỉnh / thay thế) khỏi **phát hành thực tế**.  
- Không tự áp VAT 8%/10% cho eSIM.  
- Không mặc định SePay SUCCESS = đủ điều kiện phát hành.  
- Hóa đơn phải gắn audit log; hỗ trợ điều chỉnh/thay thế theo quy định VN.

## Tiêu chí đánh giá NCC

| Tiêu chí | Ý nghĩa |
|----------|---------|
| API REST + sandbox | Tạo/hủy/điều chỉnh HĐ, webhook trạng thái |
| MST / ký số | Hợp lệ với TT78 / nghị định hiện hành |
| Điều chỉnh & thay thế | Bắt buộc cho hoàn/hủy đơn eSIM |
| Chi phí | Setup + phí/hóa đơn + duy trì |
| Đa tiền tệ / ghi chú USD | eSIM có VND + USD — cần làm rõ trên HĐ VND |
| SLA & hỗ trợ | Xuất XML/PDF, tra cứu CQT |

## Ứng viên thường dùng tại VN (tóm tắt thị trường)

| NCC | API / Sandbox | Ghi chú sơ bộ | Cần xác minh trước khi chọn |
|-----|---------------|---------------|------------------------------|
| **Viettel (S-Invoice / Viettel Invoice)** | Có API doanh nghiệp, môi trường test | Phổ biến, hệ sinh thái lớn | Bảng giá 2026, điều chỉnh HĐ, hạn mức |
| **FPT eInvoice** | API + portal | Nhiều SME/fintech | Chi phí/hóa đơn, webhook, sandbox access |
| **VNPT Invoice** | API theo gói VNPT | Phủ rộng tỉnh thành | Tài liệu REST mới nhất, SLA |
| **MISA meInvoice** | API + desktop/web | Kế toán quen MISA | Mapping đơn e-commerce, phí |
| **EasyInvoice / Matbao / các NCC khác** | Tùy vendor | Có thể rẻ hơn | Độ chín API, hỗ trợ thay thế HĐ |

*Bảng trên là định hướng khảo sát, không phải khuyến nghị chốt.*

## Chi phí (cần xin báo giá chính thức)

Hỏi từng NCC:

1. Phí khởi tạo + chữ ký số (nếu tách).  
2. Phí theo số hóa đơn / tháng.  
3. Phí môi trường test.  
4. Phí điều chỉnh / thay thế / hủy.  
5. Chi phí tích hợp hoặc partner.

## Sandbox checklist

- [ ] Tạo hóa đơn nháp → phát hành test MST.  
- [ ] Lấy XML/PDF + mã CQT (nếu có trên sandbox).  
- [ ] Điều chỉnh tăng/giảm; thay thế; hủy.  
- [ ] Idempotent theo `invoiceRef` / orderId.  
- [ ] Webhook hoặc poll trạng thái.

## Thiết kế workflow nội bộ (không phụ thuộc NCC)

```
Order/Payment event (rule do KEYON định)
  → InvoiceIntent (DRAFT)
  → Review (tax policy flags: taxable?, rate?, currency note)
  → IssueJob → ProviderAdapter.issue()
  → ISSUED | FAILED
  → Adjust / Replace / Cancel jobs (audit mỗi bước)
```

`ProviderAdapter`: `issue`, `adjust`, `replace`, `cancel`, `getStatus` — đổi NCC không đổi domain.

## Ràng buộc thuế (chờ KEYON)

- eSIM có thể khác thẻ game về đối tượng chịu thuế / xuất HĐ.  
- USD: quy đổi VND theo tỷ giá nào, ngày nào — **chưa chốt**.  
- Thời điểm phát hành: thanh toán / fulfillment / hoàn tất lắp eSIM — **chưa chốt**.

## Việc tiếp theo (khi mở F5 research sâu)

1. Xin báo giá + tài liệu API 2–3 NCC shortlist.  
2. POC sandbox 1 NCC trên staging (không prod).  
3. KEYON duyệt chính sách → mới wire IssueJob thật.
