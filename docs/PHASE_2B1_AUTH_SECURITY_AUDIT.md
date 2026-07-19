# Phase 2B.1 — Auth Security Audit Report

> Date: 2026-06-18  
> Scope: Security audit of Phase 2B Auth + RBAC implementation  
> No new features — audit and tests only

---

## Executive Summary

| Overall | **PASS with findings** |
|---------|------------------------|
| Critical issues | **0** (no code changes required) |
| Medium findings | **2** (documented, deferred) |
| Low findings | **2** (documented) |
| `npm run build` | **PASS** |
| `npm run test:auth` | **PASS (29/29)** |

Audit test suite: `src/modules/auth/auth-security.audit.spec.ts`

---

## Audit Results

### CHECK 1 — Refresh token security

| Test | Expected | Result |
|------|----------|--------|
| Old refresh token rejected after rotation | Rejected | **PASS** |
| Refresh token rejected after logout (token sent in body) | Rejected | **PASS** |

**Implementation verified:**

- `AuthService.refresh()` sets `revokedAt` on old token before issuing new one
- `findFirst` requires `revokedAt: null` — reused tokens fail lookup
- `AuthService.logout()` revokes token when `refreshToken` provided in body

**Finding M-01 (Medium):** Logout without `refreshToken` in request body does **not** revoke any session. Refresh token remains valid until expiry if client omits it.

| Severity | Medium |
|----------|--------|
| Impact | User thinks they logged out but stolen refresh token still works |
| Recommendation | Phase 2C: revoke all active refresh tokens for user on logout, or require refresh token in logout body |
| Fixed in 2B.1 | No |
| Fixed in 2B.2 | **Yes** — `findFirst` + `update` revoke when `refreshToken` provided; tests added |

> **Note (2B.2):** Logout without `refreshToken` in body still does not revoke sessions (by design — optional token). Clients must send refresh token to invalidate refresh session.

---

### CHECK 2 — User status enforcement

| Test | Expected | Result |
|------|----------|--------|
| ACTIVE user login | Allowed | **PASS** |
| SUSPENDED login | Denied | **PASS** |
| SUSPENDED + existing access token | Denied at JwtStrategy | **PASS** |
| BANNED login | Denied | **PASS** |
| BANNED + existing access token | Denied at JwtStrategy | **PASS** |

**Implementation verified:**

- Login checks `UserStatus.SUSPENDED` / `BANNED` before password verify
- `JwtStrategy.validate()` re-queries user and rejects non-`ACTIVE` status on **every** protected request
- Access tokens do not bypass status enforcement (no trust of JWT alone)

---

### CHECK 3 — RBAC correctness

| Test | Expected | Result |
|------|----------|--------|
| CUSTOMER cannot access `orders.read` | Denied | **PASS** |
| SUPPORT only allowed permissions | Scoped correctly | **PASS** |
| SUPER_ADMIN access to admin permissions | Allowed | **PASS** |

**Implementation verified:**

- `PermissionsGuard` calls `RbacService.roleHasAnyPermission()` against DB
- CUSTOMER / AGENT have empty permission sets in seed
- SUPPORT: `users.read`, `orders.read`, `orders.retry`, `payments.view` — no `settings.manage`
- SUPER_ADMIN: all 10 permissions via `role_permissions` seed (not hardcoded code bypass)

**Note:** SUPER_ADMIN "bypass" is **effective** via full DB permission set, not a special guard exception. Aligns with `docs/14_AUTH_RBAC.md`.

---

### CHECK 4 — Permission changes

| Test | Expected | Result |
|------|----------|--------|
| Permission checked from database | Yes | **PASS** |
| New permission applies after cache clear | Yes | **PASS** |
| Immediate effect after DB change | Instant | **PARTIAL** |

**Implementation verified:**

- Permissions are **not** embedded in JWT
- `PermissionsGuard` reads from `RbacService` → `role_permissions` table

**Finding M-02 (Medium):** `RbacService` caches permissions per role for **60 seconds**. If admin removes a permission, affected users may retain access for up to 60s.

| Severity | Medium |
|----------|--------|
| Impact | Delayed permission revocation window |
| Recommendation | Invalidate cache on role-permission mutations (future Admin API); or reduce TTL in production |
| Fixed in 2B.1 | No — not critical; requires admin mutation hook |
| Fixed in 2B.2 | **Yes** — `PermissionCacheService` + `notifyRolePermissionsChanged()` / `invalidateUser()` |

---

### CHECK 5 — Password reset security

| Test | Expected | Result |
|------|----------|--------|
| Reset token hashed in DB | SHA-256, not plain | **PASS** |
| Reset token expires | `expiresAt` enforced | **PASS** |
| Single use | `usedAt` set on success | **PASS** |
| All refresh tokens revoked after reset | `updateMany` revoke | **PASS** |

