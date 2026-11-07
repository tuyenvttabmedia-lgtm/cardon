# CardOn.vn — Current Architecture Audit

Ngày audit: 2026-10-09.  
Nguồn: source trong repo tại commit `d827fc6` (`fix(admin): filter dates by Vietnam calendar days`).  
Phạm vi: đọc code và Prisma schema. Không deploy, không migrate, không gọi API production, không sửa payment/order.

Working tree còn 2 file web chưa commit (`Header.tsx`, `AuthLayout.tsx`) chỉ đổi kích thước logo. Chúng không nằm trong luồng đơn hàng.

---

## 1. Executive Summary

CardOn là nền tảng bán mã thẻ và nạp cước. Khách chọn một mệnh giá, tạo đơn, thanh toán MegaPay hoặc SePay. Webhook xác nhận tiền xong mới đưa job vào BullMQ. Worker gọi nhà cung cấp eSale để mua thẻ hoặc nạp tiền. PIN được mã hóa AES-256-GCM trước khi lưu.

Không có giỏ hàng, không có tồn kho mã thẻ, không có coupon, không có ví khách lẻ. Ví và sổ quỹ chỉ dành cho đại lý.

Điểm nối an toàn nhất cho Travel eSIM sau này là nhánh dispatch sau khi đơn đã `PAID`: hiện chỉ enqueue `provider_queue` (thẻ) hoặc `topup_queue` (nạp cước/data). eSIM cần queue và bảng giao hàng riêng. Không nhét ICCID/QR vào `card_records`, và không gọi Airalo từ `ESaleProvider`.

---

## 2. Tech Stack

| Hạng mục | Giá trị trong repo |
|---|---|
| Backend framework | NestJS 11 (`@nestjs/common` `^11.0.12`, `@nestjs/core` `^11.0.12`) |
| Frontend / Admin / Partner | Next.js `^15.2.4` (apps `web`, `admin`, `partner`) |
| React | `^19.0.0` |
| TypeScript | `^5.8.2` |
| Prisma | `prisma` và `@prisma/client` `^6.9.0` |
| PostgreSQL | image `postgres:16-alpine` (local-full và production compose) |
| Redis | image `redis:7-alpine`; client `ioredis` `^5.6.0` |
| BullMQ | `bullmq` `^5.44.0`, `@nestjs/bullmq` `^11.0.2` |
| Docker | `docker-compose.local-full.yml`, `docker-compose.production.yml`, `docker/Dockerfile.frontend` |
| Storage | Đĩa local `uploads/`, Express `express.static` tại `/uploads`. Không có S3 trong code. |
| Email | Nodemailer SMTP (`nodemailer` `^6.10.1`). Fallback `MockEmailProvider` khi không có SMTP. Telegram là kênh alert, không phải email. |
| Payment | `MEGAPAY`, `SEPAY` (`PaymentGatewayCode`). PayOS chỉ là nhãn trong `payment-gateway.strategy.ts`, không có provider class. |
| Authentication | JWT (`@nestjs/jwt`, `passport-jwt`) + refresh token. Mật khẩu bcrypt (`bcryptjs`). |
| Cron / scheduler | `ScheduleModule` / `@Cron`: **NOT FOUND**. Dùng `setInterval` trong service. |
| Worker | Process riêng `src/worker.ts`, `APP_ROLE=worker`. |
| Webhook | `POST /api/v1/payments/webhook/:gateway`. Log bảng `webhook_logs`. |
| API | NestJS, prefix mặc định `api/v1`. Controller → Service → Repository. |
| Admin | Next.js app `apps/admin`, gọi API admin có RBAC. |
| Frontend khách | Next.js app `apps/web`, Tailwind. Checkout không qua giỏ hàng. |

---

## 3. Source Structure

```
apps/web/          Next.js khách (checkout, tài khoản, CMS public)
apps/admin/        Next.js admin
apps/partner/      Next.js cổng đại lý
packages/          build-info, cms-typography
prisma/            schema.prisma, migrations, seed.mjs
src/main.ts        HTTP API
src/worker.ts      Worker process
src/queue/         BullMQ registry
src/modules/       Nghiệp vụ backend
docker/            Dockerfile frontend
docs/              Tài liệu
```

| Việc | Module |
|---|---|
| Product | `src/modules/product` |
| Order | `src/modules/order` |
| Payment | `src/modules/payment` |
| Fulfillment | `src/modules/provider` (`FulfillmentDispatchService`, `ProviderService`, `TopupService`) |
| Email | `src/modules/notification` + `src/modules/email-template` |
| Inventory | **NOT FOUND** |
| Admin | `src/modules/admin` + `apps/admin` |
| User / account | `src/modules/auth` (`AuthController`, `AccountController`) |
| Authentication | `src/modules/auth` (`JwtStrategy`, `JwtAuthGuard`, `OptionalJwtAuthGuard`) |
| Supplier | `src/modules/provider/adapters` |
| CMS / media | `src/modules/cms` |
| Finance / VAT | `src/modules/finance` |
| Agent wallet | `src/modules/agent`, `src/modules/agent-platform` |

---

## 4. Database

Schema: `prisma/schema.prisma`. PostgreSQL. Thời gian `Timestamptz(6)`.

### Trạng thái lấy đúng từ enum

**Order payment** (`OrderPaymentStatus` trên `orders.payment_status`):

`WAITING_PAYMENT` → `PAID` | `FAILED` | `EXPIRED` | `REFUNDED`

**Payment record** (`PaymentRecordStatus` trên `payments.status`):

`PENDING` → `SUCCESS` | `FAILED` | `EXPIRED`

**Fulfillment** (`FulfillmentStatus` trên `orders.fulfillment_status`):

`PENDING` → `PROCESSING` → `COMPLETED` | `FAILED` | `WAITING_ADMIN_RETRY` | `NEED_MANUAL_REVIEW`

