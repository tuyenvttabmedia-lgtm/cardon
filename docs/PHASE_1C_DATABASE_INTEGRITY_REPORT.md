# Phase 1C — Database Integrity Test Report

> Date: 2026-06-18  
> Scope: PostgreSQL constraint/trigger behavior verification only  
> No schema changes, no backend/API/frontend

---

## Executive Summary

| Overall | **FULL PASS (10/10)** |
|---------|------------------------|
| Database | `cardon-postgres` (PostgreSQL 16) |
| Test script | `prisma/tests/phase-1c-integrity.sql` |
| Cleanup | Transaction `ROLLBACK` — no test data persisted |

---

## Test Method

- All tests run inside a single transaction (`BEGIN` … `ROLLBACK`).
- Results captured in temp table `phase1c_results`.
- Deterministic test UUIDs (`11111111-1111-4111-8111-…`) and emails `phase1c-*@cardon.vn`.
- Each destructive attempt wrapped in nested `BEGIN … EXCEPTION` blocks to assert expected failures without aborting the suite.

### Run command

```powershell
Get-Content prisma\tests\phase-1c-integrity.sql -Raw | docker exec -i cardon-postgres psql -U postgres -d cardon
```

---

## Results

| Test | Case | Expected | Actual | Result |
|------|------|----------|--------|--------|
| **TEST 1** — Ledger immutability | `UPDATE ledger_entries` | FAIL (blocked) | Blocked: `ledger_entries is append-only: UPDATE and DELETE are forbidden` | **PASS** |
| **TEST 1** — Ledger immutability | `DELETE ledger_entries` | FAIL (blocked) | Blocked: `ledger_entries is append-only: UPDATE and DELETE are forbidden` | **PASS** |
| **TEST 2** — Guest checkout | `is_guest_order = true`, `guest_email = NULL` | FAIL | Blocked: `chk_guest_order_email` | **PASS** |
| **TEST 2** — Guest checkout | `is_guest_order = true`, `guest_email` provided | PASS | Inserted successfully | **PASS** |
| **TEST 3** — Financial delete protection | `DELETE agent` when ledger exists | FAIL | Blocked: FK restrict (ledger exists) | **PASS** |
| **TEST 4** — Order protection | `DELETE order` when `order_item` + `card_record` exist | FAIL | Blocked: FK restrict (children exist) | **PASS** |
| **TEST 5** — Unique constraints | Duplicate `payment_reference` | FAIL | Blocked: unique `payment_reference` | **PASS** |
| **TEST 5** — Unique constraints | Duplicate `(agent_id, agent_request_id)` | FAIL | Blocked: unique agent request | **PASS** |
| **TEST 6** — Soft delete | `UPDATE deleted_at` on user | PASS | Updated successfully | **PASS** |
| **TEST 6** — Soft delete | Physical `DELETE payment` (financial) | FAIL | Blocked: FK restrict from order | **PASS** |

### Summary counts

| Result | Count |
|--------|-------|
| PASS | 10 |
| FAIL | 0 |

---

## Mechanisms Verified

| Area | Mechanism | Source |
|------|-----------|--------|
| Ledger immutability | Triggers `trg_ledger_no_update`, `trg_ledger_no_delete` | `prisma/manual/001_constraints.sql` |
| Guest checkout | CHECK `chk_guest_order_email` | `prisma/manual/001_constraints.sql` |
| Agent delete protection | FK `ledger_entries.agent_id` → `agents.id` ON DELETE RESTRICT | Prisma migration |
| Order delete protection | FK `order_items.order_id`, `card_records.order_item_id` ON DELETE RESTRICT | Prisma migration |
| Payment reference uniqueness | UNIQUE on `payments.payment_reference` | Prisma migration |
| Agent request idempotency | UNIQUE on `(orders.agent_id, orders.agent_request_id)` | Prisma migration |
| Soft delete | Column `deleted_at` updatable; financial rows protected by FK RESTRICT | Phase 1A.2 + migration |

---

## Cleanup

- Full transaction rolled back at end of script.
- No `phase1c-*` users, orders, payments, or ledger rows remain in the database after a successful run.

---

## Conclusion

All six integrity test groups behave as designed. The database enforces:

1. Append-only ledger (trigger-level block on UPDATE/DELETE)
2. Guest orders require email when `is_guest_order = true`
3. RESTRICT FKs prevent deleting agents with ledger history and orders with child records
4. Unique payment references and agent request IDs
5. Soft delete via `deleted_at` while physical deletion of linked financial data is blocked

**Phase 1C: COMPLETE — FULL PASS**

Next phase (not started): backend application layer.
