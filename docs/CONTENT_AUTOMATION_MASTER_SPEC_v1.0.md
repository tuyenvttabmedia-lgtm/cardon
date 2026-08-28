# MASTER SPEC v1.0 — Content Automation / AI Content System

**Project:** CardOn.vn  
**Version:** 1.0  
**Status:** Implementation Contract — **FROZEN**  
**Last updated:** 2026-08-27  
**Supersedes:** `CONTENT_AUTOMATION_MASTER_SPEC_v0.2.md`  
**Amendments merged:** `CONTENT_AUTOMATION_SPEC_PATCH_v0.2.1.md`  
**Next step:** M1 Foundation (implementation permitted)

---

## 0. DOCUMENT STATUS

### Purpose

Implementation contract for Content Automation on CardOn:

- AI-assisted content planning, outline, writing, and quality review
- Integration with existing CMS (`CmsPage`, `CmsSeo`, TipTap editor)
- **Zero regression** on production CMS, Order, Payment, Product, Public Website

### Audience

Product owner · Backend implementers · Admin frontend · Code reviewers

### Version history

| Version | Date | Change |
|---------|------|--------|
| 0.2 | 2026-08-27 | Initial architecture contract |
| 0.2.1 | 2026-08-27 | Patch: cms_page_id no-FK, generation_epoch, idempotency |
| **1.0** | 2026-08-27 | **Frozen** — merged patch; Implementation Readiness PASS |

### References

- `docs/13_SEO_CMS.md`
- `docs/14_AUTH_RBAC.md`
- `docs/CONTENT_AUTOMATION_SPEC_PATCH_v0.2.1.md` (historical amendment log)

---

## FROZEN CONTRACTS REGISTRY

> Contracts below are **immutable** for MVP implementation. Change requires new spec version + owner approval.

| Contract ID | Section | Frozen artifact | Change policy |
|-------------|---------|-----------------|---------------|
| **FC-SAFETY** | §1 | SC-01 → SC-15 | New spec version only |
| **FC-DB** | §7 | 3 tables; 0 ALTER existing; `cms_page_id` no FK; `generation_epoch` | New spec version only |
| **FC-STATE** | §8 | Plan 9 states; AI Run 5 states; APPROVED ≠ PUBLISHED | New spec version only |
| **FC-ARTICLE** | §11 | ArticleDocument v1.0 schema + block whitelist | v1.1 for new blocks |
| **FC-IDEMPOTENCY** | §15 | Job keys + CMS draft idempotency | New spec version only |
| **FC-API** | §17 | `/admin/content-automation/*` endpoints | Additive endpoints OK; breaking = v2 |
| **FC-QUEUE** | §15 | `content_automation_queue` config | Tune limits in M6 with doc update |
| **FC-CMS-ADAPTER** | §14 | Adapter-only; poll publish sync; no CmsService edits | New spec version only |
| **FC-FLAG** | §22 | `CONTENT_AUTOMATION_ENABLED=false` default | Env-only |
| **FC-ROLLBACK** | §23 | Flag OFF first | Operational runbook |

---

## 1. IMMUTABLE SAFETY CONSTRAINTS

> **CONTRACT FC-SAFETY:** All implementation MUST comply. Violations → STOP + owner approval.