**Order item** (`OrderItemStatus`): `PENDING` | `PROCESSING` | `COMPLETED` | `FAILED` | `PARTIAL`

**Card** (`CardRecordStatus`): `PENDING` | `DELIVERED` | `FAILED`

**Topup** (`TopupTransactionStatus`): `PENDING` | `SUCCESS` | `FAILED`

**Provider attempt** (`ProviderTransactionStatus`): `PENDING` | `PROCESSING` | `SUCCESS` | `FAILED` | `TIMEOUT`

**Inventory status:** **NOT FOUND**. Gần nhất là `ProviderProductAvailability`: `AVAILABLE` | `OUT_OF_STOCK` | `MAINTENANCE` trên mapping nhà cung cấp, không phải số lượng tồn kho.

**Coupon:** **NOT FOUND**.

**PaymentTransaction:** **NOT FOUND** như một model. Bản ghi tiền khách là `Payment`. Header nghiệp vụ là `FinancialTransaction` (bảng `transactions`). Lần gọi nhà cung cấp là `ProviderTransaction`.

**Fulfillment table:** **NOT FOUND**. Trạng thái nằm trên `orders` và `order_items`.

**Wallet khách:** **NOT FOUND**. Ví đại lý là `agents.balance` / `agents.held_balance` cộng `ledger_entries`.

### User (`users`)

| Field | Type | Ghi chú |
|---|---|---|
| id | UUID PK | |
| username | varchar 32, unique, null | |
| fullName | varchar 128, null | |
| email | varchar 255, unique | |
| phone | varchar 32, null | |
| identityNumberEnc | varchar 512, null | số giấy tờ đã mã hóa |
| passwordHash | varchar 255 | bcrypt |
| role | `UserRole` | `CUSTOMER` `AGENT` `SUPPORT` `MARKETING` `ACCOUNTANT` `ADMIN` `SUPER_ADMIN` |
| status | `UserStatus` | `ACTIVE` `SUSPENDED` `BANNED` |
| emailVerifiedAt, acceptedTermsAt, lastLoginAt | timestamptz, null | |
| createdAt, updatedAt, deletedAt | timestamptz | soft delete |

Quan hệ: orders, agent, refresh tokens, audit logs, CMS pages. Index: `deletedAt`.

### ProductCategory (`product_categories`)

`id`, `slug` unique, `name`, `homeService` (`GAME_CARD` `PHONE_CARD` `TOPUP` `DATA`), `iconUrl`, `parentId` FK self (SetNull), `sortOrder`, `status` (`ACTIVE` `INACTIVE`), `createdAt`, `updatedAt`.  
Index: `parentId`, `homeService`. Không có `deletedAt`.

### Product (`products`)

`id`, `categoryId` FK Restrict, `homeService`, `slug` unique, `name`, `description`, `logoUrl`, `bannerUrl`, `sortOrder`, `status` (`ACTIVE` `INACTIVE`), `createdAt`, `updatedAt`, `deletedAt`.  
Index: `categoryId`, `homeService`, `deletedAt`, `(sortOrder, createdAt)`.  
Không có supplier SKU, không có giá, không có tồn kho.

### ProductVariant (`product_variants`)

`id`, `productId` FK Cascade, `sku` unique (SKU CardOn), `name`, `type` (`CARD` `TOPUP` `DATA` `SOFTWARE`), `faceValue` decimal, `sellPrice` decimal, `status` (`ACTIVE` `INACTIVE`), `metadata` json, `createdAt`, `updatedAt`, `deletedAt`.  
Index: `productId`, `sku`, `deletedAt`.  
`sku` không phải mã nhà cung cấp.

### ProviderProductMapping (`provider_product_mappings`)

`id`, `providerId` FK Cascade, `productVariantId` FK Cascade, `providerProductCode` (SKU nhà cung cấp), `providerCost` decimal, `priority`, `healthScore`, `status` (`ACTIVE` `INACTIVE`), `availability` (`AVAILABLE` `OUT_OF_STOCK` `MAINTENANCE`), `createdAt`, `updatedAt`.  
Index: `productVariantId`. **Không có unique** `(providerId, productVariantId)`.

### Provider (`providers`) — supplier

`id`, `code` unique, `name`, `apiCredentials` text (encrypted), `balance`, `lastBalanceSyncedAt`, `lastProductSyncedAt`, `status` (`ACTIVE` `INACTIVE` `DEGRADED`), `createdAt`, `updatedAt`, `deletedAt`.

### Order (`orders`)

`id`, `orderCode` unique, `transactionId` FK `transactions`, `userId` FK SetNull, `agentId` FK, `agentRequestId`, `channel` (`B2C` `AGENT`), `guestEmail`, `guestPhone`, `isGuestOrder`, `invoiceRequired`, `invoiceMetadata` json, `customerNote`, `clientTrace` json, `totalAmount`, `faceValue`, `sellAmount`, `discountAmount`, `paymentMethodCode`, `methodDisplayName`, `paymentGateway`, `settlementType` (`DIRECT_TO_MERCHANT` `GATEWAY_SETTLEMENT`), phí cổng, `customerPaid`, `providerCost`, `profit`, `paymentStatus`, `fulfillmentStatus`, `paymentId` unique FK payment đang active, `paymentExpiresAt`, `createdAt`, `updatedAt`, `deletedAt`.  
Unique: `(agentId, agentRequestId)`, `orderCode`, `paymentId`.  
Index: `paymentStatus`, `fulfillmentStatus`, `guestEmail`, `paymentExpiresAt`, `paymentMethodCode`, `paymentGateway`, `settlementType`, `deletedAt`.

### OrderItem (`order_items`)

