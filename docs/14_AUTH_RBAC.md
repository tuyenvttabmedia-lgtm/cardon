# Authentication & RBAC

> Phase 2 — Design reference. Extends `02_DATABASE_SCHEMA.md`. No application code yet.

## Overview

```
Client (Web / Agent Portal / Admin)
    ↓
AuthController              ← validation, token issuance only
    ↓
AuthService                 ← login, register, password reset logic
    ↓
UserRepository | AgentRepository
    ↓
Database
```

All auth business logic lives in **Service layer**. Guards enforce RBAC on every protected route.

---

## User Types

| Type | Auth Method | Role(s) |
|------|-------------|---------|
| Customer | Email + password (JWT) | `CUSTOMER` |
| Guest | No account; email on order | — |
| Agent | Email + password (JWT) | `AGENT` |
| Admin staff | Email + password (JWT) | `SUPPORT`, `MARKETING`, `ACCOUNTANT`, `ADMIN`, `SUPER_ADMIN` |

---

## Customer Authentication

### Register

```
POST /api/v1/auth/register
    ↓
AuthService.register({ email, password })
    ↓
Create users (role: CUSTOMER, status: ACTIVE)
    ↓
Send verification email (async queue)
    ↓
Return JWT access + refresh token
```

| Field | Rule |
|-------|------|
| email | UNIQUE, validated format |
| password | Min 8 chars, bcrypt hash |
| email_verified | Default `false` until verified |

### Login

```
POST /api/v1/auth/login
    ↓
AuthService.login({ email, password })
    ↓
Verify bcrypt password_hash
    ↓
Issue JWT (access + refresh)
```

### Email Verification

```
GET /api/v1/auth/verify-email?token={token}
    ↓
AuthService.verifyEmail(token)
    ↓
users.email_verified = true
```

Verification token: single-use, expires 24h. Stored hashed or in dedicated table (see Schema Extensions).

### Forgot Password

```
POST /api/v1/auth/forgot-password  { email }
    ↓
Send reset link (always return 200 — no email enumeration)
    ↓
POST /api/v1/auth/reset-password  { token, new_password }
    ↓
Update password_hash, invalidate reset token
```

### Social Login (Future)

Reserved extension point. Do not implement in Phase 2.

```
AuthService.socialLogin(provider, token)
    ↓
Find or create users (role: CUSTOMER)
    ↓
Issue JWT
```

Store `social_provider` + `social_id` when implemented.

---

## Guest Checkout

Guest purchases **without** a `users` account.

| Field | Storage | Required |
|-------|---------|----------|
| `guest_email` | `orders.guest_email` | Yes |
| `guest_phone` | `orders.guest_phone` | No |
| `user_id` | `orders.user_id` | NULL |

### Guest Order Flow

```
Customer selects product (no login)
    ↓
Checkout form: guest_email (required), guest_phone (optional)
    ↓
Create order (user_id = NULL, channel = B2C)
    ↓
Payment → fulfillment → delivery to guest_email
```

See [16_B2C_CHECKOUT_FLOW.md](./16_B2C_CHECKOUT_FLOW.md).

### Claim Order Later

When guest registers with same email:

```
AuthService.register({ email })
    ↓
OrderService.claimGuestOrders(userId, email)
    ↓
UPDATE orders SET user_id = :userId
  WHERE guest_email = :email AND user_id IS NULL
```

Customer then sees historical guest orders in order history.

---

## Agent Authentication

### Agent Registration & Login

```
POST /api/v1/auth/agent/register
    ↓
Create users (role: AGENT)
    ↓
Create agents (status: PENDING_KYC, api disabled)
    ↓
Return JWT (portal access only — API key not issued yet)
```

```
POST /api/v1/auth/agent/login
    ↓
Verify credentials
    ↓
Check agents.kyc_status = APPROVED for API access
    ↓
Issue JWT
```

### KYC Requirement

KYC data stored in `agent_kyc` table. See `02_DATABASE_SCHEMA.md`.

| agent_kyc.status | Portal login | Agent API |
|------------------|-------------|-----------|
| `PENDING` | ✓ (submit KYC) | ✗ Disabled |
| `SUBMITTED` | ✓ (awaiting review) | ✗ Disabled |
| `APPROVED` | ✓ | ✓ if `agents.api_enabled = true` |
| `REJECTED` | ✓ (resubmit) | ✗ Disabled |

API key generation allowed **only** when `agent_kyc.status = APPROVED` and `agents.api_enabled = true`.

```
Admin approves KYC
    ↓
agents.kyc_status = APPROVED
    ↓
Admin generates API key (shown once)
    ↓
Agent API enabled
```

KYC documents stored encrypted. Admin reviews via admin panel.

---

## Admin Authentication

```
POST /admin/api/v1/auth/login
    ↓
AuthService.adminLogin({ email, password })
    ↓
Verify role IN (SUPPORT, MARKETING, ACCOUNTANT, ADMIN, SUPER_ADMIN)
    ↓
Issue JWT with role + permissions claims
```

Session timeout: 8 hours. Optional 2FA for ADMIN+ (future).