| ID | Constraint |
|----|------------|
| **SC-01** | Existing production behavior unchanged for CMS, Product, Variant, Order, Payment, Auth, Media, SEO, Public Website, Admin (non-automation), existing queues/workers/cron jobs. |
| **SC-02** | No ALTER on existing production tables. MVP adds ONLY: `content_plans`, `ai_runs`, `ai_prompt_templates`. No AI fields on `cms_pages`. |
| **SC-03** | No change to existing API contracts. Namespace: `/admin/content-automation/*`. |
| **SC-04** | No change to existing queue behavior. Dedicated `content_automation_queue`. |
| **SC-05** | CMS via `ContentAutomationCmsAdapter` → `CmsService` only. No `CmsService` edits. |
| **SC-06** | No new editor; no TipTap refactor. ArticleDocument → Renderer → HTML → sanitize → CMS editor. |
| **SC-07** | AI never publishes directly. Human Review → CMS Draft → CMS Publish → Public. |
| **SC-08** | AI worker: generate/validate/save plan data only. No publish, no Order/Payment/Product writes. |
| **SC-09** | `CONTENT_AUTOMATION_ENABLED=false` default. |
| **SC-10** | Rollback automation without full app rollback. |
| **SC-11** | Change budget: 0 ALTER existing tables; ≤8 existing files modified (upper bound). |
| **SC-12** | Dependency: Content Automation → existing modules only. Reverse forbidden. |
| **SC-13** | Commercial facts from backend only. |
| **SC-14** | AI outputs `targetPageId` only; backend resolves URL. |
| **SC-15** | No secrets in logs; bounded AI I/O storage. |

---

## 2. CHANGE IMPACT MATRIX

| Existing Module | Read | Write | Modify | Risk |
|-----------------|-----:|------:|-------:|------|
| CMS | ✓ | ✓ | ✗ | Low |
| Product | ✓ | ✗ | ✗ | Low |
| SEO | ✓ | ✓ | ✗ | Low |
| Media | ✓ | ✗* | ✗ | Low |
| Queue | ✓ | ✓ | ✓ | Low |
| Worker | ✓ | ✓ | ✓ | Low |
| Auth | ✓ | ✗ | ✗ | None |
| Public Website | ✗ | ✗ | ✗ | None |
| Order / Payment | ✗ | ✗ | ✗ | None |
| Settings | ✓ | ✓ | ✗ | Low |

---

## 3. FORBIDDEN CHANGE LIST

### MUST NOT modify (business logic)

`cms.service.ts`, `cms.repository.ts`, `cms-public.controller.ts`, `cms-public.mapper.ts`, `cms-scheduled-publish-cron.service.ts`, `cms-editor/**`, `apps/web/**`, `order/**`, `payment/**`, `provider/**`, existing queue workers.

### MUST NOT ALTER tables

All existing production tables including `cms_pages`, `cms_seo`, `products`, `product_variants`, Order/Payment/Agent/Auth.

### EXCEPTION LIST (existing files — max 8)

| File | Class | Required |
|------|-------|----------|
| `src/app.module.ts` | A | Yes |
| `src/worker.module.ts` | A | Yes |
| `src/queue/queue.constants.ts` | A | Yes |
| `prisma/schema.prisma` | A | Yes |
| `prisma/seed.mjs` | B | Optional |
| `queue-monitor/queue-config.constants.ts` | B | Optional |
| `apps/admin/lib/permissions.ts` | B | Optional |
| `apps/admin/lib/i18n/vi.ts` | B | Optional |

---

## 4. MVP SCOPE

1. Content Plan · 2. Intelligence · 3. Search Intent · 4. Content Type · 5. Brand Context · 6. Fact Context · 7. AI Outline · 8. AI Article · 9. ArticleDocument · 10. Quality Gate · 11. Internal Linking · 12. AI Run · 13. Queue/Worker · 14. Human Review · 15. CMS Draft · 16. Publish Sync · 17. Feature Flag · 18. Audit/Logging

**Actions:** `CREATE` + `IGNORE` enforced. `UPDATE`/`MERGE` = recommendations only.

---

## 5. EXPLICITLY OUT OF MVP

Web research · GSC/GA · Embeddings/Vector DB · Auto keyword discovery · Auto publish · ContentOpportunity entity · ContentPlanRevision table · Image AI · Multi-provider · Prompt admin UI · AI chatbot · MERGE/UPDATE workflows · Global CMS sanitize · CMS publish hooks

---

## 6. CORE WORKFLOW

