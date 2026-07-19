# SOP — Agent Support

**Áp dụng:** Support, Admin | **Portal:** `partner.cardon.vn`

---

## 1. Phạm vi hỗ trợ đại lý

| Loại | Ví dụ |
|------|-------|
| KYC | Submit, reject reason, resubmit |
| API | Auth 401/403, signature, rate limit |
| Số dư | Nạp tiền, HOLD không release, ledger không khớp |
| Giao dịch | `request_id` PROCESSING, TIMEOUT, FAILED |
| Giá | agent_price, SKU không mua được |

---

## 2. Onboarding checklist

- [ ] Agent đăng ký → submit KYC documents
- [ ] Admin approve KYC (`agents.kyc.review`) → credentials cấp **một lần**
- [ ] Agent lưu `secret_key` an toàn
- [ ] Credit số dư ban đầu (`agents.credit`) sau hợp đồng
- [ ] Test call `GET /api/partner/v1/balance`
- [ ] Test buy 1 thẻ SKU rẻ

---

## 3. Xử lý ticket thường gặp

### 3.1 INVALID_SIGNATURE

- Verify `request_id` body = header `X-REQUEST-ID`
- Path ký: `api/partner/v1/cards/buy` (không có leading slash trong payload)
- Raw body JSON phải khớp byte-for-byte

### 3.2 INSUFFICIENT_BALANCE

- Kiểm tra `availableBalance` = balance − heldBalance
- HOLD chưa DEBIT: đơn đang PROCESSING → tra `GET /transactions/:request_id`

### 3.3 Transaction PROCESSING lâu

- Agent API fulfill đồng bộ; nếu PROCESSING → provider timeout path
- Hướng dẫn **retry cùng request_id** (idempotent)
- Nếu > 15 phút → escalate Provider Retry SOP

### 3.4 Mất secret key

- **Không** recover secret cũ
- Admin rotate credentials (disable API → regenerate policy)
- Xem `launch/security/API_KEY_ROTATION.md`

### 3.5 KYC rejected

- Gửi lý do từ Admin notes
- Agent sửa hồ sơ → submit lại

---

## 4. Admin tra cứu nhanh

| Thông tin | Nơi xem |
|-----------|---------|
| Agent profile | Admin → Agents |
| Ledger | Admin → Finance → Agent statement |
| Orders agent | Admin → Orders (filter agent) |
| API enabled | Admin → Agents → enable/disable API |

---

## 5. SLA đại lý

| Tier | Phản hồi | Ghi chú |
|------|----------|---------|
| API down (5xx hàng loạt) | 15 phút | P0 |
| Giao dịch đơn lẻ | 4 giờ làm việc | P1 |
| KYC / billing | 1 ngày làm việc | P2 |

---

## 6. Không tiết lộ

- Secret key, ENCRYPTION_KEY, provider credentials
- Card PIN khách cuối của đại lý (chỉ agent tự tra API response)

*Phase 6C — Operation SOP*