`id`, `orderId` FK Restrict, `variantId` FK Restrict, `quantity`, `unitPrice`, `discount`, `totalAmount`, `status`, `createdAt`.  
**Không có `updatedAt`.** Index: `orderId`, `variantId`.

### Payment (`payments`)

`id`, `orderId` FK Restrict, `gateway` (`MEGAPAY` `SEPAY`), `methodCode`, `settlementType`, `paymentReference` unique, `idempotencyKey` unique null, `amount`, `status`, `gatewayTransactionId`, `bankTransactionId`, `bankReference`, `settlementDate`, `reconciliationStatus` (`PENDING` `MATCHED` `DIFFERENCE` `MANUAL_REVIEW`), `gatewayResponse` json, `paidAt`, `expiresAt`, `createdAt`, `updatedAt`, `deletedAt`.

### FinancialTransaction (`transactions`)

`id`, `transactionId` unique, `agentId` null cho B2C, `type` (`AGENT_ORDER` `B2C_CHECKOUT` `ADMIN_TOPUP`), `amount`, `status` (`PENDING` `HOLD` `COMPLETED` `RELEASED` `FAILED`), `createdAt`, `updatedAt`, `deletedAt`.

### CardRecord (`card_records`) — giao thẻ

`id`, `orderItemId` FK, `encryptedSerial`, `encryptedPin`, `providerResponse` json, `status`, `firstViewedAt`, `viewCount`, `pinFirstViewedAt`, `pinViewCount`, `createdAt`. Không có `updatedAt`.

### TopupTransaction (`topup_transactions`)

`id`, `orderId`, `orderItemId`, `phoneNumber`, `telco`, `amount`, `providerReference`, `status`, `resultMessage`, `createdAt`, `updatedAt`.

### ProviderTransaction (`provider_transactions`)

Một lần gọi nhà cung cấp. `requestId` unique, `providerTransactionId` unique null, `action` (`BUY_CARD` `TOPUP` `CHECK`), `attempt`, payload, `status`, `errorCode`, `completedAt`, `createdAt`, `updatedAt`, `deletedAt`.  
Timeout không được tạo attempt mới bằng cách gọi `buyCard` lại; recovery đi qua `CHECK`.

### LedgerEntry (`ledger_entries`)

Chỉ đại lý. `type` (`CREDIT` `DEBIT` `HOLD` `RELEASE`). Append-only theo comment schema. Có `createdAt`. `updatedAt` default now, không `@updatedAt`.

### Notification (`notifications`)

In-app. `recipientType` (`USER` `AGENT` `ADMIN_ROLE`), `type`, `title`, `body`, `readAt`, `createdAt`. Không có `updatedAt`.

### EmailTemplate (`email_templates`)

`code` unique, `name`, `subject`, `htmlBody`, `textBody`, `variables` json, `isActive`, `createdAt`, `updatedAt`.

### AuditLog (`audit_logs`)

`adminId` FK, `action`, `targetType` (`ORDER` `AGENT` `PRODUCT` `USER` `INVOICE` `PAYMENT`), `targetId`, `metadata`, `ipAddress`, `createdAt`. Không có `updatedAt`.

### SystemAuditLog (`system_audit_logs`)

Cấu hình hệ thống (SMTP, payment gateway, CMS, …). `action` gồm `CREATE` `UPDATE` `DELETE` `SYNC` `APPROVE` `REJECT` …

### WebhookLog (`webhook_logs`)

`source` (`MEGAPAY` `SEPAY` `PROVIDER` `PARTNER` `INTERNAL`), `paymentReference`, `payload`, `signatureValid`, `processed`, `retryCount`, `createdAt`.

---

## 5. Product Architecture

Cây: `ProductCategory` → `Product` → `ProductVariant` → `ProviderProductMapping`.

| Câu hỏi | Kết luận từ code |
|---|---|
| Product có supplier SKU? | Không |
| Variant có supplier SKU? | Không. `product_variants.sku` là SKU nội bộ |
| Supplier SKU nằm ở đâu? | `provider_product_mappings.provider_product_code` |
| Giá bán | `product_variants.sell_price`. Giá đại lý riêng: `agent_product_prices` |
| Giá vốn | `provider_product_mappings.provider_cost`. Lịch sử: `provider_cost_histories` |
| Sync catalogue | Có method `ProviderInterface.syncProducts()`. Gọi từ admin (`AdminProviderService.syncProducts`, `SettingsAdminService`). **Không có cron sync sản phẩm.** Cron 5 phút chỉ sync số dư (`ProviderBalanceCronService`) |
| Tồn kho | Không đếm serial trong kho. Hết hàng là cờ `availability` hoặc lỗi provider `OUT_OF_STOCK` lúc mua |

`HomeServiceType` chỉ có `GAME_CARD`, `PHONE_CARD`, `TOPUP`, `DATA`. Không có eSIM.

---

## 6. Order Flow

Không có cart. Một lần thanh toán = một `POST /orders` với một hoặc nhiều `variantId`, rồi `POST /payments`.

```
Customer
  ↓  apps/web Home / product page, chọn variant + quantity
Frontend CheckoutShell.pay()
  ↓  CARD: orderApi.create({ items, paymentMethodCode })
  ↓  TOPUP/DATA: thêm guestPhone + customerNote, quantity = 1
API POST /api/v1/orders
  ↓  OrderController.createOrder
  ↓  OrderService.createOrder
  ↓  PricingService + ProviderMappingRepository (giá vốn)
  ↓  DB: transactions + orders + order_items
  ↓  paymentStatus = WAITING_PAYMENT, fulfillmentStatus = PENDING
API POST /api/v1/payments  (header Idempotency-Key)
  ↓  PaymentService.createPayment
  ↓  MegaPayProvider hoặc SePayProvider.createPayment
  ↓  DB: payments PENDING, orders.payment_id
Frontend hiện QR / form
  ↓
Webhook POST /api/v1/payments/webhook/:gateway
  ↓  verifyWebhook
  ↓  processSuccessWebhookAtomically: payments SUCCESS, orders PAID
  ↓  FulfillmentDispatchService.dispatchOrderFulfillment
  ↓  CARD → provider_queue / TOPUP|DATA → topup_queue
Worker
  ↓  ProviderWorker → ProviderService.fulfillOrder → ProviderInterface.buyCard
  ↓  hoặc TopupWorker → TopupService.fulfillOrder → ProviderInterface.topup
  ↓  CardRecord (PIN mã hóa) hoặc TopupTransaction
  ↓  NotificationService → notification_queue → SMTP
Customer xem mã tại /orders/:id hoặc /tai-khoan/the-da-mua
```

