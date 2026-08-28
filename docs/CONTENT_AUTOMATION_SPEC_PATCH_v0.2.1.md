# Content Automation — Spec Patch v0.2.1

**Applies to:** `CONTENT_AUTOMATION_MASTER_SPEC_v0.2.md`  
**Merged into:** `CONTENT_AUTOMATION_MASTER_SPEC_v1.0.md`  
**Date:** 2026-08-27  
**Type:** Contract amendment only — no architecture change, no new features

---

## Purpose

Resolve **3 P1 blockers** identified in Final Implementation Readiness Review before M1 migration.

| # | Blocker | Milestone gate |
|---|---------|----------------|
| P1-1 | `cms_page_id` logical reference — **no FK** to `cms_pages` | M1 migration |
| P1-2 | `generation_epoch` + AI job idempotency contract | M1 migration |
| P1-3 | CMS `create-cms-draft` idempotency contract | M5 implementation |

---

## P1-1 — `cms_page_id` Logical Reference (No FK)

### Decision

`content_plans.cms_page_id` is a **logical UUID reference** to a CMS page.  
**No Prisma `@relation`**. **No database FK constraint** to `cms_pages`.

### Rationale

- Lowest coupling with existing CMS schema (SC-02, SC-05)
- CMS page delete/archive does not cascade or block plan rows
- Automation migration rollback does not touch `cms_pages` constraints
- Integrity enforced at runtime via `CmsService.getPage(cms_page_id)` in adapter

### Schema (replaces v0.2 §7.1 line for `cms_page_id`)

| Column | Type | Notes |
|--------|------|-------|
| `cms_page_id` | UUID nullable **UNIQUE** | Logical ref to `cms_pages.id`. **No FK.** |

### Runtime rules

1. On `create-cms-draft` success → set `cms_page_id` to returned page id
2. Before any operation using `cms_page_id` → `getPage(id)`; if not found → clear `cms_page_id` + flag plan `cms_draft_missing` in quality_report metadata (diagnostic only)
3. Unique constraint prevents two plans linking same draft page id

### Unchanged

- No columns added to `cms_pages`
- CMS module unaware of content plans

---

## P1-2 — `generation_epoch` + AI Job Idempotency

### Decision

Add `generation_epoch` on `content_plans` as the **canonical idempotency generation counter**.

### Schema addition

| Table | Column | Type | Notes |
|-------|--------|------|-------|
| `content_plans` | `generation_epoch` | INT NOT NULL DEFAULT 0 | Incremented on explicit regen / reject-to-regenerate |
| `ai_runs` | `generation_epoch` | INT NOT NULL DEFAULT 0 | Snapshot of plan epoch when run started |

**Index (ai_runs):** `(content_plan_id, task, generation_epoch)`.

### When `generation_epoch` increments

| Event | Increment? |
|-------|------------|
| Plan created | No (stays 0) |
| Analyze success | No |
| Outline success | No |
| Reject outline → re-outline (`POST generate-outline` from `PLANNED`) | **Yes** (+1) |
| Reject content → re-write (`POST generate-article` from `OUTLINE_APPROVED`) | **Yes** (+1) |
| `POST /regenerate` (any target) | **Yes** (+1) |
| Retry after FAILED (same generation) | No |
| Worker BullMQ retry (same job) | No |

Increment MUST occur **before** enqueue, in same DB transaction as job creation.

### Logical idempotency key

```text
idempotencyKey = {planId}:{task}:{generationEpoch}
bullmqJobId    = content-{planId}-{task}-{generationEpoch}
```

Replace v0.2 §9 / §15 `contentVersion` / `attemptKey` with `generationEpoch` everywhere.

### API behavior — enqueue

| Condition | HTTP | Body |
|-----------|------|------|
| No active run for same `idempotencyKey` | 202 | `{ jobId, aiRunId }` |
| Run `QUEUED` or `RUNNING` for same key | 409 | `{ error: 'JOB_ALREADY_ACTIVE', aiRunId }` |
| Run `SUCCEEDED` for same key | 200 | `{ jobId, aiRunId, reused: true }` — **no re-enqueue, no AI call** |
| Run `FAILED` for same key | 202 | Allow new enqueue (retry); may reuse failed ai_run row or create new |

