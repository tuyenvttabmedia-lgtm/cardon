# 16 — Email policy design

**Depends on:** `15-abuse-findings-evidence.md` (F1, F2)  
**Business constraint:** Retail customers stay **without** mandatory global email verification.

---

## Root cause

`@IsEmail()` accepts RFC reserved / disposable domains. Customer register sets `emailVerifiedAt` immediately (`auth.service.ts` L97–101), so fake mailboxes become first-class accounts.

---

## Proposed solution

### 1. Normalize

- Trim + lowercase before validate/store (already done in register).  
- Reject emails with `+` tag abuse **only if** needed later (optional; not v1).

### 2. Deny-list layers

| Layer | Examples | Source | Update |
|-------|----------|--------|--------|
| RFC reserved / example | `example.com`, `example.org`, `example.net`, `invalid`, `localhost`, `test` | Static code/const | Rare |
| Disposable (common) | mailinator, guerrillamail, tempmail, … | Curated JSON/const (~50–200) | Periodic PR |
| Optional remote | disposable-email API | Later | Not v1 |

**v1:** static reserved + curated disposable. Message: generic `"Email is not supported"` / Vietnamese equivalent — no hint which rule fired.

### 3. Apply where

| Surface | Apply deny-list | Require verified mailbox |
|---------|-----------------|--------------------------|
| `POST /auth/register` | Yes | No (keep retail UX) |
| `POST /auth/agent-register` | Yes | Keep existing agent verify-before-login |
| Change email (if/when exists) | Yes | Yes |
| Guest order email field | Soft warn or deny reserved only | N/A |
| KYC contact email fields | Deny reserved | Prefer verified agent email |

### 4. Semantics vs verification

- **Deny-list** = “this domain never allowed”.  
- **Verification** = “mailbox owned by user”.  
- Do **not** conflate: blocking `example.com` does not require turning on customer verify-email globally.

### 5. False-positive handling

- Allowlist via ENV `EMAIL_DOMAIN_ALLOWLIST` bypasses **disposable** (or approved exception) domains only — **never** RFC reserved (`example.com`, …).  
- Log `email_policy_reject` with hashed email + rule id (no plain PII in aggregated metrics if possible).

---

## Business impact

- Stops `@example.com` class accounts immediately after deploy.  
- Legitimate VN users with Gmail/Yahoo/Outlook/ISP mail unaffected.  
- Guest checkout with reserved domain emails reduced (spam unpaid orders).

## Performance impact

- O(1) set lookup per register — negligible.

## False-positive risk

- Low if reserved+known disposable only.  
- Medium if aggressive public disposable lists (avoid v1).

## Rollback

- Feature flag `EMAIL_POLICY_ENABLED=false` or empty deny-list → previous `@IsEmail` only.

## Regression tests

- Register `user@example.com` → 400.  
- Register normal Gmail → 201/200.  
- Agent-register reserved domain → 400.  
- Existing users with bad domain: **not** auto-deleted by this change (P0 ops separate).

## Dependencies

- Shared helper e.g. `EmailPolicyService` used by Auth + Agent registration DTOs/services.  
- Docs alignment with agent email-verify gate (already AGENT-only).

## Effort

- **S** (0.5–1 day) including tests.