```
Create Plan (DRAFT)
  → Analyze (async) → PLANNED
  → Generate Outline (async) → OUTLINE_READY
  → Approve Outline → OUTLINE_APPROVED
  → Generate Article (async) → CONTENT_READY
  → Quality Gate → IN_REVIEW
  → Approve Content → APPROVED
  → Create CMS Draft (sync, idempotent) → cms_page_id set
  → Existing CMS Editor → Publish
  → Publish Sync (poll 60s) → Plan PUBLISHED
```

---

## 7. DATA MODEL — FC-DB FROZEN

### 7.1 `content_plans`

| Column | Type | Notes |
|--------|------|-------|
| `id` | UUID PK | |
| `status` | `ContentPlanStatus` | §8 |
| `action` | `ContentPlanAction` | CREATE \| IGNORE enforced MVP |
| `generation_epoch` | INT NOT NULL DEFAULT 0 | **Idempotency counter** — §15 |
| `source_type` | VARCHAR | Default `'MANUAL'` |
| `source_ref_id` | UUID nullable | No FK MVP |
| `topic` | VARCHAR | |
| `primary_keyword` | VARCHAR | |
| `search_intent` | `ContentPlanSearchIntent` | |
| `content_type` | `ContentPlanContentType` | |
| `audience` | VARCHAR nullable | |
| `business_objective` | VARCHAR nullable | |
| `priority` | VARCHAR | HIGH \| MEDIUM \| LOW |
| `suggested_title` | VARCHAR nullable | |
| `intelligence_snapshot` | JSON nullable | |
| `outline` | JSON nullable | |
| `article_document` | JSON nullable | ArticleDocument v1 |
| `quality_report` | JSON nullable | |
| `references` | JSON nullable | Admin notes only |
| `cms_page_id` | UUID nullable UNIQUE | **Logical ref only — NO FK** |
| `target_page_id` | UUID nullable | Logical ref; no FK |
| `created_by_id` | UUID FK | → `users.id` |
| `outline_approved_at` | TIMESTAMPTZ nullable | |
| `content_approved_at` | TIMESTAMPTZ nullable | |
| `published_at` | TIMESTAMPTZ nullable | |
| `created_at` | TIMESTAMPTZ | |
| `updated_at` | TIMESTAMPTZ | |

**Indexes:** `(status)`, `(created_by_id)`, `(primary_keyword)`, `(cms_page_id)`.

#### `cms_page_id` — logical reference (no FK)

- No `@relation` to `cms_pages`
- Integrity via `CmsService.getPage()` at runtime
- If page missing → clear `cms_page_id`, surface diagnostic

### 7.2 `ai_runs`

| Column | Type | Notes |
|--------|------|-------|
| `id` | UUID PK | |
| `content_plan_id` | UUID FK | → `content_plans` ON DELETE CASCADE |
| `task` | `AiTaskType` | |
| `generation_epoch` | INT NOT NULL DEFAULT 0 | Copied from plan at enqueue |
| `provider` | VARCHAR | |
| `model` | VARCHAR | |
| `prompt_version` | VARCHAR | |
| `status` | `AiRunStatus` | |
| `input_hash` | VARCHAR nullable | |
| `context_refs` | JSON nullable | IDs only |
| `input_snapshot` | JSON nullable | Omit or ≤8KB |
| `output_snapshot` | JSON nullable | ≤500KB |
| `tokens_in` | INT nullable | |
| `tokens_out` | INT nullable | |
| `cost_usd` | DECIMAL nullable | |
| `duration_ms` | INT nullable | |
| `error` | TEXT nullable | Sanitized |
| `created_at` | TIMESTAMPTZ | |
| `finished_at` | TIMESTAMPTZ nullable | |

**Indexes:** `(content_plan_id, created_at DESC)`, `(content_plan_id, task, generation_epoch)`, `(status)`.

**Application rule:** At most one `SUCCEEDED` run per `(content_plan_id, task, generation_epoch)`.

### 7.3 `ai_prompt_templates`