| Bước | File | Function | API | DB | Queue |
|---|---|---|---|---|---|
| Chọn SP / mệnh giá | `apps/web/components/checkout/CheckoutShell.tsx` | `pay` | — | — | — |
| Tạo đơn | `src/modules/order/services/order.service.ts` | `createOrder` | `POST /api/v1/orders` | `transactions`, `orders`, `order_items` | — |
| Tạo thanh toán | `src/modules/payment/services/payment.service.ts` | `createPayment` | `POST /api/v1/payments` | `payments` | — |
| Webhook thành công | cùng file | `handleWebhook` → `processSuccessWebhookAtomically` | `POST /api/v1/payments/webhook/:gateway` | `payments`, `orders`, `webhook_logs` | — |
| Đưa vào hàng đợi | `fulfillment-dispatch.service.ts` | `dispatchOrderFulfillment` | — | đọc order items | `provider_queue` hoặc `topup_queue` |
| Giao thẻ | `provider.service.ts` | `fulfillOrder` | — | `provider_transactions`, `card_records` | `provider_queue` |
| Gửi mail | `notification.service.ts` | `notifyPaymentSuccess`, `notifyCardDelivery` | — | `notifications` khi kênh system | `notification_queue` |

Đơn guest bắt buộc `guestEmail` ở API. UI checkout hiện yêu cầu đăng nhập trước khi `pay()` (`CheckoutShell`).

---

## 7. Payment Flow

Provider đăng ký: `MegaPayProvider`, `SePayProvider`. Mock chỉ dùng test (`mock-payment.providers.ts`).

| | MegaPay | SePay |
|---|---|---|
| Create | `MegaPayProvider.createPayment` — URL/form hoặc VA | `SePayProvider.createPayment` — QR/form. Mã `payment_reference` riêng (`generateSepayPaymentCode`) |
| QR / URL | `paymentUrl`, `checkoutUrl`, `checkoutFormFields`, `bankInfo` trong `gatewayResponse` | cùng shape |
| Webhook | `verifyWebhook` trên `POST /payments/webhook/megapay` | `verifyWebhook`: IPN cổng hoặc chuyển khoản legacy. Chữ ký qua `verifySepayWebhookAuth` (API key / webhook secret / IPN secret — giá trị nằm ở env, không ghi ở đây) |
| Lookup | `queryTransaction` / `checkStatusByMapId`. VA không tự coi là đã thu | `queryTransaction` trả `PENDING` (lookup chưa chốt trạng thái) |
| Idempotency | Header `Idempotency-Key` unique trên `payments.idempotency_key`. Webhook trùng `paymentReference` hoặc `gatewayTransactionId` trả `duplicate: true` | giống |
| Failover | MegaPay lỗi tạo phiên và còn bật dự phòng → tạo lại bằng SePay `VIETQR` | — |
| Retry webhook | Claim `PENDING` → `SUCCESS` trong transaction. Claim thất bại = đã xử lý | giống |
| Failure | `payments FAILED`, `orders.payment_status FAILED` | giống |
| Refund | MegaPay có nhánh refund nếu có `MEGAPAY_PG_REFUND_PASSWORD`. VA (mã nộp tiền) không hoàn theo code. SePay: `refund()` trả `"SePay refund not implemented"` | |
| Timeout | `ExpirationCronService` mỗi 60s. Đơn quá `paymentExpiresAt` → `EXPIRED`. Webhook success đến muộn → `manualReview`, không tự giao hàng | |

`payment_queue` được đăng ký BullMQ nhưng `workerCount: 0`. Hết hạn không đi qua queue đó.

State machine thực tế (hai cột, không gộp một enum):

```
orders.payment_status          payments.status
WAITING_PAYMENT                PENDING
        │ webhook success            │
        ▼                            ▼
       PAID                        SUCCESS
        │ webhook fail               │
        ▼                            ▼
      FAILED                        FAILED
        │ sweep quá hạn              │
        ▼                            ▼
     EXPIRED                       EXPIRED

REFUNDED có trong enum OrderPaymentStatus.
Đường tự động REFUNDED trong webhook handler: NOT FOUND trong đoạn success/fail đã đọc.
```

Webhook không gọi nhà cung cấp trong request HTTP. Gọi nằm ở worker sau commit.

---

## 8. Fulfillment Flow

Bất đồng bộ. Trigger: `PaymentService.handleWebhook` sau commit, và `approveManualReview`, gọi `FulfillmentDispatchService.dispatchOrderFulfillment(orderId, 'webhook' | 'manual' | 'agent')`.

