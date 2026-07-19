# Phase 5C.7 — Final Regression Cleanup

**Ngày:** 2026-06-20  
**Trạng thái:** ✅ PASS  
**Phạm vi:** Sửa test outdated sau thay đổi kiến trúc (Settings DB + ENV fallback, Agent deps, Order expiration). **Không đổi business logic / runtime.**

---

## Executive summary

| Hạng mục | Trước | Sau |
|----------|-------|-----|
| Test suites compile fail | 3 | 0 |
| Test suites runtime fail | 2 (notification, 5A.2) | 0 |
| `npm run build` | PASS | PASS |
| `npm run build:web` | PASS | PASS |
| `npm run build:partner` | PASS | PASS |
| `npm run build:admin` | PASS | PASS |
| `npm test` | 4 failed / 32 total | **32 passed / 32 total** |
| Tests | 307 passed | **345 passed** |

---

## TASK 1 — `esale.provider.spec.ts`

### Nguyên nhân

`EsaleConfigService` sau Phase 5C.5 nhận **2 dependency**:

1. `ConfigService` (Nest) — ENV fallback  
2. `SettingsStoreService` — DB settings + cache

Test cũ chỉ truyền 1 arg → compile error.

### Thay đổi (mocks only)

- Import `SettingsEncryptionService`, `SettingsRepository`, `SettingsStoreService`.
- Thêm `buildSettingsStore()`:
  - `repository.findAll()` → `[]` (DB rỗng)
  - Fallback qua `buildConfigService()` (ENV test values)
- `buildProvider()` dùng `new EsaleConfigService(nestConfig, settingsStore)`.
- Cast mock encryption key: `as unknown as ConfigService` (tránh TS2352).

### Coverage giữ nguyên

- Signature eSale V3 (`signBuyCardRequest`, `decryptCardPin`)
- Provider adapter (buy card, query, mapper)
- Config đọc từ ENV khi DB không có giá trị

---

## TASK 2 — `agent.service.spec.ts`

### Nguyên nhân

`AgentService` constructor thêm dependency thứ 8: `CardEncryptionService` (mã hóa secret key agent).

### Thay đổi (mocks only)

Thêm mock thứ 8 vào `beforeEach`:

```typescript
{ encrypt: jest.fn(), decrypt: jest.fn() } as never
```

### Coverage giữ nguyên

- Đăng ký agent / PENDING_KYC
- KYC submit / approve / reject
- Credit ledger, suspend, API key generation
- Permission guards (Forbidden, Conflict, NotFound)

---

## TASK 3 — `order.service.spec.ts`

### Nguyên nhân

`OrderExpirationService` constructor chỉ còn **3 args**:

1. `PrismaService`
2. `OrderRepository`
3. `OrderAuditService`

Test cũ truyền thêm object `{ decrypt }` (thừa sau refactor).

### Thay đổi (mocks only)

Xóa arg thứ 4 khỏi `new OrderExpirationService(...)`.

### Coverage giữ nguyên

| Rule | Test block |
|------|------------|
| Price snapshot | `OrderService` — giá lưu tại checkout |
| Immutability | Không sửa line items sau PAID |
| Expiration | `OrderExpirationService` — WAITING_PAYMENT → EXPIRED |
| Ownership | Chỉ owner / admin xem order |

---

## Phụ — `notification.service.spec.ts` (Phase 5A.2)

Không thuộc 3 suite compile fail ban đầu, nhưng fail runtime sau 5A.2:

| Test | Cập nhật |
|------|----------|
| `notifyUserRegister` | Expect thêm arg `fullName` (`undefined` khi không truyền) |
| `PASSWORD_RESET` template | Subject: `'Đặt lại mật khẩu CardOn.vn'` |

---

## Verification

```bash
npm run build
npm run build:web
npm run build:partner
npm run build:admin
npm test
```

### Kết quả (2026-06-20)

```
Test Suites: 32 passed, 32 total
Tests:       345 passed, 345 total
Snapshots:   0 total
Time:        ~160s
```

Tất cả Next.js apps build thành công (web 13 routes, partner 11 routes, admin 17 routes).

---

## Files thay đổi

| File | Loại |
|------|------|
| `src/modules/provider/adapters/esale/esale.provider.spec.ts` | Mock SettingsStore + EsaleConfigService |
| `src/modules/agent/agent.service.spec.ts` | Mock CardEncryptionService |
| `src/modules/order/order.service.spec.ts` | OrderExpirationService 3-arg ctor |
| `src/modules/notification/notification.service.spec.ts` | Expectations 5A.2 |

**Không có thay đổi production code.**

---

## Kết luận

Phase 5C.7 hoàn tất: toàn bộ test suite compile và pass; build API + 3 frontend apps pass. Regression cleanup sau kiến trúc Settings (5C.5) và Customer Account (5A.2) đã được xử lý chỉ bằng cập nhật mocks/expectations.
