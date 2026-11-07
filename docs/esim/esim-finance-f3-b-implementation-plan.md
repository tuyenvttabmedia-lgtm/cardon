# F3-B — Kế hoạch implementation + cổng chặn CSV thật

**Ngày:** 2026-11-07  
**Trạng thái:** F3-B code đã triển khai local với **header map PROVISIONAL**; CSV KEYON thật vẫn cần để khóa tương thích.  
**F3-A:** PASS. Báo cáo: `esim-finance-f3-report.md`.

Ghi chú: Owner yêu cầu tiếp tục implementation; parser dùng alias theo PayPal Developer docs + fixture unit synthetic (không thay evidence KEYON).

---

## 0. Kết quả bước bắt buộc (gate)

| Kiểm tra | Kết quả |
|----------|---------|
| CSV Activity Download thật trong repo / agent store | **Không có** (chỉ `launch/catalog/catalog-import-template.csv` — không liên quan) |
| Tài liệu giả định cột (F3-A / PayPal Developer docs) | Có — **không đủ** để lock parser |
| Parser CSV | **Chưa triển khai** (đúng gate) |
| Migration / code F3-B | **Chưa** |
| Việc đã làm trong bước này | Audit reuse + kế hoạch + schema đề xuất + checklist mẫu CSV |

**Dừng implementation parser/match/UI upload cho đến khi nhận file CSV thật.**

---

## 1. Audit reuse (Finance / F1 / reconcile / permission / audit)

### 1.1 Có thể tái sử dụng an toàn

| Thành phần | File / pattern | Cách dùng F3-B |
|------------|----------------|----------------|
| F1 revenue API/UI | `GET /admin/finance/esim/revenue`, `FinanceEsimRevenuePanel` | Giữ nguyên; thêm tab/subnav PayPal bên cạnh — **không** đổi công thức doanh thu |
| Finance shell | `FinanceShell`, `/finance/esim` | Sub-view Revenue \| PayPal fee |
| Permissions | `finance.view` / `finance.manage` (ACCOUNTANT) | VIEW: list/detail; MANAGE: upload, rematch, manual resolve |
| Finance audit | `FinanceAuditService` + `FINANCE_AUDIT_ACTIONS` | Thêm action import/match/resolve/export |
| Payment lookup keys | `payments.gatewayTransactionId`, `paymentReference`, `gatewayResponse.captureId` / `paypalOrderId` | Input cho match engine (đã xác minh F3-A) |
| Reconcile status vocabulary | `ReconcileMatchStatus` / `reconcile.engine` labels | **Tham khảo** MATCHED / MISSING_* / AMOUNT_MISMATCH — **không** nhét fee PayPal vào `PaymentReconcileService` hiện tại (JSON body gateway lines ≠ CSV file + fee/net + kind) |
| Integrity pattern | `finance.integrity-audit.spec.ts` | Test: reconcile **không** mutate Payment/Order |
| Export safety | `assertExportCsvSafe` | Export kết quả đối soát |
| Sandbox split F1 | `clientTrace.adminTest` / sandbox | Filter commerce vs sandbox trên queue PayPal |

### 1.2 Không tái sử dụng sai mục đích

| Thành phần | Lý do |
|------------|-------|
| `PaymentReconcileService.reconcile` | Input là mảng transaction JSON; không lưu fileHash/fee actual/kind refund-payout |
| `PaymentGatewayInvoice` | Fee theo kỳ, không per-capture |
| `GatewayFeesService` | Aggregate từ `paymentFeeAmount` estimated |
| `orders.paymentFeeAmount` | Estimated only — **cấm** ghi actual |
| Multer trong finance | **Chưa có** — cần thêm `FileInterceptor` (pattern từ CMS/agent upload) |
| TDR SFTP / PayPal API | Ngoài scope F3-B |

### 1.3 Ranh giới tài chính (nhắc lại — AC cứng)

Không đổi: `Payment.status`, `Order.paymentStatus`, fulfillment, capture/refund API, `paymentFeeAmount`, F1 revenue math.  
Không trộn VND+USD. Payout ≠ revenue. Refund không auto-adjust F1.  
1 payment ↔ tối đa 1 active match. Re-import cùng hash → trả import cũ. Conflict Gross/Fee đã matched → flag review, không silent overwrite.

---

## 2. Schema đề xuất (additive — chưa migrate)