| Column | Type | Notes |
|--------|------|-------|
| `id` | UUID PK | |
| `key` | VARCHAR | |
| `version` | VARCHAR | |
| `content` | TEXT | |
| `is_active` | BOOLEAN | |
| `created_at` | TIMESTAMPTZ | |
| `updated_at` | TIMESTAMPTZ | |

**Unique:** `(key, version)`.

### 7.4 Enums — FC-STATE

```text
ContentPlanStatus:
  DRAFT | PLANNED | OUTLINE_READY | OUTLINE_APPROVED | CONTENT_READY
  | IN_REVIEW | APPROVED | PUBLISHED | ARCHIVED

ContentPlanAction: CREATE | UPDATE | MERGE | IGNORE

ContentPlanSearchIntent:
  INFORMATIONAL | NAVIGATIONAL | COMMERCIAL | TRANSACTIONAL | TROUBLESHOOTING

ContentPlanContentType:
  GUIDE | TUTORIAL | TROUBLESHOOTING | COMPARISON | EXPLAINER
  | PROMOTION | PRODUCT | NEWS | FAQ

AiRunStatus: QUEUED | RUNNING | SUCCEEDED | FAILED | CANCELLED

AiTaskType: ANALYZE | OUTLINE | WRITE | QUALITY_CHECK | REGENERATE_SECTION
```

### 7.5 Reused entities (no schema change)

`cms_pages`, `cms_seo`, `products`, `product_variants`, `product_categories`, `cms_banners`, `system_settings`, `users`.

---

## 8. STATE MACHINES — FC-STATE FROZEN

### 8.1 ContentPlan transitions

AI activity is **not** a plan status — use `ai_runs.status`.

| From | Event | To |
|------|-------|-----|
| — | create | `DRAFT` |
| `DRAFT` | analyze success | `PLANNED` |
| `DRAFT` | analyze fail | `DRAFT` |
| `DRAFT` | IGNORE | `ARCHIVED` |
| `PLANNED` | outline success | `OUTLINE_READY` |
| `OUTLINE_READY` | approve-outline | `OUTLINE_APPROVED` |
| `OUTLINE_READY` | reject | `PLANNED` (+epoch bump before re-outline) |
| `OUTLINE_APPROVED` | write success + L1/L2 pass | `CONTENT_READY` |
| `CONTENT_READY` | start review | `IN_REVIEW` |
| `IN_REVIEW` | approve | `APPROVED` |
| `IN_REVIEW` | reject re-write | `OUTLINE_APPROVED` (+epoch bump) |
| `IN_REVIEW` | reject re-outline | `PLANNED` (+epoch bump) |
| `APPROVED` | create-cms-draft | `APPROVED` (cms_page_id) |
| `APPROVED` | publish sync | `PUBLISHED` |
| `*` | archive | `ARCHIVED` |

**Invariant:** `APPROVED` ≠ `PUBLISHED` until CMS `status=PUBLISHED`.

### 8.2 `generation_epoch` bump events

Increment **before** enqueue in same transaction:

- Re-outline from `PLANNED`
- Re-write from `OUTLINE_APPROVED`
- Any `POST /regenerate`

Do **not** increment: first analyze/outline/write, FAILED retry same generation, BullMQ retry.

### 8.3 AI Run transitions

`QUEUED` → `RUNNING` → `SUCCEEDED` | `FAILED` | `CANCELLED`

Plan never becomes `FAILED`.

### 8.4 CMS status (read-only)

Automation creates/updates `DRAFT` only. Publish via existing CMS UI.

---

## 9. AI ARCHITECTURE

```
Controller → QueueProducer → Worker → Orchestrator → PromptComposer
  → ProviderRouter (1 provider MVP) → Validator/QualityGate → Repositories
```

- Provider + model: `system_settings` key `content.ai` (encrypted)
- Orchestrator never calls `publishPage`
- **Job idempotency key:** `{planId}:{task}:{generationEpoch}` (§15)

| Setting | Value |
|---------|-------|
| attempts | 2 |
| backoff | exponential 10s |
| timeout | 180s |
| concurrency | 1 |

