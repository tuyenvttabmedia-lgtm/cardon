# SOP — Reconciliation Daily Process

**Áp dụng:** Accountant | **Permission:** `finance.view`, `finance.manage`

---

## 1. Mục tiêu hàng ngày

Đảm bảo khớp số liệu **T+1** (sáng hôm sau cho ngày D):

| Domain | Nguồn A | Nguồn B |
|--------|---------|---------|
| Payment | `payments` SUCCESS | MegaPay / SePay report |
| Provider | `provider_transactions` SUCCESS | eSale statement |
| Agent ledger | `SUM(ledger_entries)` | `agents.balance` |
| Profit | Orders PAID+COMPLETED | Finance profit report |

---

## 2. Lịch (khuyến nghị)

| Giờ | Việc |
|-----|------|
| 08:00 | Export gateway report ngày D-1 |
| 09:00 | Chạy payment reconcile (Admin Finance) |
| 09:30 | Chạy provider reconcile |
| 10:00 | Review mismatch items |
| 10:30 | Agent ledger spot-check (top 5 agents by volume) |
| 11:00 | Gửi báo cáo nội bộ |

---

## 3. Payment reconciliation

**UI:** Admin → Finance → Reconcile → Payment

```
POST /api/v1/admin/finance/reconcile/payment
Body: { "gateway": "SEPAY" | "MEGAPAY", "dateFrom", "dateTo" }
```

**Review report:**

| Status | Hành động |
|--------|-----------|
| MATCHED | OK |
| MISSING_LOCAL | Payment Manual Review SOP |
| MISSING_GATEWAY | `queryTransaction` + chờ settlement |
| AMOUNT_MISMATCH | Freeze auto-settlement, investigate |
| STATUS_MISMATCH | Support + gateway ticket |

**Export CSV:**

```
GET /api/v1/admin/finance/export/reconciliation/:reportId
```

---

## 4. Provider reconciliation

```
POST /api/v1/admin/finance/reconcile/provider
Body: { "providerId", "dateFrom", "dateTo" }
```

- So sánh cost tổng vs eSale invoice
- Lệch > 0.1% doanh thu provider → ticket eSale

---

## 5. Profit sanity check

```
GET /api/v1/admin/finance/profit?dateFrom=&dateTo=
```

- `revenue` ≈ sum order PAID+COMPLETED sell_price
- `grossProfit` = revenue − provider_cost
- So sánh với dashboard admin

---

## 6. Agent ledger check

```
GET /api/v1/admin/finance/agents/:agentId/statement?dateFrom=&dateTo=
```

- Closing balance khớp `agents.balance`
- HOLD/DEBIT/CREDIT có reference_id

---

## 7. Escalation

| Điều kiện | Escalate |
|-----------|----------|
| MISSING_LOCAL > 5 / ngày | CTO + Ops |
| Provider cost lệch > 1M VND | Provider manager |
| Ledger không khớp | Dev + freeze agent credit |

---

## 8. Lưu trữ

- Reconcile reports: giữ theo `docs/DATA_RETENTION_RULES.md`
- Không xóa payment rows — chỉ tạo report

*Phase 6C — Operation SOP*