| | Thẻ (`CARD`) | Nạp cước / data (`TOPUP`, `DATA`) |
|---|---|---|
| Queue | `provider_queue` | `topup_queue` |
| Worker | `ProviderWorker.process` | `TopupWorker.process` |
| Service | `ProviderService.fulfillOrder` | `TopupService.fulfillOrder` |
| Supplier call | `buyCard` | `topup` |
| Kết quả | `card_records` PIN mã hóa | `topup_transactions` |
| Retry BullMQ | 5 attempts. Delay 30s, 60s, 5 phút, 15 phút (`PROVIDER_RETRY_DELAYS_MS` + 1) | Default queue: 3 attempts, exponential 5s. Check topup thêm delay ≥ 5 phút |
| Concurrency | 1 | 1 |
| Dead letter queue tên riêng | **NOT FOUND**. Job fail giữ 7 ngày hoặc tối đa 5000 (`removeOnFail`) | giống |
| Idempotency | `request_id` unique. Đã có `card_records` thì trả `COMPLETED`, không mua lại | `request_id` unique. Timeout → `checkTransaction`, không `topup` lại |
| Hết nhà cung cấp / bảo trì | `WAITING_ADMIN_RETRY` | cùng kiểu failure rules |
| Admin retry | `retryOrderFulfillment` | nếu item là topup thì đi `TopupService.retryFulfillment` |

`ProviderService` chỉ xử lý item `CARD`. Nhiều item CARD trong một đơn: code log cảnh báo và chỉ xử lý item đầu.

`SOFTWARE` không được dispatch. Log: `no fulfillable CARD/TOPUP items`.

---

## 9. Supplier Architecture

```
ProviderInterface
├── ESaleProvider          code ESALE   (production adapter)
├── MockESaleProvider      khi ESALE_USE_MOCK
└── MockIMediaProvider     code IMEDIA  (mock, không có HTTP iMedia trong adapter này)
```

`ProviderRegistryService` chọn adapter theo `code`.

| | eSale | iMedia |
|---|---|---|
| API | `EsaleHttpClient` + `EsaleCardAdapter` + `EsaleTopupAdapter`. URL từ env `ESALE_API_URL_CARD` / `ESALE_API_URL_TOPUP` | **NOT FOUND** HTTP client. Chỉ `MockIMediaProvider` |
| Auth | `EsaleConfigService` đọc env (`ESALE_AGENCY_CODE`, `ESALE_SECRET_KEY`, `ESALE_PRIVATE_KEY`, …). Không in giá trị | mock |
| Balance | `getBalance` + cron 5 phút | mock |
| Product sync | `syncProducts` khi admin bấm | mock |
| Order / fulfill | `buyCard`, `topup` | mock |
| Status | `checkTransaction` | mock |
| Webhook supplier | `WebhookSource.PROVIDER` có trong enum. Handler nhà cung cấp đẩy fulfillment: **NOT FOUND** trong payment webhook. Fulfillment do CardOn kéo (worker), không đợi webhook eSale để giao hàng | |
| Retry | queue như mục 8. Topup mã đang xử lý được map `isEsaleTopupProcessingRetCode` | |
| Error map | `OUT_OF_STOCK`, `LOW_BALANCE`, `MAINTENANCE`, `TIMEOUT`, `UNKNOWN`, `INVALID_SKU` | |

Local compose ép `ESALE_USE_MOCK=true`. Production compose không set mock trong file đã đọc; API production chạy `ESALE_USE_MOCK=false` (đã kiểm tra process env trước đó, không in secret).

---

## 10. Queue / Worker

Đăng ký trong `src/queue/queue.constants.ts`:

| Queue | Worker | Việc |
|---|---|---|
| `provider_queue` | `ProviderWorker` | Giao thẻ |
| `topup_queue` | `TopupWorker` | Nạp cước và data |
| `notification_queue` | `NotificationWorker` | Email, in-app, Telegram |
| `webhook_delivery_queue` | `WebhookDeliveryWorker` | Webhook ra phía đại lý |
| `content_automation_queue` | `ContentAutomationWorker` | Viết bài CMS |
| `payment_queue` | **không có processor** | Đăng ký sẵn. Hết hạn thanh toán không dùng queue này |
| `email_queue` | **không có processor** | Mail đi qua `notification_queue` |
| `reconciliation_queue` | **không có processor** | Đối soát dùng `setInterval`, không queue này |

Heartbeat worker: Redis key `cardon:worker:heartbeat`, mỗi 30s, TTL 90s (`WorkerHeartbeatService`).

Scheduler thực tế:

| Việc | Chu kỳ | Chạy ở |
|---|---|---|
| Hết hạn thanh toán | 60s | `ExpirationCronService` trong `PaymentModule` — module được import cả API và worker |
| Số dư nhà cung cấp | 5 phút | `ProviderBalanceCronService` trong `ProviderModule` — cũng có ở cả API và worker |
| Đơn đã trả tiền nhưng chưa giao | 5 phút | `PaidOrderWatchdogCronService` — module chỉ gắn `worker.module.ts` |
| Đối soát doanh thu | hằng ngày | `OrderRevenueReconcileCronService` |
| Đối soát provider | hằng ngày | `provider-daily-reconciliation.service.ts` |
| CMS publish hẹn giờ | interval | `CmsScheduledPublishCronService` |
| Health | 03:00 | `SystemHealthCronService` |

Queue tái sử dụng cho eSIM: **không reuse `provider_queue`**. Tạo `esim_queue` riêng, cùng kiểu producer/worker. `notification_queue` reuse được cho email giao eSIM.

---

## 11. Admin

App: `apps/admin`. API nằm dưới các controller admin có permission.

| Màn | Đường dẫn app | Làm được gì |
|---|---|---|
| Product | `/products` | Danh mục bán, biến thể, giá bán |
| Category | `/marketing/categories` | Category CMS bài viết, không phải `product_categories` bán hàng |
| Supplier | `/providers`, `/providers/[id]`, `/configuration/providers` | Xem provider, sync sản phẩm, số dư, bảo trì |
| Order | `/orders`, `/orders/[id]`, `/orders/agent` | Xem, lọc, retry giao hàng, xem PIN có audit |
| Payment | `/payments`, `/finance/payments`, `/configuration/payment` | Giao dịch, duyệt manual review, cấu hình cổng |
| Fulfillment | trong order + `/operations/manual`, `/operations/exceptions` | Đơn kẹt `WAITING_ADMIN_RETRY` |
| Customer | `/customers` | Hồ sơ khách |
| Inventory | **NOT FOUND** | |
| Pricing | `/agents/margin-config`, `/finance/*` | Biên đại lý, VAT, phí cổng |
| Audit | `/configuration/audit`, `/monitoring/activity` | `audit_logs`, activity |
| Email | `/marketing/email-templates`, `/configuration/smtp` | Template DB, SMTP |
| SEO | `/marketing/seo`, `/marketing/pages` | CMS |
| Media | `/marketing/media`, `/marketing/banners` | Upload local |