Chỉ thiết kế. Migration chỉ chạy sau khi CSV thật đã validate header map.

```prisma
enum PaypalReportImportSource {
  CSV
  API // future — F3 không dùng
}

enum PaypalReportFormat {
  ACTIVITY_DOWNLOAD
  // TDR reserved — không implement F3-B
}

enum PaypalReportImportStatus {
  PARSED
  MATCHED
  FAILED
}

enum PaypalReportLineKind {
  SALE_CAPTURE
  REFUND
  REVERSAL
  CHARGEBACK
  PAYOUT_OR_BALANCE
  FX
  NON_SETTLED
  OTHER
}

enum PaypalFeeMatchStatus {
  MATCHED
  AMOUNT_MISMATCH
  CURRENCY_MISMATCH
  MISSING_LOCAL
  MISSING_GATEWAY
  DUPLICATE_CSV
  NEEDS_REVIEW          // đã matched trước đó nhưng CSV mới lệch gross/fee
  MANUAL_MATCHED
  NON_SALE              // line không phải sale (informational link)
}

enum PaypalFeeMatchType {
  AUTO
  MANUAL
}

model PaypalReportImport {
  id               String                   @id @default(uuid()) @db.Uuid
  source           PaypalReportImportSource @default(CSV)
  format           PaypalReportFormat       @default(ACTIVITY_DOWNLOAD)
  periodFrom       DateTime?                @map("period_from") @db.Timestamptz(6)
  periodTo         DateTime?                @map("period_to") @db.Timestamptz(6)
  originalFilename String                   @map("original_filename") @db.VarChar(255)
  fileHash         String                   @unique @map("file_hash") @db.VarChar(64) // SHA-256 hex
  storageKey       String?                  @map("storage_key") @db.VarChar(512)
  rowCount         Int                      @default(0) @map("row_count")
  saleCount        Int                      @default(0) @map("sale_count")
  nonSaleCount     Int                      @default(0) @map("non_sale_count")
  status           PaypalReportImportStatus @default(PARSED)
  errorSummary     String?                  @map("error_summary") @db.VarChar(1024)
  headerJson       Json                     @default("[]") @map("header_json") // exact headers from real file
  importedBy       String                   @map("imported_by") @db.Uuid
  createdAt        DateTime                 @default(now()) @map("created_at") @db.Timestamptz(6)

  lines   PaypalReportLine[]
  matches PaypalFeeMatch[]

  @@map("paypal_report_imports")
}

model PaypalReportLine {
  id                String               @id @default(uuid()) @db.Uuid
  importId          String               @map("import_id") @db.Uuid
  kind              PaypalReportLineKind
  paypalTxnId       String               @map("paypal_txn_id") @db.VarChar(64)
  paypalReferenceId String?              @map("paypal_reference_id") @db.VarChar(64)
  customId          String?              @map("custom_id") @db.VarChar(256)
  invoiceId         String?              @map("invoice_id") @db.VarChar(128)
  gross             Decimal              @db.Decimal(18, 2)
  fee               Decimal              @db.Decimal(18, 2) // absolute fee amount
  net               Decimal              @db.Decimal(18, 2)
  currency          String               @db.Char(3)
  txnEventCode      String?              @map("txn_event_code") @db.VarChar(16)
  statusRaw         String?              @map("status_raw") @db.VarChar(64)
  typeRaw           String?              @map("type_raw") @db.VarChar(128)
  balanceImpact     String?              @map("balance_impact") @db.VarChar(32)
  bookedAt          DateTime?            @map("booked_at") @db.Timestamptz(6)
  rawJson           Json                 @default("{}") @map("raw_json")
  createdAt         DateTime             @default(now()) @map("created_at") @db.Timestamptz(6)

  import  PaypalReportImport @relation(...)
  matches PaypalFeeMatch[]

  @@unique([importId, paypalTxnId, kind])
  @@index([paypalTxnId])
  @@index([customId])
  @@map("paypal_report_lines")
}

model PaypalFeeMatch {
  id              String               @id @default(uuid()) @db.Uuid
  paymentId       String?              @map("payment_id") @db.Uuid
  reportLineId    String               @map("report_line_id") @db.Uuid
  importId        String               @map("import_id") @db.Uuid
  matchStatus     PaypalFeeMatchStatus @map("match_status")
  matchType       PaypalFeeMatchType   @default(AUTO) @map("match_type")
  isActive        Boolean              @default(true) @map("is_active")
  grossCardon     Decimal?             @map("gross_cardon") @db.Decimal(18, 2)
  grossPaypal     Decimal              @map("gross_paypal") @db.Decimal(18, 2)
  feeEstimated    Decimal?             @map("fee_estimated") @db.Decimal(18, 2)
  feeActual       Decimal              @map("fee_actual") @db.Decimal(18, 2)
  netPaypal       Decimal              @map("net_paypal") @db.Decimal(18, 2)
  grossDelta      Decimal?             @map("gross_delta") @db.Decimal(18, 2)
  feeDelta        Decimal?             @map("fee_delta") @db.Decimal(18, 2)
  currency        String               @db.Char(3)
  actorId         String?              @map("actor_id") @db.Uuid
  note            String?              @db.VarChar(512)
  createdAt       DateTime             @default(now()) @map("created_at") @db.Timestamptz(6)
  updatedAt       DateTime             @updatedAt @map("updated_at") @db.Timestamptz(6)

  // Partial unique: one active match per payment — enforce in service +
  // CREATE UNIQUE INDEX ... WHERE is_active AND payment_id IS NOT NULL
  @@index([paymentId, isActive])
  @@index([matchStatus])
  @@map("paypal_fee_matches")
}
```

