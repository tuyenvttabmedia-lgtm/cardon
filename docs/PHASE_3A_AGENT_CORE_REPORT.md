# Phase 3A — Agent Platform Core

> Date: 2026-06-19  
> Scope: Agent account foundation (`src/modules/agent/`) — lifecycle, KYC, credentials, ledger  
> Not included: Public Agent API, buyCard API, frontend, payment gateway top-up

---

## Executive Summary

| Overall | **FULL PASS** |
|---------|---------------|
| `npm run build` | **PASS** |
| `npm run test:agent` | **PASS (13/13)** |
| Tasks completed | **10/10** |

---

## Module Structure

```
src/modules/agent/
├── controllers/agent.controller.ts   # AgentController + AgentAdminController
├── services/
│   ├── agent.service.ts
│   ├── ledger.service.ts
│   ├── agent-credential.service.ts
│   └── agent-audit.service.ts
├── repositories/
│   ├── agent.repository.ts           # Agent + AgentKyc + AgentUser repos
│   └── ledger.repository.ts
├── dto/agent.dto.ts
├── entities/agent.constants.ts
├── agent.module.ts
└── agent.service.spec.ts
```

Architecture: **Controller → Service → Repository → Prisma**

---

## Deliverables

### TASK 1: Agent Module

**DONE** — Full module wired in `AppModule`, exports `AgentService`, `LedgerService`, `AgentRepository`.

### TASK 2: Agent Lifecycle

| Status | Meaning |
|--------|---------|
| `PENDING_KYC` | Registered, awaiting or in KYC review (default) |
| `ACTIVE` | KYC approved, API enabled |
| `SUSPENDED` | Admin suspended, API disabled |
| `REJECTED` | KYC rejected |

**Flow:** Register → Submit KYC → Admin review → Approve → `ACTIVE`

Migration: `prisma/migrations/20250619050000_agent_lifecycle_status/migration.sql`

### TASK 3: KYC

**DONE** — `agent_kyc` table via Prisma `AgentKyc` model.

| Field | DTO / DB |
|-------|----------|
| `company_name` | `companyName` |
| `tax_code` | `taxCode` |
| `representative` | `representativeName` |
| `documents` | `documentFront`, `documentBack`, `businessLicense` |
| `status` | `PENDING` → `SUBMITTED` → `APPROVED` / `REJECTED` |

**Rules:** Only `ADMIN` / `SUPPORT` with permission `agents.kyc.review` can approve/reject. Self-review blocked in `AgentUserRepository.assertCanReviewKyc`.

### TASK 4: API Credentials Foundation

**DONE** — On KYC approval:

| Output | Storage |
|--------|---------|
| `api_key` (plain) | Shown **once** in approve response — never persisted |
| `secret_key` (plain) | Shown **once** — never persisted |
| `api_key_hash` | bcrypt hash on `agents.api_key_hash` |
| `secret_key_encrypted` | AES-256-GCM on `agents.secret_key_encrypted` |

Service: `AgentCredentialService` (prefixes `ak_` / `sk_`).

### TASK 5: Agent Balance / LedgerService

**DONE** — Balance changes **only** via `ledger_entries` + transactional balance update.

| Type | Effect |
|------|--------|
| `CREDIT` | `balance += amount` |
| `HOLD` | `held_balance += amount` (checks available) |
| `DEBIT` | `balance -= amount`, `held_balance -= amount` |
| `RELEASE` | `held_balance -= amount` |

Row lock: `SELECT … FOR UPDATE` on agent row inside `$transaction`.

### TASK 6: Deposit Foundation

**DONE** — Admin manual credit via `POST /admin/agents/:id/credit`.

- Reference type: `TOPUP`
- Requires agent `ACTIVE`
- Permission: `agents.credit` (ADMIN, ACCOUNTANT, SUPER_ADMIN)
- No payment gateway connection

### TASK 7: Balance Calculation

```
available_balance = balance - held_balance
held_balance      = agents.held_balance (active holds)
```

Exposed in `LedgerService.getBalance()` → `AgentBalanceSnapshot`.

### TASK 8: Security

| Rule | Enforcement |
|------|-------------|
| Agent cannot modify balance directly | Only `LedgerService` mutates balances inside transactions |
| Agent cannot approve own KYC | `assertCanReviewKyc(reviewerId, agentUserId)` |
| Agent cannot create ledger manually | No public ledger endpoints; `LedgerRepository.updateEntry/deleteEntry` throw `ForbiddenException` |
| Non-admin cannot review KYC | `assertKycReviewer` — ADMIN/SUPPORT only |

### TASK 9: Audit

| Action | Constant |
|--------|----------|
| Agent registered | `AGENT_REGISTERED` |
| KYC submitted | `KYC_SUBMITTED` |
| KYC approved | `KYC_APPROVED` |
| KYC rejected | `KYC_REJECTED` |
| Balance credited | `AGENT_CREDITED` |
| Agent suspended | `AGENT_SUSPENDED` |
| API key generated | `AGENT_API_KEY_GENERATED` |

Target type: `AuditTargetType.AGENT` via `AgentAuditService`.

### TASK 10: Tests

File: `src/modules/agent/agent.service.spec.ts`

| Scenario | Status |
|----------|--------|
| Create agent | PASS |
| Submit KYC | PASS |
| Approve KYC | PASS |
| Generate API key (credentials) | PASS |
| Credit balance | PASS |
| Ledger immutable | PASS |
| Suspend agent | PASS |
| Self KYC review blocked | PASS |
| Available balance formula | PASS |

Script: `npm run test:agent` → `jest --testPathPattern=agent`

---

## Internal Endpoints (JWT — not public Agent API)

### User (authenticated)

| Method | Path | Description |
|--------|------|-------------|
| POST | `/agents/register` | Request agent profile |
| POST | `/agents/kyc` | Submit KYC documents |
| GET | `/agents/me` | Profile + balance snapshot |

### Admin

| Method | Path | Permission |
|--------|------|------------|
| POST | `/admin/agents/:id/kyc/approve` | `agents.kyc.review` |
| POST | `/admin/agents/:id/kyc/reject` | `agents.kyc.review` |
| POST | `/admin/agents/:id/suspend` | `agents.manage` |
| POST | `/admin/agents/:id/credit` | `agents.credit` |
| GET | `/admin/agents/:id/balance` | `ledger.view` |
| GET | `/admin/agents/:id/ledger` | `ledger.view` |

---

## Seed / Permissions

Added to `prisma/seed.mjs`:

- `agents.kyc.review` → SUPPORT, ADMIN, SUPER_ADMIN
- `agents.credit` → ACCOUNTANT, ADMIN, SUPER_ADMIN
- `agents.manage` → ADMIN, SUPER_ADMIN

---

## Explicitly Out of Scope (Phase 3A)

- Public Agent API (`Authorization: Bearer {api_key}`)
- `buyCard` / agent order placement
- HOLD → DEBIT fulfillment flow for agent orders
- Frontend agent portal
- Payment gateway auto top-up (SePay / MegaPay)

These belong to a later phase per `docs/07_AGENT_API.md`.

---

## Verification Commands

```powershell
$node = "C:\Users\MyHome\AppData\Local\Programs\cursor\resources\app\resources\helpers\node.exe"
Set-Location C:\Users\MyHome\Projects\cardon
& $node node_modules/prisma/build/index.js generate
& $node node_modules/@nestjs/cli/bin/nest.js build
& $node node_modules/jest/bin/jest.js --testPathPattern=agent
```

---

## Result

**Phase 3A Agent Platform Core — FULL PASS**

Ready for next phase: Public Agent API gateway + buyCard integration (not started).