### Worker idempotency (at-most-once side effects)

Before AI provider call:

1. Load plan; verify `plan.generation_epoch === job.generation_epoch`
2. If ai_run already `SUCCEEDED` for same key → exit success (no-op)
3. If plan status incompatible with task → fail run, do not mutate plan

After AI success:

1. Write output in transaction with `WHERE generation_epoch = :epoch` optimistic check
2. If epoch changed mid-flight → mark run `CANCELLED`, do not overwrite plan artifacts

### Race condition matrix

| Scenario | Expected behavior |
|----------|-------------------|
| Double-click Generate | Second request → 409 (active) or 200 reused (succeeded) |
| Retry after FAILED | Same epoch → new run allowed; overwrites output if success |
| Worker timeout + BullMQ retry | Same jobId → worker no-op if SUCCEEDED; else retry AI |
| Worker restart mid-job | Re-delivery: epoch check + SUCCEEDED check prevent duplicate AI cost |
| Concurrent different tasks (OUTLINE + WRITE) | Allowed — different task in key |
| Regen bumps epoch while old job running | Old job completes → epoch mismatch → CANCELLED, no plan overwrite |

### ai_runs uniqueness (application-level)

At most **one SUCCEEDED** run per `(content_plan_id, task, generation_epoch)`.  
Multiple FAILED rows allowed for audit.

---

## P1-3 — CMS `create-cms-draft` Idempotency

### Decision

`POST /plans/:id/create-cms-draft` is **idempotent by default**.

### Request body

```typescript
{
  force?: boolean;  // default false
}
```

### Preconditions (unchanged)

- Plan `status === APPROVED`
- `action === CREATE`
- Quality Gate Layer 1 + 2 pass
- `article_document` present

### Behavior table

| `cms_page_id` | `force` | CMS page state | HTTP | Action |
|---------------|---------|----------------|------|--------|
| null | false | — | 201 | `createPage` DRAFT → set `cms_page_id` |
| set | false | DRAFT exists | 200 | Return existing `{ cmsPageId, created: false }` |
| set | false | PUBLISHED exists | 200 | Return existing `{ cmsPageId, created: false }` — plan stays APPROVED until sync → PUBLISHED |
| set | false | not found | 201 | Clear stale id, `createPage` new DRAFT |
| set | true | DRAFT | 200 | `updatePage` with rendered HTML/seo from current `article_document` |
| set | true | PUBLISHED | 409 | `CMS_PAGE_ALREADY_PUBLISHED` — use CMS editor |
| set | true | ARCHIVED | 409 | `CMS_PAGE_NOT_EDITABLE` |
| null | true | — | 201 | Same as first row |

### Concurrent double-create

1. Row-level lock on `content_plans` (SELECT FOR UPDATE) for duration of operation
2. Unique `cms_page_id` on plan table prevents two plans sharing one draft
3. Second concurrent request after first set id → 200 reused

### Slug collision on create

- If `createPage` throws slug conflict → 409 `SLUG_CONFLICT` with suggested suffix; plan stays `APPROVED`, `cms_page_id` unset

### Worker boundary (SC-08)

`create-cms-draft` is **API-only (sync)**. AI worker MUST NOT call this endpoint or `CmsService.createPage`.

---

## Supersedes (v0.2 sections)

| v0.2 reference | v0.2.1 change |
|----------------|---------------|
| §7.1 `cms_page_id` FK | Removed — logical ref only |
| §9 Idempotent jobId `attemptKey` | → `generationEpoch` |
| §15 Idempotency `contentVersion` | → `generationEpoch` |
| §14 create-cms-draft | + idempotency rules §P1-3 |

---

## Verification

- [x] No architecture change
- [x] No new MVP features
- [x] SC-01–SC-15 still satisfied
- [x] Existing tables still 0 ALTER
- [x] Merged into MASTER SPEC v1.0

---

*End of Spec Patch v0.2.1*