---

## 10. CONTEXT PIPELINE

In-memory `GenerationContext` — no DB entity.

Includes: plan, SEO settings, existing content (max 10), factContext, brandContext (templates), link candidates (max 20), admin references.

Jobs re-fetch facts + links at runtime; snapshot is UI-only.

---

## 11. ARTICLE DOCUMENT — FC-ARTICLE FROZEN

### schemaVersion: `"1.0"`

```json
{
  "schemaVersion": "1.0",
  "title": "string",
  "excerpt": "string?",
  "seo": {
    "metaTitle": "string",
    "metaDescription": "string",
    "focusKeyword": "string",
    "canonicalUrl": "string?",
    "robots": "index,follow"
  },
  "sections": [],
  "factRefs": [],
  "internalLinks": [
    { "sectionId": "string", "targetPageId": "uuid", "anchorText": "string", "validated": false }
  ],
  "qualityFlags": []
}
```

### Blocks (MVP)

`paragraph`, `h2`, `h3`, `ul`, `ol`, `blockquote`, `table`, `image`, `internalLink`, `faq`, `callout`

**Forbidden:** `h1` in body; arbitrary HTML; AI-generated `href` for internal links.

### Pipeline

Validator (Zod) → Renderer → `sanitizeCmsHtml` → Adapter → `CmsService`

Tags ⊆ `CMS_ALLOWED_HTML_TAGS`. No `cms-block-*` for blog MVP.

---

## 12. QUALITY GATE

**Layer 1 (HARD):** Schema, blocks, lengths, no h1  
**Layer 2 (HARD):** keyword, links, facts, slug/title collision, FACT_UNVERIFIED blocks APPROVED  
**Layer 3 (SOFT):** SEO diagnostics — no auto-approve

Required before `create-cms-draft`: Layer 1 + 2 pass.

---

## 13. INTERNAL LINKING

AI: `targetPageId`, `anchorText`, `reason`, `confidence` — no `href`.

Backend `CmsPublicPathResolver` aligned with `apps/web/lib/routes.ts`:

```text
/tin-tuc/{categorySlug}/{slug}  |  /{slug}  |  /tin-tuc/{categorySlug}
```

Validate: exists, PUBLISHED (blog), not self-link.

---

## 14. CMS INTEGRATION — FC-CMS-ADAPTER FROZEN

### Adapter → `CmsService` only

`createBlogDraft`, `updateBlogDraft`, `getPageSnapshot` — no CMS file changes.

### Publish sync

`ContentPlanPublishSyncService` — poll 60s, flag-guarded.  
Query `APPROVED` + `cms_page_id` → `getPage` → if PUBLISHED → plan `PUBLISHED`.  
**No webhook. No CmsService hook.**

### create-cms-draft — FC-IDEMPOTENCY

**`POST /plans/:id/create-cms-draft`** — sync, API-only (worker forbidden).

**Body:** `{ force?: boolean }` default `false`

| cms_page_id | force | CMS state | Result |
|-------------|-------|-----------|--------|
| null | false | — | 201 create DRAFT |
| set | false | exists | 200 `{ cmsPageId, created: false }` |
| set | false | missing | 201 create new |
| set | true | DRAFT | 200 update draft |
| set | true | PUBLISHED/ARCHIVED | 409 |

**Concurrency:** `SELECT FOR UPDATE` on plan row.  
**Slug conflict:** 409 `SLUG_CONFLICT`, plan stays APPROVED.

---

## 15. QUEUE & IDEMPOTENCY — FC-QUEUE + FC-IDEMPOTENCY FROZEN

### Queue: `content_automation_queue`

| Job | Task |
|-----|------|
| ANALYZE | ANALYZE |
| GENERATE_OUTLINE | OUTLINE |
| GENERATE_ARTICLE | WRITE |
| REGENERATE_SECTION | REGENERATE_SECTION |
| QUALITY_CHECK | QUALITY_CHECK |