---

## Admin Roles

| Role | Purpose |
|------|---------|
| `SUPER_ADMIN` | Full system access, ledger adjustment, settings |
| `ADMIN` | Operations management, providers, pricing, agents |
| `ACCOUNTANT` | Finance: ledger, reconciliation, invoices |
| `SUPPORT` | Customer support: orders view, retry fulfillment |
| `MARKETING` | CMS, SEO, banners, content |

Customer and Agent roles unchanged: `CUSTOMER`, `AGENT`.

Full role ENUM: see `02_DATABASE_SCHEMA.md`.

---

## Permission Model

Permissions are **granular strings** assigned to roles. Backend `@RequirePermission()` guard checks permission, not role name alone.

| Permission | Description |
|------------|-------------|
| `users.read` | View user/agent list |
| `orders.read` | View orders |
| `orders.retry` | Retry failed fulfillment |
| `payments.view` | View payment records |
| `ledger.view` | View agent ledger |
| `providers.manage` | Provider config, sync |
| `pricing.manage` | Product/variant pricing, agent prices |
| `invoice.manage` | View/void invoices |
| `cms.manage` | CMS pages, banners, SEO |
| `settings.manage` | System settings (SUPER_ADMIN primary) |

### Role → Permission Matrix

| Permission | SUPPORT | MARKETING | ACCOUNTANT | ADMIN | SUPER_ADMIN |
|------------|---------|-----------|------------|-------|-------------|
| `users.read` | ✓ | — | ✓ | ✓ | ✓ |
| `orders.read` | ✓ | — | ✓ | ✓ | ✓ |
| `orders.retry` | ✓ | — | — | ✓ | ✓ |
| `payments.view` | ✓ | — | ✓ | ✓ | ✓ |
| `ledger.view` | — | — | ✓ | ✓ | ✓ |
| `providers.manage` | — | — | — | ✓ | ✓ |
| `pricing.manage` | — | — | — | ✓ | ✓ |
| `invoice.manage` | — | — | ✓ | ✓ | ✓ |
| `cms.manage` | — | ✓ | — | ✓ | ✓ |
| `settings.manage` | — | — | — | — | ✓ |

Additional admin-only actions (not in permission list): KYC approval, agent topup, API key regeneration — require `ADMIN` or `SUPER_ADMIN`.

RBAC enforced in backend guards. Frontend hides UI; backend is authority.

---

## JWT Structure

```typescript
// Customer / Agent
{
  sub: userId,
  role: 'CUSTOMER' | 'AGENT',
  email: '...',
  exp: ...
}

// Admin
{
  sub: userId,
  role: 'SUPPORT' | 'MARKETING' | 'ACCOUNTANT' | 'ADMIN' | 'SUPER_ADMIN',
  permissions: ['orders.read', 'orders.retry'],
  exp: ...
}
```

Refresh token stored server-side (recommended) or as httpOnly cookie.

---

## AuthService (Reference)

```typescript
class AuthService {
  register(dto: RegisterDto): Promise<AuthResult>;
  login(dto: LoginDto): Promise<AuthResult>;
  verifyEmail(token: string): Promise<void>;
  forgotPassword(email: string): Promise<void>;
  resetPassword(token: string, newPassword: string): Promise<void>;
  refreshToken(token: string): Promise<AuthResult>;
  claimGuestOrders(userId: string, email: string): Promise<number>;
  agentRegister(dto: AgentRegisterDto): Promise<AuthResult>;
  adminLogin(dto: LoginDto): Promise<AdminAuthResult>;
}
```

---

## Security Rules

- Passwords: bcrypt only
- JWT secret in ENV
- Rate limit login: 5 attempts / 15 min per IP (see `12_SECURITY_DEPLOY.md`)
- Never expose password_hash or reset tokens
- Guest email validated at checkout; used for delivery and claim

---

## Database Schema

> **Merged into [`02_DATABASE_SCHEMA.md`](./02_DATABASE_SCHEMA.md)** — users, orders (guest fields), agent_kyc, auth tokens.

---

## API Endpoints Summary

| Endpoint | Access |
|----------|--------|
| `POST /api/v1/auth/register` | Public |
| `POST /api/v1/auth/login` | Public |
| `POST /api/v1/auth/forgot-password` | Public |
| `POST /api/v1/auth/reset-password` | Public |
| `GET /api/v1/auth/verify-email` | Public |
| `POST /api/v1/auth/refresh` | Public |
| `POST /api/v1/auth/agent/register` | Public |
| `POST /api/v1/auth/agent/login` | Public |
| `POST /admin/api/v1/auth/login` | Public |

---

## Related Docs

- [02_DATABASE_SCHEMA.md](./02_DATABASE_SCHEMA.md)
- [07_AGENT_API.md](./07_AGENT_API.md)
- [11_ADMIN_PANEL.md](./11_ADMIN_PANEL.md)
- [16_B2C_CHECKOUT_FLOW.md](./16_B2C_CHECKOUT_FLOW.md)
- [12_SECURITY_DEPLOY.md](./12_SECURITY_DEPLOY.md)
