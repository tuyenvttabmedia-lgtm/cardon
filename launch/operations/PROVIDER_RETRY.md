# SOP — Provider Retry & Fulfillment Recovery

**Áp dụng:** Support, Admin | **Permission:** `orders.retry`, `providers.manage`

---

## 1. Trạng thái fulfillment

| Status | Ý nghĩa | Retry tự động |
|--------|---------|---------------|
| PENDING | Chưa claim | Worker queue |
| PROCESSING | Đang giao / recovery | Worker retry job |
| COMPLETED | Xong | Không |
| WAITING_ADMIN_RETRY | Provider fail có thể retry | **Admin retry** |
| FAILED | Terminal (hiếm) | Case-by-case |

---

## 2. Admin retry fulfillment

**Điều kiện:**

- `payment_status = PAID` (B2C) hoặc agent order đã HOLD/DEBIT policy
- `fulfillment_status = WAITING_ADMIN_RETRY`
- Permission `orders.retry`

**Thao tác:**

1. Admin → Orders → lọc **Chờ thử lại NCC** (queue)
2. Mở chi tiết đơn — xem failure code (OOS / LOW_BALANCE) + khối **Đối soát thanh toán (MMS)**
3. Nếu nghi tiền chưa về: tra MegaPay MMS (`Merchant trx Id` ≈ `paymentReference` PAY-… + số tiền + Approval)
4. Có thẻ / đã nạp tiền popup → **Thử lại NCC**
5. **Gửi lại email** chỉ khi đơn đã có thẻ

**Sau retry:**

- Monitor đến COMPLETED hoặc fail lại
- Max retry: theo policy nội bộ (khuyến nghị ≤ 3 admin retry / đơn)

---

## 3. Zombie order PROCESSING (không có provider_transaction)

**Triệu chứng:** `fulfillment_status=PROCESSING`, không row `provider_transactions`, worker log lặp.

**Nguyên nhân thường gặp:** thiếu system audit user, lỗi trước khi tạo txn.

**Xử lý (staging/smoke đã có script cleanup):**

1. Xác nhận không có provider txn SUCCESS
2. Ops: reset về PENDING (chỉ qua script approved hoặc runbook DBA)
3. Re-enqueue fulfillment hoặc admin retry

**Production:** escalate Dev — không UPDATE thủ công trừ runbook.

---

## 4. Provider-level actions

| Action | Endpoint / UI | Khi dùng |
|--------|---------------|----------|
| Check balance | `POST /admin/providers/:id/check-balance` | Balance thấp alert |
| Sync products | `POST /admin/providers/:id/sync-products` | SKU mới / mapping lỗi |
| INACTIVE mapping | Admin pricing | SKU eSale ngừng bán |

---

## 5. eSale timeout recovery

Hệ thống tự gọi `checkTransaction` khi buyCard TIMEOUT (xem Provider Core).

Support **không** gọi eSale API trực tiếp — mọi thao tác qua Admin retry.

---

## 6. Escalation provider

| Dấu hiệu | Hành động |
|----------|-----------|
| Cùng SKU fail > 5 đơn / 15 phút | Tạm INACTIVE variant, báo eSale |
| OUT_OF_STOCK liên tục | Sync products, đổi mapping priority |
| Provider balance < threshold | Nạp ví eSale, alert accountant |

*Phase 6C — Operation SOP*