**Ghi chú schema:** `headerJson` bắt buộc lưu header đúng như file KEYON để audit tương thích. Classifier `kind` chỉ finalize sau khi thấy `Type` / `Transaction Event Code` / `Balance Impact` trên file thật.

---

## 3. API / UI đề xuất (sau khi mở gate)

### API

| Method | Path | Perm |
|--------|------|------|
| POST multipart | `/admin/finance/esim/paypal/imports` | manage |
| GET | `/admin/finance/esim/paypal/imports` | view |
| GET | `/admin/finance/esim/paypal/imports/:id` | view |
| POST | `/admin/finance/esim/paypal/imports/:id/match` | manage |
| GET | `/admin/finance/esim/paypal/matches` | view |
| POST | `/admin/finance/esim/paypal/matches/:id/resolve` | manage |
| GET | `/admin/finance/esim/paypal/export` | view |

Audit: `ESIM_PAYPAL_IMPORT_CREATED`, `ESIM_PAYPAL_MATCH_RUN`, `ESIM_PAYPAL_MATCH_RESOLVED`, `ESIM_PAYPAL_RECON_EXPORTED`.

### UI

`/finance/esim` → tabs **Doanh thu** (F1) | **PayPal fee** (F3).  
Panel: upload, import history, summary, match queue, refund/payout queues, estimated vs actual columns.

---

## 4. Cột CSV **yêu cầu KEYON cung cấp** (chưa lock tên exact)

Cho đến khi có file thật, đây là **checklist yêu cầu mẫu** (dựa trên PayPal Activity Download docs + nhu cầu match Cardon) — **không** phải header đã xác minh trong production KEYON:

### Bắt buộc có trên file mẫu

| Mục đích | Cột thường gặp trên Activity Download (docs PayPal) | Cardon dùng để |
|----------|------------------------------------------------------|----------------|
| Capture / txn id | `Transaction ID` | Match P1 ↔ `gatewayTransactionId` |
| Gross | `Gross` | So `payments.amount` |
| Fee thực | `Fee` | Actual fee |
| Net | `Net` | Net PayPal |
| Currency | `Currency` | USD only cho sale eSIM |
| Ngày giờ | `Date`, `Time`, `TimeZone` | `bookedAt` / kỳ đối soát |
| Phân loại | `Type` và/hoặc `Transaction Event Code` | SALE vs refund vs payout |
| Chiều tiền | `Balance Impact` | Credit/Debit — tránh nhầm payout |
| Trạng thái | `Status` | Completed vs Pending/Reversed |

### Rất khuyến nghị (match P2 + refund link)

| Cột docs | Lý do |
|----------|-------|
| `Custom Number` | = `paymentReference` Cardon (`custom_id`) |
| `Reference Txn ID` | Gắn refund/reversal → capture gốc |

### Không dựa làm P1

| Cột | Lý do |
|-----|-------|
| `Invoice Number` / `Invoice Number Text` | Cardon **không** gửi `invoice_id` khi create order |

### Yêu cầu vận hành khi xuất từ PayPal Business

