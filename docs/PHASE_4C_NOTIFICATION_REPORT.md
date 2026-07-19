# Phase 4C — Notification & Communication

> Date: 2026-06-19  
> Scope: Notification layer (`src/modules/notification/`) — email queue, templates, provider abstraction, system alerts  
> Not included: Frontend, SendGrid/SES adapters (future), WEBHOOK delivery (stub)

---

## Executive Summary

| Overall | **FULL PASS** |
|---------|---------------|
| `npm run build` | **PASS** |
| `npm run test:notification` | **PASS (8/8)** |
| Tasks completed | **11/11** |

---

## Module Structure

```
src/modules/notification/
├── services/
│   ├── notification.service.ts          # Facade — chỉ enqueue, không gửi inline
│   ├── notification-queue.producer.ts   # BullMQ producer
│   └── notification-dispatch.service.ts # Worker dispatch (email / system)
├── repositories/
│   └── notification.repository.ts
├── templates/
│   └── template.registry.ts
├── providers/
│   ├── email-provider.interface.ts
│   ├── smtp-email.provider.ts
│   └── mock-email.provider.ts
├── workers/
│   └── notification.worker.ts
├── entities/
│   ├── notification.constants.ts
│   ├── notification.types.ts
│   └── notification-log-safety.ts
├── notification.module.ts
└── notification.service.spec.ts
```

Queue: **`notification_queue`** (BullMQ)

---

## Deliverables

### TASK 1: Notification Module

**DONE** — `NotificationModule` wired in `AppModule`, exported `NotificationService`.

### TASK 2: Notification Types

| Channel | Status |
|---------|--------|
| `EMAIL` | Implemented |
| `SYSTEM` | Implemented (bảng `notifications`) |
| `WEBHOOK` | Stub — worker log và skip |

### TASK 3: Email Provider Abstraction

`EmailProviderInterface.sendEmail()` với adapters:

| Adapter | Status |
|---------|--------|
| `SmtpEmailProvider` | Implemented (transport hook `deliver()`) |
| `MockEmailProvider` | Default khi không có `SMTP_HOST` |
| SendGrid / SES | Future — cùng interface |

### TASK 4: Email Templates

| Template | Subject area |
|----------|--------------|
| `USER_REGISTER` | Xác minh email |
| `PASSWORD_RESET` | Đặt lại mật khẩu |
| `ORDER_SUCCESS` | Xác nhận đơn |
| `PAYMENT_SUCCESS` | Thanh toán thành công |
| `CARD_DELIVERY` | Giao thẻ (serial + PIN) |
| `AGENT_APPROVED` | KYC duyệt |
| `AGENT_LOW_BALANCE` | Số dư thấp |
| `AGENT_API_DISABLED` | API bị tắt |
| `PROVIDER_LOW_BALANCE` | Provider số dư thấp |

### TASK 5: Queue Integration

```
Business event → NotificationService → notification_queue → NotificationWorker → Dispatch → Send
```

- Producer: `attempts: 3`, exponential backoff `5000ms`
- Idempotent `jobId` (ví dụ `email-card-delivery-{orderId}`)
- **Không gửi email inline** từ business services

### TASK 6: Card Delivery Email

Trigger: fulfillment `COMPLETED` trong `ProviderService`.

- Worker load order + `cardRecords`
- Decrypt serial/PIN qua `CardEncryptionService` **chỉ lúc dispatch**
- Decrypted PIN **không persist**, không log body email

### TASK 7: Agent Notifications

| Event | Trigger | Channel |
|-------|---------|---------|
| KYC approved | `AgentService.approveKyc` | EMAIL |
| Low balance | `LedgerService.debitFromHold` | EMAIL |
| API disabled | `AdminAgentService.disableApi` | SYSTEM + EMAIL |

Threshold: `AGENT_LOW_BALANCE_THRESHOLD` (default 100_000 VND).

### TASK 8: Admin Notifications

| Event | Trigger | Channel |
|-------|---------|---------|
| Provider low balance | `ProviderHealthService.checkBalance` | SYSTEM + EMAIL (nếu `ADMIN_ALERT_EMAIL`) |
| WAIT_ADMIN_RETRY | `ProviderService` on `WAITING_ADMIN_RETRY` | SYSTEM |
| Manual payment review | `PaymentService.handleLateSuccessWebhook` | SYSTEM |

### TASK 9: Failure Handling

- Email fail → worker throw → BullMQ retry (3 attempts)
- **Không rollback** payment, order, provider transaction

### TASK 10: Security

`notification-log-safety.ts`:

- Redact `pin`, `resetToken`, sensitive subject/body
- `safeEmailLogMeta()` — chỉ log `to`, `template`, `subject`
- Auth: đã xóa dev debug log reset/verify token

### TASK 11: Tests

File: `notification.service.spec.ts`

| Test | Mô tả |
|------|-------|
| email queued | `notifyUserRegister` enqueue, không send inline |
| template render | `ORDER_SUCCESS`, `PASSWORD_RESET` |
| card delivery decrypt | Decrypt serial/PIN khi dispatch |
| SMTP fail retry | Provider fail → throw cho BullMQ retry |
| no secret logging | Redact PIN/token trong log context |

---

## Integration Points

| Module | Hook |
|--------|------|
| `AuthModule` | Register → `USER_REGISTER`; Forgot password → `PASSWORD_RESET` |
| `PaymentModule` | Webhook success → `PAYMENT_SUCCESS` + `ORDER_SUCCESS`; Late webhook → manual review |
| `ProviderModule` | COMPLETED → `CARD_DELIVERY`; WAITING_ADMIN_RETRY → admin alert; low balance |
| `AgentModule` | KYC approve, ledger debit low balance |
| `AdminModule` | Disable agent API |

---

## Configuration

| Env | Purpose |
|-----|---------|
| `SMTP_HOST`, `SMTP_PORT`, `SMTP_USER`, `SMTP_PASS`, `SMTP_FROM` | SMTP adapter |
| `ADMIN_ALERT_EMAIL` | Email admin cho provider low balance |
| `AGENT_LOW_BALANCE_THRESHOLD` | Ngưỡng cảnh báo agent (default 100000) |
| `APP_PUBLIC_URL` | Base URL cho verify/reset links |

---

## Test Results

```
npm run build              → PASS
npm run test:notification  → PASS (8/8)
```

---

## Out of Scope (Phase 4C)

- Frontend notification UI
- SendGrid / SES adapters
- WEBHOOK channel implementation
- Thay đổi business flow hiện có

---

## Next Phase

Frontend notification center / email preview — **chưa bắt đầu** (theo yêu cầu dừng sau Notification).