```text
attempts: 2 | backoff: exponential 10s | timeout: 180000 | concurrency: 1
```

### AI job idempotency

```text
idempotencyKey = {planId}:{task}:{generationEpoch}
bullmqJobId    = content-{planId}-{task}-{generationEpoch}
```

| Condition | HTTP |
|-----------|------|
| No active run for key | 202 enqueue |
| QUEUED/RUNNING same key | 409 |
| SUCCEEDED same key | 200 reused, no AI call |
| FAILED same key | 202 retry allowed |

### Worker guards

1. Epoch match or CANCELLED  
2. SUCCEEDED exists → no-op  
3. Plan status compatible  
4. Write with `WHERE generation_epoch = :epoch`

### Feature flag OFF

Producer 503; worker not registered; no sync cron.

---

## 16. AI RUN STORAGE

| Field | Policy |
|-------|--------|
| input_hash | Always |
| context_refs | IDs only |
| input_snapshot | Omit or ≤8KB |
| output_snapshot | ≤500KB |
| error | No secrets |

Retention: 90d full output → null snapshots; failed 30d.

---

## 17. API CONTRACT — FC-API FROZEN

**Base:** `/admin/content-automation`  
**Auth:** `cms.manage`  
**Flag OFF:** 503

| Method | Path | Async | Notes |
|--------|------|-------|-------|
| POST | `/plans` | Sync | Create DRAFT plan |
| GET | `/plans` | Sync | List |
| GET | `/plans/:id` | Sync | Detail |
| PATCH | `/plans/:id` | Sync | Metadata |
| POST | `/plans/:id/analyze` | **Async** | 202 |
| POST | `/plans/:id/generate-outline` | **Async** | 202; may bump epoch |
| POST | `/plans/:id/approve-outline` | Sync | |
| POST | `/plans/:id/generate-article` | **Async** | 202 |
| POST | `/plans/:id/regenerate` | **Async** | bumps epoch |
| POST | `/plans/:id/run-quality-gate` | Sync | |
| POST | `/plans/:id/approve-content` | Sync | → APPROVED |
| POST | `/plans/:id/reject-content` | Sync | |
| POST | `/plans/:id/create-cms-draft` | Sync | Idempotent §14 |
| GET | `/plans/:id/preview` | Sync | HTML preview |
| GET | `/ai-runs` | Sync | |
| GET | `/ai-runs/:id` | Sync | |
| GET | `/internal-link-candidates` | Sync | |
| GET | `/status` | Sync | |

AI generation endpoints return **HTTP 202** with `{ jobId, aiRunId }` (or 200 reused).

---

## 18. ADMIN UI

Routes: `/marketing/content-plans/**` (new).  
Tabs: Overview, Intelligence, Outline, Article, Quality, AI Runs.  
Preview read-only; "Open in CMS Editor" deep link. No new TipTap.

---

## 19. SECURITY / PERMISSION

`cms.manage` for all automation endpoints.  
AI key in `content.ai` settings (encrypted).  
Rate limit: 10 AI jobs / plan / hour.

---

## 20. ERROR HANDLING

Errors contained in content-automation — never propagate to Order/Payment.  
AI/plan failures do not change CMS. See v0.2 §20 matrix (unchanged).

---

## 21. TESTING

**New unit:** ArticleDocument, renderer, idempotency keys, epoch bump, state machine, quality gate, path resolver, CMS draft idempotency table.

**New integration:** mock provider, queue worker, adapter.

**Regression (unchanged):** `cms.service.publish.spec`, `cms.security.spec`, public mapper, existing workers/cron.

---

## 22. DEPLOYMENT — FC-FLAG FROZEN

1. Migration (3 tables)  
2. Deploy API + worker, **flag OFF**  
3. Admin UI  
4. Seed prompts  
5. Configure `content.ai`  
6. Regression smoke flag OFF  
7. Enable staging → E2E → prod

```text
CONTENT_AUTOMATION_ENABLED=false  # default
```

---

