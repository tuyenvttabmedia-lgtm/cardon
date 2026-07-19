# Phase 2B — Authentication + RBAC Report

> Date: 2026-06-18  
> Scope: Customer auth, JWT, refresh tokens, RBAC guards, audit logging  
> Not included: Product, Order, Payment, Provider, Agent API, Admin UI, Frontend

---

## Executive Summary

| Overall | **FULL PASS** |
|---------|---------------|
| `npm run build` | **PASS** |
| `npm run test:auth` | **PASS (8/8)** |
| Auth module | Implemented |
| RBAC guards | Implemented |
| Audit security events | Implemented |

---

## Module Structure

```
src/modules/auth/
├── auth.module.ts
├── auth.controller.ts
├── auth.service.ts
├── auth.constants.ts
├── token.service.ts
├── audit.service.ts
├── dto/
│   ├── register.dto.ts
│   ├── login.dto.ts
│   ├── refresh-token.dto.ts
│   ├── logout.dto.ts
│   ├── forgot-password.dto.ts
│   └── reset-password.dto.ts
├── guards/
│   ├── jwt-auth.guard.ts
│   ├── roles.guard.ts
│   └── permissions.guard.ts
├── strategies/
│   └── jwt.strategy.ts
└── interfaces/
    ├── jwt-payload.interface.ts
    ├── authenticated-user.interface.ts
    └── auth-result.interface.ts

src/modules/rbac/
├── rbac.module.ts
└── rbac.service.ts

src/common/decorators/
├── roles.decorator.ts        → @Roles()
├── permissions.decorator.ts  → @Permissions()
├── current-user.decorator.ts → @CurrentUser()
└── public.decorator.ts       → @Public()
```

---

## API Endpoints

Base prefix: `/api/v1` (from `API_PREFIX`). Health remains at `/health`.

| Method | Path | Auth | Description |
|--------|------|------|-------------|
| POST | `/api/v1/auth/register` | Public | Customer registration |
| POST | `/api/v1/auth/login` | Public | Login (rate limit 5/15min) |
| POST | `/api/v1/auth/refresh` | Public | Rotate refresh token |
| POST | `/api/v1/auth/logout` | JWT | Revoke refresh token + audit |
| POST | `/api/v1/auth/forgot-password` | Public | Password reset request (no enumeration) |
| POST | `/api/v1/auth/reset-password` | Public | Reset password with token |
| GET | `/api/v1/auth/me` | JWT | Current user + permissions |
| GET | `/api/v1/auth/rbac-check` | JWT + `orders.read` | RBAC probe (internal) |

### Success response example (login)

```json
{
  "success": true,
  "data": {
    "accessToken": "eyJ...",
    "refreshToken": "a1b2...",
    "expiresIn": 900,
    "user": {
      "id": "uuid",
      "email": "user@example.com",
      "role": "CUSTOMER",
      "emailVerified": false
    }
  },
  "timestamp": "2026-06-18T12:00:00.000Z"
}
```

---

## Security Decisions

| Topic | Decision |
|-------|----------|
| Password storage | bcrypt (12 rounds), never plain text |
| Password minimum | 8 characters (DTO validation) |
| Access token | JWT, short expiry (default `15m`) |
| Refresh token | Random 48-byte hex, SHA-256 hash stored in DB |
| Refresh rotation | Old token revoked on refresh |
| Logout | Revokes provided refresh token |
| Reset password | Revokes all active refresh tokens |
| Inactive users | `SUSPENDED` / `BANNED` blocked at login and JWT validate |
| Soft delete | Users with `deleted_at` excluded from auth |
| Email enumeration | forgot-password always returns same message |
| Login rate limit | `@Throttle` 5 requests / 15 minutes |
| Permissions | Loaded from `role_permissions` + `permissions` tables (cached 60s) |
| Audit log | `audit_logs` with `target_type = USER`, actor = self for auth events |

### Audit actions recorded

| Action | Trigger |
|--------|---------|
| `LOGIN_SUCCESS` | Valid login |
| `LOGIN_FAILED` | Wrong password, SUSPENDED, BANNED |
| `LOGOUT` | Logout endpoint |
| `PASSWORD_RESET_REQUEST` | forgot-password when user exists |

### JWT payload

```typescript
{
  sub: userId,
  email: string,
  role: UserRole
}
```

Permissions are **not** embedded in JWT — `PermissionsGuard` queries database via `RbacService`.

### Roles supported

`CUSTOMER`, `AGENT`, `SUPPORT`, `MARKETING`, `ACCOUNTANT`, `ADMIN`, `SUPER_ADMIN`

Register creates `CUSTOMER` only. Staff/agent registration deferred to later phases.

### Foundations (not fully wired)

| Feature | Status |
|---------|--------|
| Email verification token | Created on register, logged in dev |
| Password reset email | Token created, logged in dev |
| Email queue integration | Not connected (Phase 2B foundation only) |

---

## Guards & Decorators

| Guard | Purpose |
|-------|---------|
| `JwtAuthGuard` | Validates Bearer JWT, loads active user |
| `RolesGuard` | Checks `@Roles(...)` against `user.role` |
| `PermissionsGuard` | Checks `@Permissions(...)` via DB |

Usage example:

```typescript
@UseGuards(JwtAuthGuard, PermissionsGuard)
@Permissions('orders.read')
@Get('admin/orders')
listOrders(@CurrentUser() user: AuthenticatedUser) { ... }
```

---

## Environment Variables (added)

| Variable | Default | Purpose |
|----------|---------|---------|
| `JWT_ACCESS_EXPIRES_IN` | `15m` | Access token TTL |
| `JWT_REFRESH_EXPIRES_IN` | `7d` | Refresh token DB expiry |

See `.env.example` for full list.

---

## Test Results

Command: `npm run test:auth`

| Test | Result |
|------|--------|
| Register — success | **PASS** |
| Register — duplicate email | **PASS** |
| Login — success | **PASS** |
| Login — suspended denied | **PASS** |
| Login — invalid password | **PASS** |
| Refresh — success | **PASS** |
| Refresh — invalid token | **PASS** |
| Permission denied (CUSTOMER vs orders.read) | **PASS** |

```
Test Suites: 1 passed, 1 total
Tests:       8 passed, 8 total
```

---

## Validation

| Check | Result |
|-------|--------|
| `npm run build` | **PASS** |
| `npm run test:auth` | **PASS (8/8)** |
| Schema modified | No |
| Product Engine | Not started |

---

## Intentionally Not Implemented

- Agent register/login endpoints
- Admin login separate route
- Email queue processors
- Social login
- 2FA
- Repository layer (Prisma used directly in AuthService)
- Product / Order / Payment / Provider modules

---

## Next Phase (Not Started)

**Product Engine** per `docs/15_PRODUCT_ENGINE.md`

---

**Phase 2B: COMPLETE — FULL PASS**
