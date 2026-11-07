# REFUND-05C-3C-ACCOUNTANT-LOCAL-RESET

**Date:** 2026-11-04  
**Environment:** LOCAL ONLY — compose `cardon-local-full`, database `cardon`  
**Scope:** Password reset for existing `maint@keyon.vn` only  
**Verdict:** **PASS**

Does **not** authorize or start `REFUND-05C-3C-EXECUTE`. Wait for separate owner approval.

---

## 1. Preflight

| Check | Result |
|---|---|
| Compose project `cardon-local-full` | PASS (api/admin/postgres healthy) |
| Database identity | `cardon` on local postgres container (`inet_server_addr` null / no remote) |
| User email exact match | `maint@keyon.vn` |
| Account ID | `880c38ae-9af1-48ad-bd41-4fe7aa79db46` |
| Role before | `ACCOUNTANT` |
| Status | `ACTIVE` |
| Production / VPS | Not involved |

---

## 2. Password reset

| Item | Detail |
|---|---|
| Target | Existing user only (`id` + `email` + `role=ACCOUNTANT` guard) |
| Mechanism | bcrypt hash (cost 12) of env `LOCAL_FULL_PASSWORD` via one-shot local script in API container |
| New user created? | **No** |
| Email / role / permissions / other fields changed? | **No** (only `password_hash`) |
| Other accounts reset? | **No** |
| Password / hash / JWT printed? | **No** |

Update count: **1** row.

Role after reset: `ACCOUNTANT` (unchanged).  
Email after reset: `maint@keyon.vn` (unchanged).

Temporary script removed from host and container after use.

---

## 3. Authentication verification

| Check | Result |
|---|---|
| Login HTTP | **201** |
| Identity email | `maint@keyon.vn` |
| Identity id | `880c38ae-9af1-48ad-bd41-4fe7aa79db46` |
| Role | `ACCOUNTANT` |
| Access token issued | Yes (not printed) |
| `GET /api/v1/auth/me` | **200** |
| Refund permissions on `/me` | `refund.request`, `refund.approve`, `refund.execute`, `refund.reconcile` |
| Role-permission matrix (DB) | Same four `refund.*` codes for `ACCOUNTANT` |
| `GET /admin/refund-requests` (read-only) | **200** |
| Refund mutation endpoints called? | **No** |
| Synthetic fixtures created? | **No** |

`last_login_at` updated to 2026-11-04 16:34:39 UTC (login side-effect).

---

## 4. Side effects / counts

| Metric | Before | After |
|---|---:|---:|
| audit_logs | 526 | 527 (Δ+1, auth/login side-effect) |
| refund_requests | 0 | 0 |
| refund_attempts | 0 | 0 |
| Marker `RFD-05C3C-%` orders | 0 | 0 |

No refund business mutations. No fixture trees.

---

## 5. Safety confirmation

- Local `cardon-local-full` / DB `cardon` only  
- No production access  
- No role/RBAC edits  
- No account create  
- No secrets in report/terminal summary  
- No 05C-3C workflow resume  

---

## 6. Verdict

**PASS**

Local ACCOUNTANT `maint@keyon.vn` is authenticated and retains refund permissions.  
**STOP.** Do not start `REFUND-05C-3C-EXECUTE` until separate owner approval.