Nhân sự kế toán không có `admin.dashboard`; menu tài chính / đơn / thanh toán / đại lý theo allowlist đã có trong code admin.

---

## 12. Customer Account

API `AccountController` (`src/modules/auth/controllers/account.controller.ts`):

| Dữ liệu | API | Trang |
|---|---|---|
| Profile | `GET /account/profile` | `/tai-khoan` |
| Đổi mật khẩu | `POST /account/change-password` | `/tai-khoan/doi-mat-khau` |
| Lịch sử đơn | `GET /account/orders` và `GET /orders` (JWT) | `/tai-khoan/lich-su-giao-dich` |
| Thẻ đã mua | `GET /account/cards`, `GET /orders/:id/cards`, reveal PIN | `/tai-khoan/the-da-mua` |
| Nạp cước | `GET /account/topups` | `/tai-khoan/nap-cuoc` |
| Data | `GET /account/data` | `/tai-khoan/nap-data` |
| Payment history riêng | **NOT FOUND** như một trang. Tiền nằm trong đơn | |
| Wallet | **NOT FOUND** cho khách lẻ | |
| Email | email trên `users.email` | |
| Notification | `GET /account/notifications` | chuông trên header |
| Hỗ trợ | ticket | `/tai-khoan/ho-tro` |

Chỗ thêm **My eSIM** sau này: cùng kiểu `/tai-khoan/esim` và `GET /account/esims`, cạnh thẻ đã mua. Không trộn vào `card_records` vì dữ liệu giao là ICCID/QR, không phải PIN.

---

## 13. Email

| | |
|---|---|
| Provider | SMTP Nodemailer khi settings hoặc `SMTP_HOST` có giá trị. Không có thì `MockEmailProvider` |
| Template | Ưu tiên bản trong bảng `email_templates` (`EmailTemplateService.render`). Không có thì fallback cứng `renderEmailTemplate` trong `template.registry.ts` |
| Queue | `notification_queue`, không phải `email_queue` |
| Retry | 3 lần, exponential 5 giây |
| Sau thanh toán | `notifyPaymentSuccess` → template `PAYMENT_SUCCESS` và `ORDER_SUCCESS` |
| Giao thẻ | `notifyCardDelivery` → `CARD_DELIVERED` (alias DB `CARD_DELIVERY`) |
| Nạp / data | `TOPUP_SUCCESS` / `DATA_SUCCESS` |

Template code hiện có: `USER_REGISTER`, `PASSWORD_RESET`, `ORDER_SUCCESS`, `CARD_DELIVERY`, `CARD_DELIVERED`, `TOPUP_SUCCESS`, `DATA_SUCCESS`, `PAYMENT_SUCCESS`, các mail đại lý và `PROVIDER_LOW_BALANCE`, `CONTACT_FORM`.

Cách thêm template mới: thêm code vào `EMAIL_TEMPLATE`, nhánh render fallback, và một hàng `email_templates` (admin `/marketing/email-templates`) để production dùng HTML trong DB.

---

## 14. Security

| Hạng mục | Cách làm | Secret |
|---|---|---|
| API khách | `JwtAuthGuard`. Tạo đơn: `OptionalJwtAuthGuard` | `JWT_SECRET` trong env. `API_KEY_PRESENT` của JWT: true nếu env được set lúc chạy |
| API đại lý | API key bcrypt (`api_key_hash`). Secret webhook mã hóa | không in |
| Webhook thanh toán | `verifyWebhook` trước khi đổi trạng thái. Sai chữ ký → 401 | `API_KEY_LOCATION=.env` và/hoặc `payment_gateways.config_encrypted` |
| Rate limit | `@nestjs/throttler` | |
| Admin | RBAC `permissions` + `role_permissions` | |
| Khách | Chỉ đơn của `userId`. Reveal PIN có log `card_access_logs` khi admin xem | |
| PIN / serial | AES-256-GCM, key từ `ENCRYPTION_KEY` | `API_KEY_LOCATION=.env` tên `ENCRYPTION_KEY` |
| Credential nhà cung cấp | cột `providers.api_credentials` encrypted | |
| PII | email, phone, `identity_number_enc`. Log email đi qua `sanitizeNotificationLogContext` | |
| Helmet | bật. CSP chỉ khi `app.env === production` | |

Không ghi giá trị key, mật khẩu, hay token.

---

## 15. Local Development

Stack đang dùng: `docker-compose.local-full.yml` + `.env.local-full`.

```
docker compose -f docker-compose.local-full.yml --env-file .env.local-full up -d
```

| | |
|---|---|
| Web | http://localhost |
| Admin | http://admin.localhost |
| Partner | http://partner.localhost |
| Postgres | container `cardon-local-full-postgres`, host port **5433** |
| Redis | `cardon-local-full-redis`, không publish port ra host trong đoạn compose đã đọc |
| API | `cardon-local-full-api` |
| Worker | `cardon-local-full-worker` |
| Migrate | `RUN_MIGRATIONS=true` → entrypoint `prisma migrate deploy` |
| Seed | `npm run prisma:seed` (`prisma/seed.mjs`). File env local hiện `RUN_SEED=false` để không ghi đè DB đã copy |
| eSale | `ESALE_USE_MOCK=true` trong compose |
| App env | `APP_ENV=staging` |
| Tài khoản admin seed | biến `SEED_SUPER_ADMIN_EMAIL` / `SEED_SUPER_ADMIN_PASSWORD` trong env. Lệnh `npm run reset:local-admin`. Không ghi mật khẩu vào tài liệu này |
| Dev không Docker | `npm run start:dev` (API), `npm run start:worker`, `npm run dev` trong `apps/web` port 3001, admin port 3003. DB: `npm run db:up` |