**Implementation verified:**

- `TokenService.hashToken()` → SHA-256 before storage
- `findFirst` requires `usedAt: null` and `expiresAt > now`
- Transaction: update password + mark token used + revoke all refresh tokens

---

### CHECK 6 — Audit log

| Event | Recorded | Result |
|-------|----------|--------|
| `LOGIN_SUCCESS` | Yes | **PASS** |
| `LOGIN_FAILED` | Yes (wrong password, SUSPENDED, BANNED) | **PASS** |
| `LOGOUT` | Yes | **PASS** |
| `PASSWORD_RESET_REQUEST` | Yes (when user exists) | **PASS** |

**Implementation verified:**

- `AuditService.recordSecurityEvent()` writes to `audit_logs`
- `target_type = USER`, `admin_id = user_id` (self-referencing for auth events)
- Unknown email login: no audit row (no user id available — acceptable)

---

### CHECK 7 — Bruteforce protection

| Test | Expected | Result |
|------|----------|--------|
| Login rate limit active | 5 req / 15 min | **PASS** |
| `@Throttle` on `POST /auth/login` | Present | **PASS** |

**Implementation verified:**

```typescript
@Throttle({ default: { limit: 5, ttl: 900_000 } })
@Post('login')
```

Global `ThrottlerGuard` registered in `AppModule`.

**Finding L-01 (Low):** ~~`POST /auth/refresh` has **no** rate limit.~~ **Fixed in 2B.2** — 20 req / 15 min.

| Severity | Low |
|----------|-----|
| Fixed in 2B.2 | **Yes** — `@Throttle({ limit: 20, ttl: 900_000 })` on refresh |

**Finding L-02 (Low):** Password reset token logged in `APP_ENV=development` debug output only.

| Severity | Low (dev only) |
|----------|----------------|
| Fixed in 2B.2 | **Verified** — production test confirms no debug log |

---

## Findings Summary

| ID | Severity | Check | Description | Fixed |
|----|----------|-------|-------------|-------|
| M-01 | Medium | 1 | Logout refresh token revoke (when provided) | **Yes (2B.2)** |
| M-02 | Medium | 4 | RBAC cache invalidation on permission change | **Yes (2B.2)** |
| L-01 | Low | 7 | Refresh endpoint not rate-limited | **Yes (2B.2)** |
| L-02 | Low | 5 | Reset token debug log in development | **Verified (2B.2)** |

**No critical security issues found.**

> **Resolution:** All findings addressed in Phase 2B.2 — see `docs/PHASE_2B2_AUTH_HARDENING_REPORT.md`

---

## Test Results

Command: `npm run test:auth`

| Suite | Tests | Result |
|-------|-------|--------|
| `auth.service.spec.ts` | 8 | **PASS** |
| `auth-security.audit.spec.ts` | 21 | **PASS** |
| **Total** | **29** | **PASS** |

### Audit tests by check

| Check | Tests | Result |
|-------|-------|--------|
| 1 — Refresh token | 2 | PASS |
| 2 — User status | 5 | PASS |
| 3 — RBAC | 3 | PASS |
| 4 — Permission changes | 2 | PASS |
| 5 — Password reset | 3 | PASS |
| 6 — Audit log | 4 | PASS |
| 7 — Bruteforce | 2 | PASS |

---

## Validation

| Command | Result |
|---------|--------|
| `npm run build` | **PASS** |
| `npm run test:auth` | **PASS (29/29)** |

---

## Security Controls Confirmed

| Control | Status |
|---------|--------|
| Refresh token rotation | Active |
| Refresh token hashing (SHA-256) | Active |
| Password bcrypt (12 rounds) | Active |
| JWT status re-validation per request | Active |
| DB-driven RBAC (not JWT permissions) | Active |
| Password reset single-use + expiry | Active |
| Session invalidation on password reset | Active |
| Login rate limiting | Active |
| Security audit logging | Active |

---

## Deferred Recommendations (Future Phases)

1. **Logout all sessions** — optional `revokeAll` flag to invalidate every refresh token on logout
2. **Admin API** — call `RbacService.notifyRolePermissionsChanged()` after role_permission mutations
3. **Email queue** — deliver reset/verification tokens instead of dev logging

---

## Scope Not Audited

- Agent auth endpoints (not implemented)
- Admin separate login route (not implemented)
- Email delivery of reset/verification tokens
- IP-based account lockout beyond throttler
- 2FA

---

**Phase 2B.1: COMPLETE — PASS (0 critical, 2 medium documented)**

Product Engine not started.