1. Format **CSV** (UTF-8).  
2. Tài khoản đúng môi trường cần đối soát (sandbox vs live — ghi rõ trên file/email).  
3. Khoảng ngày bao phủ ít nhất 2 capture SUCCESS local đã biết (nếu sandbox):  
   - Capture `0EB56821XA562691D` (6.55 USD)  
   - Capture `6GK65584H96475314` (3.96 USD)  
   hoặc tương đương live khi có.  
4. Nếu có: thêm ≥1 dòng **Refund** và ≥1 dòng **Withdrawal/Payout** (để khóa classifier) — optional nhưng rất hữu ích.  
5. **Không** che/redact `Transaction ID` và `Custom Number`.  
6. Gửi nguyên file tải về (có thể zip); giữ nguyên hàng header đầu tiên.

**Nơi đặt file khi có:**  
`docs/esim/fixtures/paypal-activity-download-KEYON-sample.csv`  
(+ ghi chú môi trường / ngày xuất trong `docs/esim/fixtures/README-paypal-activity-csv.md`).

Sau khi nhận file: bước **F3-B0b** = map header thật → cập nhật audit/plan → mới mở parser.

---

## 5. Match engine (thiết kế — implement sau gate)

1. Parse + validate headers against **frozen map từ file KEYON**.  
2. Classify line → `kind`.  
3. Idempotency: `SHA-256(file bytes)` → nếu tồn tại return import cũ.  
4. Duplicate `paypalTxnId` trong file (cùng kind) → `DUPLICATE_CSV`.  
5. Sale lines: P1 capture id → P2 custom id; amount/currency check.  
6. MISSING_GATEWAY cho SUCCESS PayPal eSIM USD trong kỳ không có sale line.  
7. Re-import khác hash nhưng trùng txn đã MATCHED với gross/fee khác → `NEEDS_REVIEW`, giữ match cũ active.  
8. Manual resolve: deactivate old + create MANUAL_MATCHED (1 active/payment).  
9. Zero writes to Payment/Order status/fee.

Pure functions: `classifyPaypalActivityRow`, `matchPaypalFeeLines` — unit-test bằng **fixture từ file KEYON** (không bịa).

---

## 6. Thứ tự implementation khi mở gate

| Bước | Nội dung | Điều kiện |
|------|----------|-----------|
| **F3-B0** | Kế hoạch này + gate CSV | **Done** |
| **F3-B0b** | Nhận CSV KEYON → lock header map + golden fixture | Chờ KEYON |
| **F3-B1** | Migration additive + import API + fileHash + store header/raw | Sau B0b |
| **F3-B2** | Parser + classifier + match engine + tests §authorization.6 | Sau B1 |
| **F3-B3** | UI tabs Revenue / PayPal fee + manual resolve + audit | Sau B2 |
| **F3-B4** | Báo cáo `esim-finance-f3-report.md` + screenshots + dừng PASS | Sau B3 |

**Không** làm F3-B1–B4 trong phiên này.

---

## 7. File dự kiến thay đổi (khi mở gate — chưa tạo)

- `prisma/schema.prisma` + migration `paypal_report_*`
- `src/modules/finance/entities/paypal-fee-*.ts` (parser, classify, match)
- `src/modules/finance/services/paypal-fee-reconcile.service.ts`
- `src/modules/finance/controllers/finance.controller.ts` (+ module/dto/audit)
- `apps/admin/.../FinanceEsimPaypalPanel.tsx`, shell tabs, api-client, types
- `docs/esim/fixtures/paypal-activity-download-KEYON-sample.csv`
- `docs/esim/esim-finance-f3-report.md`

Không đụng: PayPal checkout/webhook, SePay, agent wallet, retail, F1 revenue math.

---

## 8. Preparatory an toàn đã làm / không làm

| Đã làm | Không làm |
|--------|-----------|
| Audit reuse Finance/F1/reconcile/perm/audit | Parser CSV |
| Schema đề xuất trên giấy | Migration |
| Checklist cột + yêu cầu mẫu KEYON | Upload UI / API |
| Kế hoạch phase B0b→B4 | Test giả với CSV bịa như evidence |
| | F4 / TDR / PayPal API |

---

## 9. Điều kiện dừng

F3-B **chưa** implementation.  
**Chặn:** thiếu PayPal Activity Download CSV thật từ KEYON.  

Chủ dự án / KEYON gửi file mẫu → F3-B0b lock header → mới code parser và các bước tiếp theo.  
Không tự chuyển F4.