`npm run db:up` dùng `docker compose up -d` (file compose mặc định), khác file `docker-compose.local-full.yml`.

---

## 16. Production Safety

Tách bằng compose và env, không dùng chung file:

| | Local | Production |
|---|---|---|
| Compose | `docker-compose.local-full.yml` | `docker-compose.production.yml` |
| Env | `.env.local-full` | `.env.production` trên VPS |
| `APP_ENV` | `staging` | `production` |
| `DATABASE_URL` | postgres local, volume `cardon_local_full_postgres` | postgres riêng, volume `cardon_prod_postgres` |
| Redis | volume local | `cardon_prod_redis` |
| eSale | mock | `ESALE_USE_MOCK=false` |
| Site URL | `http://localhost` | `https://cardon.vn` |
| Upload | volume local | volume production |
| Webhook công khai | không vào được từ MegaPay/SePay nếu URL là localhost | URL production |

Cách giữ `LOCAL ≠ PRODUCTION` khi làm eSIM:

- Chỉ sửa code trên nhánh local. Lên VPS bằng git sau này, không restore database local đè production.
- Không copy `.env.local-full` lên VPS.
- Giữ `ESALE_USE_MOCK=true` trên local.
- Không quét VietQR trên localhost: cấu hình cổng trong DB local là bản copy, tiền có thể vào tài khoản thật.
- Migration eSIM chỉ chạy trên Postgres local (port 5433) cho đến khi có quyết định deploy riêng.
- Nhánh code eSIM không được đổi hành vi `CARD` / `TOPUP` khi type không phải eSIM.

---

## 17. Reusable Components

| Có thể dùng lại | Cách |
|---|---|
| User, JWT, account shell | Thêm trang eSIM cạnh thẻ đã mua |
| Product / category / variant | Chỉ nếu thêm `homeService` và `variant.type` mới. Hôm nay chưa có |
| Giá bán `sellPrice` + mapping giá vốn | Cùng mô hình SKU nội bộ / SKU nhà cung cấp |
| Order + OrderItem + payment webhook | Đơn và tiền. Không dùng phần `buyCard` |
| `FulfillmentDispatchService` | Thêm nhánh type mới, không sửa nhánh CARD/TOPUP |
| `notification_queue` + EmailTemplate | Template `ESIM_DELIVERED` |
| Admin RBAC, audit log | Màn hình đơn eSIM mới |
| AES-256-GCM | Mã hóa LPA/QR nếu coi là bí mật giao hàng |

Không reuse trực tiếp:

- `card_records` (serial/PIN)
- `topup_transactions` (số điện thoại, telco)
- `provider_queue` / `ESaleProvider.buyCard`
- `guestPhone` như định danh giao hàng (đang là số nạp)
- Ví đại lý / ledger HOLD cho khách lẻ
- Enum `HomeServiceType` hiện tại nếu chưa migrate (việc migrate để sau, chỉ trên local)

Cần abstraction mới, không refactor luồng thẻ đang chạy:

- `EsimProviderInterface` (catalog, quote, order, query). Implementation đầu `AiraloProvider`.
- Bảng profile eSIM (ICCID, QR, installation URL, trạng thái gói).
- Queue `esim_queue`.

---

## 18. Components Requiring Refactor

Chưa sửa trong đợt này. Khi làm eSIM trên localhost:

1. `FulfillmentDispatchService` cần một nhánh nữa. Phải giữ nguyên `if (hasCard)` / `if (hasTopup)`.
2. `ProductVariantType` và `HomeServiceType` chưa có eSIM. Thêm enum là migration. Chỉ chạy local cho đến khi được phép.
3. `ProviderService.fulfillOrder` giả định một item CARD. Đừng gắn eSIM vào hàm này.
4. Email fallback nằm cứng trong `template.registry.ts` song song với DB. Template eSIM nên có cả hai, giống thẻ.

---

## 19. eSIM Integration Opportunities

Chưa code. Đề xuất để Airalo không bị gắn cứng vào CardOn.

```
Customer
  ↓
CardOn catalog (product/variant type ESIM, mapping provider_product_code)
  ↓
OrderService.createOrder          (cùng paymentStatus WAITING_PAYMENT)
  ↓
PaymentService.createPayment      (MegaPay / SePay giữ nguyên)
  ↓
Webhook SUCCESS → orders PAID
  ↓
FulfillmentDispatchService
  ↓  chỉ khi variant type = ESIM
esim_queue
  ↓
EsimFulfillmentService
  ↓
EsimProviderInterface
  ├── AiraloProvider          (đầu tiên)
  ├── EsimGoProvider          (sau)
  └── OneGlobalProvider       (sau)
  ↓
esim_profiles: ICCID, QR, installation URL, status
  ↓
notification_queue template ESIM_DELIVERED
  ↓
Customer /tai-khoan/esim
```

`EsimProviderInterface` tối thiểu: `listPackages`, `createOrder`, `getOrder`, `getBalance` nếu nhà cung cấp có ví. `code` nhà cung cấp nằm ở bảng `providers`, không if-else Airalo trong order service.

Đơn eSIM vẫn tách `payment_status` và trạng thái giao hàng. Thanh toán thành công không có nghĩa eSIM đã cài được.

---

## 20. Risks

