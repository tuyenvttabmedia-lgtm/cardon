# Phase 2B.2 — Auth Security Hardening Report

> Date: 2026-06-18  
> Scope: Fix findings from `docs/PHASE_2B1_AUTH_SECURITY_AUDIT.md`  
> No Product Engine, Order, Payment, or Provider work

---

## Executive Summary

| Overall | **FULL PASS** |
|---------|---------------|
| Findings fixed | **4 / 4** |
| `npm run build` | **PASS** |
| `npm run test:auth` | **PASS (36/36)** |

---

## Fixes Applied

### M-01 — Logout refresh token revoke

**Change:** `AuthService.logout()` now uses explicit find-then-revoke flow:

1. Hash optional `refreshToken` (SHA-256)
2. `findFirst` on `refresh_tokens` (`userId`, `tokenHash`, `revokedAt: null`)
3. `update` sets `revokedAt` if found
4. Access-token logout unchanged (JWT remains valid until expiry — client discards it)

**Tests added:**

- `auth.service.spec.ts` — logout → refresh reuse fails
- `auth-security.audit.spec.ts` — CHECK 1 updated for find/update flow

---

### M-02 — RBAC cache invalidation

**New:** `PermissionCacheService` (`src/modules/rbac/permission-cache.service.ts`)

| Method | Purpose |
|--------|---------|
| `getRolePermissions(role)` | Read cached permissions |
| `setRolePermissions(role, permissions)` | Store with 60s TTL |
| `invalidateRole(role)` | Clear role cache entry |
| `invalidateUser(userId)` | Lookup user role → `invalidateRole` |
| `onRolePermissionsChanged(role)` | Hook for permission mutations |

**RbacService updates:**

- Delegates caching to `PermissionCacheService`
- `notifyRolePermissionsChanged(role)` — call after admin mutates `role_permissions`
- `notifyUserRoleChanged(userId)` — call after user role change

Cache retained (60s TTL). Invalidation is immediate when hooks are invoked.

**Tests:** `permission-cache.service.spec.ts` (4 tests)

---

### L-01 — Refresh endpoint throttle

**Change:** `AuthController.refresh()`:

```typescript
@Throttle({ default: { limit: 20, ttl: 900_000 } })
@Post('refresh')
```

20 requests per 15 minutes (900_000 ms).

---

### L-02 — Password reset token logging (verified)

**Verified:** `AuthService.forgotPassword()` logs reset token **only** when:

```typescript
if (process.env.APP_ENV === 'development') {
  this.logger.debug(`Password reset token for ${email}: ${rawToken} (dev only)`);
}
```

**Test added:** Production `APP_ENV` — confirms `logger.debug` not called.

Email verification token uses same `APP_ENV === 'development'` guard.

---

## Files Changed

| File | Change |
|------|--------|
| `src/modules/auth/auth.service.ts` | Logout find+revoke |
| `src/modules/auth/auth.controller.ts` | Refresh throttle |
| `src/modules/rbac/permission-cache.service.ts` | **New** |
| `src/modules/rbac/rbac.service.ts` | Use PermissionCacheService |
| `src/modules/rbac/rbac.module.ts` | Export PermissionCacheService |
| `src/modules/auth/auth.service.spec.ts` | Logout test |
| `src/modules/auth/auth-security.audit.spec.ts` | Updated audit checks |
| `src/modules/rbac/permission-cache.service.spec.ts` | **New** |
| `package.json` | `test:auth` includes permission-cache |
| `docs/PHASE_2B1_AUTH_SECURITY_AUDIT.md` | Findings marked resolved |

---

## Test Results

Command: `npm run test:auth`

| Suite | Tests | Result |
|-------|-------|--------|
| `auth.service.spec.ts` | 9 | **PASS** |
| `auth-security.audit.spec.ts` | 23 | **PASS** |
| `permission-cache.service.spec.ts` | 4 | **PASS** |
| **Total** | **36** | **PASS** |

---

## Validation

| Command | Result |
|---------|--------|
| `npm run build` | **PASS** |
| `npm run test:auth` | **PASS (36/36)** |

---

## Remaining Notes (Non-blocking)

| Item | Status |
|------|--------|
| Logout without `refreshToken` body | Session not revoked — client must send token |
| Admin API for role mutations | Must call `notifyRolePermissionsChanged()` when built |
| Email delivery for reset/verify tokens | Phase 2C+ (queue) |

---

## Finding Resolution Matrix

| ID | 2B.1 Status | 2B.2 Status |
|----|-------------|-------------|
| M-01 | Open | **Fixed** |
| M-02 | Open | **Fixed** |
| L-01 | Open | **Fixed** |
| L-02 | Open | **Verified** |

---

**Phase 2B.2: COMPLETE — FULL PASS**

Product Engine not started.
