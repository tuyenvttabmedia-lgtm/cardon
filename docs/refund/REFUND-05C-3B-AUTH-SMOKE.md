# REFUND-05C-3B-AUTH-SMOKE — Authenticated Read-Only Verification

**Date:** 2026-11-04  
**Environment:** localhost `cardon-local-full`  
**Verdict:** **PASS**

Prior attempt in this file was **BLOCKED** (Cursor browser lacked session). Re-run after owner logged in as SUPER_ADMIN in Cursor browser; local SUPER_ADMIN password had been reset separately on local only.

## 1. Session / role (no token printed)

| Check | Result |
|---|---|
| Browser | Cursor IDE browser tab `bbee38` |
| Start URL | `http://admin.localhost/dashboard` (already authenticated) |
| UI identity | Header: `superadmin@cardon.vn` · badge **Quản trị cao cấp** |
| Role inferred | **SUPER_ADMIN** (UI label + email match local staff user) |
| Token handling | Session used only inside page `fetch` with Bearer from `localStorage`; report records `tokenPresent=true`, `tokenLen=257` only — **no token value** copied to logs/report |
| Alternate login / password reset in this step | No |

Runtime: API `sha256:c4398f0e…` healthy; Admin `sha256:efbbff76…` healthy; worker still old image. No rebuild/recreate.

## 2. GET list

| Call | Auth | Status | Body summary |
|---|---|---|---|
| `GET /api/v1/admin/refund-requests?take=20&skip=0` | Browser SUPER_ADMIN session | **200** | Envelope `{ success, data, timestamp }`; `data.items=[]`, `total=0`, `skip=0`, `take=20` |
| Sensitive leak scan on payload | — | Pass | No `gatewayResponse` / `installSecret` / LPA / password / pin substrings |

Aligns with RBAC 05B: SUPER_ADMIN can satisfy any of `refund.request|approve|execute|reconcile` via OR `@Permissions` + service `requireAnyRefundPermission`.

## 3. GET detail (nonexistent UUID)

| Call | Auth | Status | Body |
|---|---|---|---|
| `GET /api/v1/admin/refund-requests/00000000-0000-4000-8000-000000000001` | Browser session | **404** | `error.code=NOT_FOUND`, message `Refund request not found` |
| Sensitive leak scan | — | Pass | None |

UI route `http://admin.localhost/refunds/00000000-0000-4000-8000-000000000001` shows **Không tìm thấy yêu cầu hoàn.** No approve/execute/reconcile action buttons.

## 4. UI empty state & SUPER_ADMIN affordances

URL: `http://admin.localhost/refunds`

| Observation | Result |
|---|---|
| Page title / heading | Hoàn tiền |
| Subtitle | Manual payout / recon; hệ thống không tự chuyển tiền |
| Empty state | **Không có dữ liệu.** · `0 kết quả · trang 1/1` |
| Filters | ID, Order ID, Payment ID, request/attempt status, eSIM gate, dates, needsAction, Lọc |
| Create button | **Tạo yêu cầu hoàn** visible (expected for SUPER_ADMIN / `refund.request`) |
| Mutating refund action buttons on list | None observed (no rows) |
| Detail 404 | No mutating action buttons |
| JS/runtime error banner | None observed after load |

**Note:** Execute / complete / reconcile controls are detail-scoped and state-gated (`visibleRefundActions`). With zero fixtures they correctly do not appear. Full button matrix by status remains for a later fixture ticket.

## 5. Database counts

| Table | Before | After |
|---|---|---|
| `refund_requests` | 0 | 0 |
| `refund_attempts` | 0 | 0 |
| `payments` | 85 | 85 |
| `orders` | 85 | 85 |
| `ledger_entries` | 2 | 2 |

## 6. Safety confirmation

| Rule | Status |
|---|---|
| Local only | Yes |
| No password/token in this report | Yes |
| No POST/PUT/PATCH/DELETE refund APIs | Yes |
| No refund / order / payment / ledger writes | Yes (counts unchanged) |
| No provider / payout calls by this smoke | Yes |
| No eSIM leftover order ops | Yes |
| No source change / commit | Yes |

## 7. Conclusion

**PASS**

Authenticated SUPER_ADMIN session in Cursor browser can:

1. Open `/refunds` and see correct empty state + create affordance.
2. `GET` list → **200** empty page.
3. `GET` missing id → **404** with expected message (API + UI).
4. Guards match refund OR-permission model for SUPER_ADMIN.

Still out of scope for this ticket (need fixtures + write approval): non-empty list, role matrix for SUPPORT/ACCOUNTANT/ADMIN, and live action-button visibility per refund state.

No source changes.