- Hai process (API và worker) đều import `PaymentModule` và `ProviderModule`, nên sweep hết hạn thanh toán và sync số dư có thể chạy song song. Watchdog đơn đã trả tiền chỉ nằm ở worker.
- `ProviderService` chỉ giao item CARD đầu tiên nếu đơn có nhiều dòng CARD.
- `provider_product_mappings` không unique theo provider + variant.
- `email_queue`, `payment_queue`, `reconciliation_queue` không có worker. Dễ tưởng mail đi queue `email_queue`.
- SePay `refund()` chưa làm. `OrderPaymentStatus.REFUNDED` có trong schema, không thấy webhook tự set.
- PayOS chỉ là label, không có adapter.
- iMedia chỉ có mock.
- DB local là bản copy production: thanh toán QR trên localhost có thể là tiền thật. eSale thì đang mock.
- Comment cũ trong `payment-success-queue.rules.ts` nói enqueue chưa làm. Code hiện tại **đã** enqueue trong `PaymentService.handleWebhook`. Comment đó lệch code.
- Đụng `PaymentService` hoặc dispatch mà không khóa theo loại sản phẩm sẽ ảnh hưởng khách đang mua thẻ.

---

## 21. Recommended Next Steps

1. Giữ production nguyên. Mọi thử nghiệm trên Docker local.
2. Viết interface `EsimProviderInterface` và adapter Airalo đọc credential từ env local, chưa gắn vào `createOrder`.
3. Thiết kế migration local: enum/type eSIM, bảng profile, queue mới. Không chạy migration đó trên VPS.
4. Khi nối thanh toán, chỉ thêm nhánh trong `dispatchOrderFulfillment` sau `PAID`, có test chứng minh đơn CARD và TOPUP không đổi queue.
5. Thêm template email và trang `/tai-khoan/esim` sau khi giao hàng local trả được ICCID giả hoặc sandbox Airalo.
6. Chưa deploy, chưa sửa payment production, chưa restore DB.

---

## Bảng reuse

| Component | Current Implementation | Reuse for eSIM | Modification |
|---|---|---|---|
| Product | `products` + `home_service` | Có, sau khi có type mới | Enum + admin filter |
| Category | `product_categories.home_service` | Có | Thêm giá trị enum trên local |
| Variant | `sell_price`, `sku` nội bộ | Có | `type = ESIM` |
| Supplier SKU | `provider_product_mappings.provider_product_code` | Có | Bản ghi Airalo package id |
| Giá vốn | `provider_cost` | Có | Không đổi bảng |
| Order | `orders` + payment/fulfillment status | Có | Không đổi state machine tiền |
| OrderItem | quantity, unit price | Có | Không nhét ICCID vào item |
| Payment | MegaPay, SePay, webhook, idempotency | Có | Không đổi provider |
| Fulfillment dispatch | CARD → provider_queue, TOPUP/DATA → topup_queue | Hook một nhánh | Queue mới, không dùng `buyCard` |
| Card delivery | `card_records` PIN | Không | Bảng profile eSIM |
| Topup | `guestPhone` + `topup_transactions` | Không | — |
| User / JWT | account APIs | Có | Route `/account/esims` |
| Email | `notification_queue` + `email_templates` | Có | Template mới |
| Admin audit | `audit_logs` | Có | Target vẫn `ORDER` hoặc type mới sau |
| Agent wallet | ledger HOLD | Không cho khách lẻ | — |
| Inventory | không có | Không | Airalo không trừ kho local |
| Coupon | không có | Không | — |

## Bảng flow hiện tại

| Current Flow | File | Function | API | Database | Queue |
|---|---|---|---|---|---|
| Chọn mệnh giá và thanh toán | `apps/web/components/checkout/CheckoutShell.tsx` | `pay` | — | — | — |
| Tạo đơn | `src/modules/order/services/order.service.ts` | `createOrder` | `POST /api/v1/orders` | `orders`, `order_items`, `transactions` | — |
| Tạo phiên thanh toán | `src/modules/payment/services/payment.service.ts` | `createPayment` | `POST /api/v1/payments` | `payments` | — |
| QR / form MegaPay | `megapay.provider.ts` | `createPayment` | gateway HTTP | `payments.gateway_response` | — |
| QR / form SePay | `sepay.provider.ts` | `createPayment` | gateway HTTP | `payments.gateway_response` | — |
| Webhook | `payment.service.ts` | `handleWebhook` | `POST /api/v1/payments/webhook/:gateway` | `webhook_logs`, `payments`, `orders` | — |
| Hết hạn | `expiration-cron.service.ts` | `sweep` | — | `payments`, `orders` → EXPIRED | không dùng `payment_queue` |
| Dispatch | `fulfillment-dispatch.service.ts` | `dispatchOrderFulfillment` | — | đọc items | `provider_queue` / `topup_queue` |
| Giao thẻ | `provider.service.ts` | `fulfillOrder` | eSale `buyCard` | `provider_transactions`, `card_records` | `provider_queue` |
| Nạp cước / data | `topup.service.ts` | `fulfillOrder` | eSale `topup` | `topup_transactions` | `topup_queue` |
| Đọc số điện thoại nạp | `topup-phone.util.ts` | `resolveTopupPhone` | — | `orders.guest_phone` hoặc `customer_note` | — |
| Mail | `notification.service.ts` / `notification-dispatch.service.ts` | `notifyPaymentSuccess`, `dispatch` | SMTP | `email_templates`, `notifications` | `notification_queue` |
| Xem PIN | `order.controller.ts` | `reveal-pin` | `POST /api/v1/orders/:id/cards/:cardId/reveal-pin` | `card_records`, `card_access_logs` | — |
| Retry tay | `fulfillment-dispatch.service.ts` | `retryOrderFulfillment` | admin API | `orders.fulfillment_status` | retry job hoặc gọi service |
