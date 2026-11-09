# 19 — Ticket / KYC / upload protection design

**Depends on:** `15`, `16`, `17`, `18`.  
**Constraint:** No ledger/payment/fulfillment changes.

---

## Root cause

After easy customer/agent account creation, attackers can:

- Flood `POST /account/support/tickets` → `notifyAdminNewTicket` (ops noise)  
- Upload many screenshots to disk  
- Submit KYC / KYC documents to create admin review work  

Evidence: `support-account.controller.ts` (no throttle); `support.service.ts` L22–44; `agent.controller.ts` L64–79; `agent.service.ts` L91–140.

---

## Proposed solution

### A. Support tickets

| Control | Spec |
|---------|------|
| Rate limit | See `17` — 3 creates / user / hour |
| OPEN cap | Max **5** `OPEN` tickets per customer; else 429/400 with clear message |
| Captcha | Turnstile on create (and optionally first message) |
| Subject/body | Existing DTO validation; add max length if missing; strip control chars |
| Order link | Keep ownership check (`findCustomerOrder`) |
| Notify | Keep admin notify; optional: suppress notify if abuse score high (detection phase) |

### B. Support messages

| Control | Spec |
|---------|------|
| Rate limit | 20 / user / hour |
| Attachment URL | Only allow URLs under `/uploads/support/` produced by upload API (prefix allowlist) |

### C. Support upload

| Control | Spec |
|---------|------|
| Auth | Already JWT + CUSTOMER — keep |
| Rate limit | 10 / user / hour |
| MIME/size | Keep `SUPPORT_UPLOAD_*` constants |
| Binding | Persist `uploadedByUserId` metadata (DB or filename prefix) for abuse forensics |
| Download auth | Prefer authenticated download **or** unguessable token URLs; today public `/uploads/support/{random}` — random hex reduces scanning risk; do **not** directory-list |
| Content | Keep images only; reject SVG if ever added |

### D. Agent KYC

| Control | Spec |
|---------|------|
| Role | Add explicit `@Roles(UserRole.AGENT)` on `POST /agents/kyc` and document upload (defense in depth) |
| Rate limit | 3 submits / 24h; 20 document uploads / 24h |
| Email | Agent must have `emailVerifiedAt` before KYC submit (align with login gate) |
| Domain | Deny-list on any email fields in KYC profile |
| Concurrent | Keep conflict on SUBMITTED/APPROVED; optional idempotent “already submitted” 200 |
| Registration mode | Prod recommendation: `INVITE_ONLY` or `DISABLED` during incident (owner-operated P0) |

### E. What not to change

- KYC approval state machine / admin review workflows  
- Agent wallet, HOLD ledger, API keys  
- eSIM flows  

---

## Business impact

- Cuts ticket/KYC spam that burns support time.  
- Slight friction for power users opening many tickets — OPEN cap is the main UX edge case (raise limit via ENV).

## Performance impact

- Extra COUNT query for OPEN tickets — indexed `customerId+status` recommended if missing.  
- Redis counters as in `17`.

## False-positive risk

- Customers with multiple real issues: allow SUPPORT to reopen/raise cap.  
- Agents resubmitting after REJECTED: already allowed by status check — ensure limit resets or has headroom after reject.

## Rollback

- Feature flags per control: `SUPPORT_OPEN_CAP_ENABLED`, `KYC_EMAIL_VERIFIED_REQUIRED`, throttle flags.

## Regression tests

- 6th OPEN ticket blocked  
- Customer cannot attach another user’s order  
- Non-agent JWT cannot submit KYC (with Roles added)  
- Unverified agent blocked from KYC  
- Upload oversize / bad MIME still rejected  
- Admin notify still fires for legitimate first ticket  

## Dependencies

- Redis abuse limiter; Turnstile; email policy for agent fields  

## Effort

- **M** (1.5–2.5 days).