## 23. ROLLBACK — FC-ROLLBACK FROZEN

1. `CONTENT_AUTOMATION_ENABLED=false` + restart  
2. Optional pause `content_automation_queue`  
3. CMS/queues continue  
4. Drop 3 tables only if needed — never touch existing tables

---

## 24. IMPLEMENTATION MILESTONES

| Milestone | Scope | Gate |
|-----------|-------|------|
| **M1** | Module scaffold, migration (§7 schema), feature flag | v1.0 frozen |
| **M2** | Plan CRUD, analyze, admin list UI | |
| **M3** | AI orchestrator, queue, outline/write | Provider TBD — config only |
| **M4** | ArticleDocument, renderer, quality, preview | |
| **M5** | CMS adapter, create-cms-draft idempotency, publish sync, detail UI | §14 |
| **M6** | Retention, rate limits, hardening | |

---

## 25. FILE IMPACT

### NEW (module)

`src/modules/content-automation/**` (~25 files)  
`apps/admin/app/marketing/content-plans/**`  
`apps/admin/services/content-automation-api.ts`

### EXISTING MODIFY (required: 4)

`app.module.ts`, `worker.module.ts`, `queue.constants.ts`, `prisma/schema.prisma`

### FORBIDDEN

`cms.service.ts`, `cms-public.*`, `cms-editor/**`, `apps/web/**`, order/payment/provider workers

---

## 26. FINAL IMPLEMENTATION CONTRACT

- [x] SC-01–SC-15 satisfied
- [x] Change budget satisfied
- [x] No existing DB alteration
- [x] No existing API behavior change
- [x] No existing queue behavior change
- [x] No public behavior change
- [x] CMS isolated (adapter + poll sync)
- [x] AI worker isolated
- [x] Feature flag default OFF
- [x] Rollback documented
- [x] Regression tests defined
- [x] MVP scope respected
- [x] Out-of-scope excluded
- [x] ArticleDocument v1 frozen
- [x] State machines frozen
- [x] API contract frozen
- [x] Idempotency contract frozen (§15, §14)
- [x] `cms_page_id` no-FK frozen (§7)
- [x] `generation_epoch` frozen (§7, §8)

**Status: CLEARED FOR IMPLEMENTATION (M1+)**

---

## APPENDIX A — Intelligence Snapshot v1

```json
{
  "version": "1",
  "analyzedAt": "ISO8601",
  "input": { "topic": "", "primaryKeyword": "" },
  "relatedContent": [{ "pageId": "", "title": "", "similarityScore": 0, "reason": "" }],
  "cannibalization": { "risk": "NONE|LOW|HIGH", "matches": [] },
  "recommendations": [{ "action": "CREATE|UPDATE|MERGE|IGNORE", "pageId": null, "confidence": 0, "reason": "" }],
  "internalLinkCandidates": [{ "pageId": "", "title": "", "relevanceScore": 0 }]
}
```

## APPENDIX B — FactRef

```json
{
  "refId": "fact-1",
  "type": "product_variant",
  "sourceId": "uuid",
  "snapshot": {
    "productName": "", "variantName": "", "faceValueVnd": "",
    "sellPriceVnd": "", "sku": "", "status": "ACTIVE"
  }
}
```

Never: `providerCost`, agent pricing, credentials.

## APPENDIX C — Public Path Resolution

```text
blogPostPath(categorySlug, slug):
  categorySlug ? `/tin-tuc/${categorySlug}/${slug}` : `/${slug}`
```

## APPENDIX D — Idempotency Quick Reference (FC-IDEMPOTENCY)

| Operation | Key / rule |
|-----------|------------|
| AI job | `content-{planId}-{task}-{generationEpoch}` |
| Epoch bump | re-outline, re-write, regenerate |
| CMS draft default | 200 reuse if `cms_page_id` set |
| CMS draft force | update DRAFT only |
| Worker | no createPage |
| Concurrent create | plan row lock |

---

*End of MASTER SPEC v1.0 — FROZEN*
