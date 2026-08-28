# MASTER SPEC v0.2 — Content Automation / AI Content System

**Project:** CardOn.vn  
**Version:** 0.2  
**Status:** Architecture Contract / Pre-Implementation  
**Last updated:** 2026-08-27  
**Next step:** Implementation Readiness Review (no coding until checklist §26 passes)

---

## 0. DOCUMENT STATUS

### Purpose

Define the implementation contract for Content Automation on CardOn:

- AI-assisted content planning, outline, writing, and quality review
- Integration with existing CMS (`CmsPage`, `CmsSeo`, TipTap editor)
- **Zero regression** on production CMS, Order, Payment, Product, Public Website

### Audience

- Product owner
- Backend / admin frontend implementers
- Reviewers performing Implementation Readiness Review

### Non-goals (this document)

- No code, migration, or refactor in this phase
- No implementation file creation until §26 checklist passes

### References

- `docs/13_SEO_CMS.md` — CMS data model and SEO
- `docs/14_AUTH_RBAC.md` — permissions
- Architecture reviews: Content Intelligence, Safety/Isolation Review (2026-08-27)

---

## 1. IMMUTABLE SAFETY CONSTRAINTS

> **CONTRACT:** All implementation MUST comply. Violations require STOP + owner approval before continuing.

| ID | Constraint |
|----|------------|
| **SC-01** | Existing production behavior unchanged for CMS, Product, Variant, Order, Payment, Auth, Media, SEO, Public Website, Admin (non-automation), existing queues/workers/cron jobs. Content Automation failure MUST NOT break these modules. |
| **SC-02** | No ALTER on existing production tables unless unavoidable and approved. MVP adds ONLY: `content_plans`, `ai_runs`, `ai_prompt_templates`. No AI fields on `cms_pages`. |
| **SC-03** | No change to existing API contracts. Content Automation uses `/admin/content-automation/*` only. |
| **SC-04** | No change to existing queue behavior. Reuse BullMQ/Redis/WorkerHost; dedicated `content_automation_queue`. |
| **SC-05** | No CMS refactor for automation. Integration via `ContentAutomationCmsAdapter` → `CmsService`. Modify `CmsService` ONLY if isolation proven impossible (Exception List §3). |
| **SC-06** | No new editor; no TipTap refactor. Pipeline: ArticleDocument → Renderer → HTML → sanitize → existing CMS editor. |
| **SC-07** | AI content never publishes directly. Mandatory flow: AI → Plan → Validate → Human Review → CMS Draft → CMS Publish → Public. |
| **SC-08** | AI worker MAY generate/validate/save to plan tables. AI worker MUST NOT publish CMS, change public content, or mutate Order/Payment/Product business data. |
| **SC-09** | Feature flag `CONTENT_AUTOMATION_ENABLED=false` by default. When OFF: website, CMS, existing jobs unchanged. |
| **SC-10** | Rollback automation without rolling back entire app. Disable flag → stop new jobs → CMS remains operational. |
| **SC-11** | Change budget: existing DB tables modified = 0; public/API/queue/CMS logic behavior = 0; existing files modified ≤ 8 (upper bound, not target). Exceed budget → STOP + report. |
| **SC-12** | Dependency direction: Content Automation → existing modules. Reverse forbidden (CMS/Product/SEO MUST NOT import Content Automation). |
| **SC-13** | Commercial facts from backend only. AI MUST NOT invent price, denomination, product, variant, status, promotion, policy. |
| **SC-14** | AI outputs `targetPageId` only. Backend resolves URL. AI MUST NOT output canonical/internal URLs. |
| **SC-15** | No logging of API keys, secrets, credentials, sensitive PII. AI I/O logging size-limited. |

---

## 2. CHANGE IMPACT MATRIX

| Existing Module | Read | Write | Modify | Risk | Notes |
|-----------------|-----:|------:|-------:|------|-------|
| **CMS** | ✓ | ✓ | ✗ | Low | Read: list pages, SEO, categories. Write: `createPage`/`updatePage` DRAFT via adapter only. No CMS file changes. |
| **Product** | ✓ | ✗ | ✗ | Low | Read active products/variants for Fact Context. |
| **SEO** | ✓ | ✓ | ✗ | Low | Read site SEO settings; write per-page SEO via `CmsService` upsert on draft create (existing path). |
| **Media** | ✓ | ✗* | ✗ | Low | *Optional read `CmsMedia` URL for image blocks. MVP: manual featured image in CMS editor after draft. |
| **Queue** | ✓ | ✓ | ✓ | Low | Read infra; register new queue name only. Existing queue handlers untouched. |
| **Worker** | ✓ | ✓ | ✓ | Low | Register new worker in new module; existing workers untouched. |
| **Auth** | ✓ | ✗ | ✗ | None | Reuse JWT + `cms.manage` permission. |
| **Public Website** | ✗ | ✗ | ✗ | None | No changes. AI content reaches public only via normal CMS publish. |
| **Order** | ✗ | ✗ | ✗ | None | No interaction. |
| **Payment** | ✗ | ✗ | ✗ | None | No interaction. |
| **Settings** | ✓ | ✓ | ✗ | Low | Read/write encrypted AI config key in `system_settings` (new key only). |

---

## 3. FORBIDDEN CHANGE LIST

### Files / modules MUST NOT modify (business logic)

| Path | Reason |
|------|--------|
| `src/modules/cms/services/cms.service.ts` | SC-05 CMS isolation |
| `src/modules/cms/repositories/cms.repository.ts` | SC-05 |
| `src/modules/cms/controllers/cms-public.controller.ts` | SC-07 public isolation |
| `src/modules/cms/entities/cms-public.mapper.ts` | SC-07 |
| `src/modules/cms/services/cms-scheduled-publish-cron.service.ts` | SC-04 existing cron |
| `apps/admin/components/marketing/cms-editor/**` | SC-06 TipTap |
| `apps/web/**` | SC-07 public routes/rendering |
| `src/modules/order/**` | SC-01 |
| `src/modules/payment/**` | SC-01 |
| `src/modules/provider/**` | SC-01 |
| `src/modules/notification/workers/**` | SC-04 |
| `src/modules/provider/workers/**` | SC-04 |

### Database tables MUST NOT ALTER

- `cms_pages`, `cms_seo`, `cms_categories`, `cms_tags`, `cms_media`, `cms_banners`
- `products`, `product_variants`, `product_categories`
- All Order, Payment, Agent, Auth tables

### APIs MUST NOT change contract

- `/admin/cms/*`
- `/cms/*` (public)
- All Order, Payment, Agent APIs

### Queues MUST NOT change behavior

- `payment_queue`, `provider_queue`, `topup_queue`, `email_queue`, `reconciliation_queue`, `notification_queue`, `webhook_delivery_queue`

### Public routes MUST NOT change

- `/tin-tuc/**`, `/[slug]`, product routes — unchanged

---

### EXCEPTION LIST (existing files allowed to modify)

| File | Reason | Risk | Why unavoidable |
|------|--------|------|-----------------|
| `src/app.module.ts` | Import `ContentAutomationModule` | Low | Nest bootstrap; module inert when flag OFF |
| `src/worker.module.ts` | Import module for worker process | Low | Worker registration pattern |
| `src/queue/queue.constants.ts` | Add `content_automation_queue` | Low | BullMQ registration requires queue name |
| `prisma/schema.prisma` | ADD 3 models + enums | Low | New tables only, no ALTER existing |
| `prisma/seed.mjs` | Optional: prompt templates | Low | Dev/staging convenience |
| `src/modules/queue-monitor/entities/queue-config.constants.ts` | Optional: monitor display | None functional | Observability only |
| `apps/admin/lib/permissions.ts` | Optional: nav link | None CMS | UX entry point |
| `apps/admin/lib/i18n/vi.ts` | Optional: labels | None | UX |

**Maximum: 8 files** (SC-11). Optional items may be deferred post-MVP.

---

## 4. MVP SCOPE

| # | Capability | In MVP |
|---|------------|--------|
| 1 | Content Plan CRUD + lifecycle | ✓ |
| 2 | Content Intelligence (heuristic snapshot) | ✓ |
| 3 | Search Intent (enum, AI suggest + admin override) | ✓ |
| 4 | Content Type (enum → prompt strategy) | ✓ |
| 5 | Brand Context (prompt templates + settings) | ✓ |
| 6 | Fact Context (Product/Variant/Category/Banner/Policy links) | ✓ |
| 7 | AI Outline (async) | ✓ |
| 8 | AI Article (async) | ✓ |
| 9 | ArticleDocument JSON + validator + renderer | ✓ |
| 10 | Quality Gate (hard + diagnostic) | ✓ |
| 11 | Internal Linking (targetPageId, backend resolve) | ✓ |
| 12 | AI Run logging | ✓ |
| 13 | Queue / Worker (`content_automation_queue`) | ✓ |
| 14 | Human Review (Plan UI preview + gates) | ✓ |
| 15 | CMS Draft Integration (adapter → `CmsService.createPage`) | ✓ |
| 16 | Publish Synchronization (poll, no CMS hook) | ✓ |
| 17 | Feature Flag | ✓ |
| 18 | Audit / Logging (ai_runs + activity optional) | ✓ |

**Plan actions MVP:** `CREATE` and `IGNORE` enforced. `UPDATE` / `MERGE` appear as intelligence **recommendations only** (no workflow).

**Partial regen:** `REGENERATE_SECTION` job defined; full section regen MAY ship in M6 if time permits (schema supports it).

---

## 5. EXPLICITLY OUT OF MVP

- Web Research Engine
- GSC / Google Analytics integration
- Embeddings / Vector DB / semantic search infrastructure
- Automatic keyword discovery
- Automatic publishing
- Content Opportunity entity
- ContentPlanRevision entity (versioning via `ai_runs` + `articleDocument` on plan)
- Image AI generation
- Multi-provider routing (MVP: 1 provider, 1 default model)
- Advanced prompt management UI
- AI chatbot interface
- Automatic CMS publishing
- MERGE / UPDATE automated workflows
- Global CMS write-path sanitize refactor
- CMS `publishPage` hooks for sync

---

## 6. CORE WORKFLOW

```
┌─────────────────────────────────────────────────────────────────────────┐
│ 1. Admin creates Content Plan (topic, keyword, intent, content type)    │
└───────────────────────────────┬─────────────────────────────────────────┘
                                ▼
┌─────────────────────────────────────────────────────────────────────────┐
│ 2. POST /plans/:id/analyze (async job ANALYZE)                          │
│    → ContentIntelligenceService → intelligenceSnapshot on plan          │
│    → Admin reviews recommendations (CREATE / UPDATE* / MERGE* / IGNORE) │
│    → Admin selects action: CREATE or IGNORE                             │
└───────────────────────────────┬─────────────────────────────────────────┘
                                ▼
┌─────────────────────────────────────────────────────────────────────────┐
│ 3. POST /plans/:id/generate-outline (async OUTLINE)                     │
│    → status: OUTLINE_READY                                              │
└───────────────────────────────┬─────────────────────────────────────────┘
                                ▼
┌─────────────────────────────────────────────────────────────────────────┐
│ 4. POST /plans/:id/approve-outline → OUTLINE_APPROVED (gate)            │
└───────────────────────────────┬─────────────────────────────────────────┘
                                ▼
┌─────────────────────────────────────────────────────────────────────────┐
│ 5. POST /plans/:id/generate-article (async WRITE)                       │
│    → Context Builder (plan, facts, brand, SEO, links, existing content) │
│    → ArticleDocument → Validator → Quality Gate Layer 1+2               │
│    → status: CONTENT_READY                                              │
└───────────────────────────────┬─────────────────────────────────────────┘
                                ▼
┌─────────────────────────────────────────────────────────────────────────┐
│ 6. POST /plans/:id/run-quality-gate (sync or async QUALITY_CHECK)       │
│    → qualityReport (hard pass/fail + diagnostic scores)                 │
│    → Admin moves to IN_REVIEW                                           │
└───────────────────────────────┬─────────────────────────────────────────┘
                                ▼
┌─────────────────────────────────────────────────────────────────────────┐
│ 7. Human Review (Plan UI: preview HTML, SEO, facts, links, diagnostics) │
│    → Approve → APPROVED                                                 │
│    → Reject → OUTLINE_APPROVED (re-write) or PLANNED (re-outline)       │
└───────────────────────────────┬─────────────────────────────────────────┘
                                ▼
┌─────────────────────────────────────────────────────────────────────────┐
│ 8. POST /plans/:id/create-cms-draft (sync, admin-triggered)             │
│    → Renderer → sanitizeCmsHtml → ContentAutomationCmsAdapter           │
│    → CmsService.createPage(DRAFT, BLOG_POST) → cmsPageId set            │
└───────────────────────────────┬─────────────────────────────────────────┘
                                ▼
┌─────────────────────────────────────────────────────────────────────────┐
│ 9. Existing CMS Editor (/marketing/articles) — edit, schedule, publish │
└───────────────────────────────┬─────────────────────────────────────────┘
                                ▼
┌─────────────────────────────────────────────────────────────────────────┐
│ 10. Publish Sync Service (poll 60s, content-automation module)          │
│     → reads CmsService.getPage(cmsPageId)                               │
│     → if status=PUBLISHED → plan.status=PUBLISHED                       │
└─────────────────────────────────────────────────────────────────────────┘

* UPDATE / MERGE = recommendation text only in MVP
```

---

## 7. DATA MODEL

### 7.1 `content_plans`

| Column | Type | Notes |
|--------|------|-------|
| `id` | UUID PK | |
| `status` | `ContentPlanStatus` | See §8 |
| `action` | `ContentPlanAction` | `CREATE` \| `IGNORE` (enforce); `UPDATE`/`MERGE` stored but not workflow MVP |
| `source_type` | VARCHAR | Default `'MANUAL'`. Future: `'OPPORTUNITY'` |
| `source_ref_id` | UUID nullable | Future FK placeholder, no FK constraint MVP |
| `topic` | VARCHAR | |
| `primary_keyword` | VARCHAR | |
| `search_intent` | `ContentPlanSearchIntent` | |
| `content_type` | `ContentPlanContentType` | |
| `audience` | VARCHAR nullable | |
| `business_objective` | VARCHAR nullable | |
| `priority` | VARCHAR | `HIGH` \| `MEDIUM` \| `LOW` |
| `suggested_title` | VARCHAR nullable | |
| `intelligence_snapshot` | JSON nullable | See §1 Intelligence contract |
| `outline` | JSON nullable | AI outline structure |
| `article_document` | JSON nullable | ArticleDocument v1 |
| `quality_report` | JSON nullable | Gate results |
| `references` | JSON nullable | Admin-provided notes/URLs (not fetched) |
| `cms_page_id` | UUID nullable UNIQUE | FK → `cms_pages.id` ON DELETE SET NULL |
| `target_page_id` | UUID nullable | Future UPDATE hint; no workflow MVP |
| `created_by_id` | UUID FK | → `users.id` |
| `outline_approved_at` | TIMESTAMPTZ nullable | |
| `content_approved_at` | TIMESTAMPTZ nullable | |
| `published_at` | TIMESTAMPTZ nullable | Mirror when CMS published |
| `created_at` | TIMESTAMPTZ | |
| `updated_at` | TIMESTAMPTZ | |

**Indexes:** `(status)`, `(created_by_id)`, `(primary_keyword)`, `(cms_page_id)`.

### 7.2 `ai_runs`

| Column | Type | Notes |
|--------|------|-------|
| `id` | UUID PK | |
| `content_plan_id` | UUID FK | → `content_plans.id` ON DELETE CASCADE |
| `task` | `AiTaskType` | ANALYZE, OUTLINE, WRITE, QUALITY_CHECK, REGENERATE_SECTION |
| `provider` | VARCHAR | e.g. `openai` |
| `model` | VARCHAR | |
| `prompt_version` | VARCHAR | Composite template versions |
| `status` | `AiRunStatus` | See §8 |
| `input_hash` | VARCHAR nullable | SHA-256 of canonical input |
| `context_refs` | JSON nullable | `{ planId, productIds[], pageIds[], promptKeys[] }` |
| `input_snapshot` | JSON nullable | Truncated max 8KB or omitted MVP |
| `output_snapshot` | JSON nullable | Structured output; max ~500KB soft limit |
| `tokens_in` | INT nullable | |
| `tokens_out` | INT nullable | |
| `cost_usd` | DECIMAL nullable | |
| `duration_ms` | INT nullable | |
| `error` | TEXT nullable | Sanitized, no secrets |
| `created_at` | TIMESTAMPTZ | |
| `finished_at` | TIMESTAMPTZ nullable | |

**Indexes:** `(content_plan_id, created_at DESC)`, `(status)`.

### 7.3 `ai_prompt_templates`

| Column | Type | Notes |
|--------|------|-------|
| `id` | UUID PK | |
| `key` | VARCHAR | e.g. `brand_voice`, `task_outline`, `task_write` |
| `version` | VARCHAR | Semver string |
| `content` | TEXT | Template body |
| `is_active` | BOOLEAN | |
| `created_at` | TIMESTAMPTZ | |
| `updated_at` | TIMESTAMPTZ | |

**Unique:** `(key, version)`.

### 7.4 Enums

```text
ContentPlanStatus:
  DRAFT | PLANNED | OUTLINE_READY | OUTLINE_APPROVED | CONTENT_READY
  | IN_REVIEW | APPROVED | PUBLISHED | ARCHIVED

ContentPlanAction:
  CREATE | UPDATE | MERGE | IGNORE

ContentPlanSearchIntent:
  INFORMATIONAL | NAVIGATIONAL | COMMERCIAL | TRANSACTIONAL | TROUBLESHOOTING

ContentPlanContentType:
  GUIDE | TUTORIAL | TROUBLESHOOTING | COMPARISON | EXPLAINER
  | PROMOTION | PRODUCT | NEWS | FAQ

AiRunStatus:
  QUEUED | RUNNING | SUCCEEDED | FAILED | CANCELLED

AiTaskType:
  ANALYZE | OUTLINE | WRITE | QUALITY_CHECK | REGENERATE_SECTION
```

### 7.5 Reused entities (no schema change)

- `cms_pages`, `cms_seo` — output target
- `products`, `product_variants`, `product_categories` — fact source
- `cms_banners` — promo facts
- `cms_pages` (POLICY/PAGE types) — policy link metadata
- `system_settings` — AI credentials (encrypted JSON key `content.ai`)
- `users` — author / created_by

---

## 8. STATE MACHINES

### 8.1 ContentPlan status (workflow)

**Transient AI activity** is NOT a plan status. Derive from latest `ai_runs` where `status IN (QUEUED, RUNNING)`.

| From | Event | To |
|------|-------|-----|
| — | create plan | `DRAFT` |
| `DRAFT` | analyze job success | `PLANNED` |
| `DRAFT` | action=IGNORE | `ARCHIVED` |
| `PLANNED` | outline job success | `OUTLINE_READY` |
| `OUTLINE_READY` | approve-outline | `OUTLINE_APPROVED` |
| `OUTLINE_READY` | reject / re-request | `PLANNED` |
| `OUTLINE_APPROVED` | write job success + validation pass | `CONTENT_READY` |
| `CONTENT_READY` | start review (admin) | `IN_REVIEW` |
| `IN_REVIEW` | approve content | `APPROVED` |
| `IN_REVIEW` | reject → re-write | `OUTLINE_APPROVED` |
| `IN_REVIEW` | reject → re-outline | `PLANNED` |
| `APPROVED` | create-cms-draft success | `APPROVED` (cms_page_id set) |
| `APPROVED` | publish sync detects CMS PUBLISHED | `PUBLISHED` |
| `*` | manual archive | `ARCHIVED` |

**Invalid without override:** `DRAFT` → `OUTLINE_APPROVED`, `PLANNED` → `PUBLISHED`, etc.

### 8.2 AI Run status (execution)

| From | Event | To |
|------|-------|-----|
| — | job enqueued | `QUEUED` |
| `QUEUED` | worker picks up | `RUNNING` |
| `RUNNING` | success | `SUCCEEDED` |
| `RUNNING` | error / timeout | `FAILED` |
| `QUEUED`/`RUNNING` | admin cancel | `CANCELLED` |

**Rule:** Plan status does NOT become `FAILED`. Failed runs set `ai_runs.status=FAILED`; plan stays at previous gate.

### 8.3 CMS status (existing, read-only for automation)

`CmsPageStatus`: `DRAFT` | `PUBLISHED` | `ARCHIVED`

Automation only creates/updates `DRAFT`. Publish is human via existing CMS.

---

## 9. AI ARCHITECTURE

```
ContentAutomationAdminController
        ↓
ContentAutomationQueueProducer.enqueue(task)
        ↓
ContentAutomationWorker
        ↓
AiOrchestratorService
        ↓
AiPromptComposerService (templates + context)
        ↓
AiProviderRouter (MVP: single provider)
        ↓
AiProviderInterface.complete(task, structuredInput)
        ↓
ArticleDocumentValidator / QualityGateService
        ↓
ContentPlanRepository + AiRunRepository
```

### MVP provider

- **1 provider** (implementation TBD at readiness review: OpenAI or Anthropic)
- **1 default model** per task type in `system_settings` key `content.ai`
- API key stored encrypted via `SettingsEncryptionService` pattern

### Orchestrator responsibilities

- Compose prompt from templates + context
- Call provider with JSON schema response mode
- Persist `ai_runs` (tokens, cost, duration, prompt_version)
- Never call `CmsService.publishPage`

### Retry / timeout

| Setting | Value |
|---------|-------|
| Job attempts | 2 |
| Backoff | exponential, 10s base |
| Job timeout | 180s |
| Worker concurrency | 1 |
| Idempotent jobId | `content-{planId}-{task}-{attemptKey}` |

---

## 10. CONTEXT PIPELINE

`ContextBuilderService.build(plan, task)` returns in-memory object (no DB entity):

```typescript
interface GenerationContext {
  plan: {
    topic, primaryKeyword, searchIntent, contentType,
    audience, suggestedTitle, outline?, action
  };
  seo: {
    siteTitle, metaRules, focusKeywordRules  // from CMS SEO settings + templates
  };
  existingContent: {
    relatedPages: { pageId, title, focusKeyword, excerpt }[]  // live query, max 10
  };
  factContext: {
    facts: FactRef[]   // from FactSourceService
  };
  brandContext: {
    voice, tone, forbiddenPatterns, ctaRules  // from ai_prompt_templates
  };
  internalLinkCandidates: {
    pageId, title, relevanceScore  // live query, max 20
  };
  adminReferences?: string[]  // from plan.references, not fetched
}
```

**Rules:**

- Do NOT send full website HTML to AI
- Re-fetch link candidates and facts at job time (not only stale snapshot)
- `intelligenceSnapshot` used for UI/decision; jobs use live reads where safety-critical

---

## 11. ARTICLE DOCUMENT

### 11.1 Schema version

`schemaVersion: "1.0"`

### 11.2 Root structure

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
  "sections": [ /* Block[] */ ],
  "factRefs": [ /* FactRef[] */ ],
  "internalLinks": [
    {
      "sectionId": "string",
      "targetPageId": "uuid",
      "anchorText": "string",
      "validated": false
    }
  ],
  "qualityFlags": ["FACT_UNVERIFIED"]
}
```

### 11.3 Block types (MVP)

| type | Fields | HTML output |
|------|--------|-------------|
| `paragraph` | `text` | `<p>` |
| `h2` | `text` | `<h2>` |
| `h3` | `text` | `<h3>` |
| `ul` | `items[]` | `<ul><li>` |
| `ol` | `items[]` | `<ol><li>` |
| `blockquote` | `text` | `<blockquote>` |
| `table` | `rows[][]` | `<table>` |
| `image` | `url`, `alt` | `<img>` — MVP optional; prefer manual in CMS |
| `internalLink` | `targetPageId`, `anchorText` | `<a href="resolved">` |
| `faq` | `items[{question,answer}]` | `<h3>` + `<p>` per item |
| `callout` | `text`, `variant?` | `<blockquote>` or `<p>` |

**Forbidden in body:** `h1` (title serves as H1).

### 11.4 Pipeline

```
ArticleDocument
  → ArticleDocumentValidator (Zod, schemaVersion, block types, lengths)
  → ArticleDocumentRenderer (blocks → HTML string)
  → sanitizeCmsHtml (import from cms/entities/cms-html-safety.ts)
  → ContentAutomationCmsAdapter
  → CmsService.createPage / updatePage
```

### 11.5 TipTap compatibility

Output MUST use only tags in `CMS_ALLOWED_HTML_TAGS`. No `cms-block-*` landing classes for blog articles MVP.

---

## 12. QUALITY GATE

### Layer 1 — Schema validation (HARD)

- Valid JSON / Zod schema
- `schemaVersion` supported
- Required: `title`, `seo.metaTitle`, `seo.metaDescription`, `sections.length >= 1`
- Block types whitelist
- No `h1` blocks
- Field max lengths match `CmsSeo` / `CmsPage` limits

### Layer 2 — Business validation (HARD)

- `primary_keyword` present in title or first 200 words (configurable)
- `focusKeyword` alignment with plan
- All `internalLink.targetPageId` exist + `PUBLISHED` (or eligible PAGE)
- All commercial claims have `factRef` OR flag `FACT_UNVERIFIED` (blocks APPROVED if unverified commercial claim)
- No raw URLs in AI output for internal links (only pageId in structured doc)
- Duplicate title check against existing `cms_pages.title` (warning or hard — default HARD for exact match)
- Slug collision pre-check before create-cms-draft

### Layer 3 — Diagnostics (SOFT)

Port logic from `apps/admin/lib/cms-editor-utils.ts`:

- Word count ≥ 300
- Meta description length
- Internal link count
- Image alt presence
- SEO score 0–100

**Does NOT auto-publish or auto-approve.**

### Gate timing

- After WRITE job (Layer 1+2 automatic)
- On demand: `POST /plans/:id/run-quality-gate` (Layer 3 refresh)
- Before `create-cms-draft`: Layer 1+2 MUST pass

---

## 13. INTERNAL LINKING

### AI output (structured)

```json
{
  "targetPageId": "uuid",
  "anchorText": "string",
  "reason": "string",
  "confidence": 0.0
}
```

### Backend (`CmsPublicPathResolver` in content-automation module)

Resolve href using same rules as web:

```text
BLOG_POST + categorySlug → /tin-tuc/{categorySlug}/{slug}
BLOG_POST no category     → /{slug}
CmsCategory page target   → /tin-tuc/{categorySlug}
PAGE / POLICY             → /{slug}
```

Implementation: `CmsService.getPage(id)` + local path builder (duplicate admin logic — no CMS file change).

### Validation

1. Page exists
2. `status === PUBLISHED` for blog internal links MVP
3. Not self-link (same as target cms_page_id when exists)
4. Renderer injects resolved href only

**AI MUST NOT output `href`.**

---

## 14. CMS INTEGRATION

### Adapter interface

```typescript
interface ContentAutomationCmsAdapter {
  createBlogDraft(input: {
    authorId: string;
    title: string;
    slug: string;
    html: string;
    excerpt?: string;
    categoryId?: string;
    tagIds?: string[];
    seo: CmsPageSeoDto;
    featuredImage?: string;
  }): Promise<{ cmsPageId: string }>;

  updateBlogDraft(cmsPageId: string, patch: Partial<...>): Promise<void>;

  getPageSnapshot(cmsPageId: string): Promise<CmsPageSnapshot>;
}
```

### Slug generation

- `slugifyVi(primaryKeyword || title)` — reuse util from CMS module (import, no modify)
- Check uniqueness via adapter calling `CmsService` / conflict handling

### Plan APPROVED ≠ CMS PUBLISHED

| State | Meaning |
|-------|---------|
| Plan `APPROVED` | Human approved AI content; CMS draft may exist |
| CMS `DRAFT` | Editable in existing editor |
| CMS `PUBLISHED` | Public live |
| Plan `PUBLISHED` | Sync service confirmed CMS published |

### Publish synchronization (SC-05 compliant)

**Mechanism:** `ContentPlanPublishSyncService` in content-automation module.

- Cron every 60s (only when `CONTENT_AUTOMATION_ENABLED=true`)
- Query plans: `status=APPROVED`, `cms_page_id IS NOT NULL`
- `CmsService.getPage(cms_page_id)` → if `status=PUBLISHED` → update plan `PUBLISHED`, `published_at`
- Also handles scheduled publish via existing `CmsScheduledPublishCronService` (CMS cron unchanged; sync picks up result)

**No webhook. No CmsService modification.**

### create-cms-draft trigger

- Sync API: `POST /plans/:id/create-cms-draft`
- Requires: plan `APPROVED`, quality Layer 1+2 pass, action=`CREATE`
- Sets `cms_page_id`; does NOT publish

---

## 15. QUEUE

### Queue name

`content_automation_queue`

### Job types

| Job name | Maps to task | Sync side effect |
|----------|--------------|------------------|
| `GENERATE_OUTLINE` | OUTLINE | Update plan.outline, status |
| `GENERATE_ARTICLE` | WRITE | Update article_document, status |
| `REGENERATE_SECTION` | REGENERATE_SECTION | Patch section in article_document |
| `QUALITY_CHECK` | QUALITY_CHECK | Update quality_report |
| `ANALYZE` | ANALYZE | Update intelligence_snapshot, status PLANNED |

### Configuration

```text
attempts: 2
backoff: { type: 'exponential', delay: 10000 }
timeout: 180000
concurrency: 1
removeOnComplete: 500
removeOnFail: { age: 604800, count: 2000 }
```

### Idempotency

- `jobId = content-{planId}-{jobName}-{contentVersion}`
- Re-enqueue same job while RUNNING → reject 409

### Feature flag

When OFF: producer throws / returns 503; worker not registered; no cron.

---

## 16. AI RUN

### Storage rules (SC-15)

| Field | Policy |
|-------|--------|
| `input_hash` | Always store |
| `context_refs` | IDs only |
| `input_snapshot` | Omit or truncate 8KB; never store API key |
| `output_snapshot` | Store structured JSON; cap 500KB |
| `error` | Message only, no stack with secrets |

### Retention

| Age | Action |
|-----|--------|
| 0–90 days | Full output_snapshot |
| >90 days | Null snapshots; keep metrics row |
| Failed runs | Keep 30 days for debug |

Optional cron in M6: `AiRunRetentionService`.

---

## 17. API CONTRACT

**Base path:** `/admin/content-automation`  
**Auth:** JWT + `cms.manage` (role MARKETING, ADMIN, SUPER_ADMIN)  
**Feature flag:** All routes return `503 Feature disabled` when OFF

### Endpoints

| Method | Path | Sync/Async | Description |
|--------|------|------------|-------------|
| POST | `/plans` | Sync | Create plan → `DRAFT` |
| GET | `/plans` | Sync | List plans (filter status, pagination) |
| GET | `/plans/:id` | Sync | Detail + latest ai_runs summary |
| PATCH | `/plans/:id` | Sync | Update metadata, action, intent override |
| POST | `/plans/:id/analyze` | **Async** | Enqueue ANALYZE |
| POST | `/plans/:id/generate-outline` | **Async** | Enqueue OUTLINE; requires `PLANNED` |
| POST | `/plans/:id/approve-outline` | Sync | Gate → `OUTLINE_APPROVED` |
| POST | `/plans/:id/generate-article` | **Async** | Enqueue WRITE; requires `OUTLINE_APPROVED` |
| POST | `/plans/:id/regenerate` | **Async** | Body: `{ target: 'section', sectionId }` etc. |
| POST | `/plans/:id/run-quality-gate` | Sync/Async | Refresh quality_report |
| POST | `/plans/:id/approve-content` | Sync | `IN_REVIEW` → `APPROVED` |
| POST | `/plans/:id/reject-content` | Sync | → `OUTLINE_APPROVED` or `PLANNED` |
| POST | `/plans/:id/create-cms-draft` | Sync | Adapter create DRAFT |
| GET | `/plans/:id/preview` | Sync | Render HTML preview (no CMS write) |
| GET | `/ai-runs` | Sync | List runs (filter planId) |
| GET | `/ai-runs/:id` | Sync | Run detail |
| GET | `/internal-link-candidates` | Sync | Query: `?keyword=&limit=20` |
| GET | `/status` | Sync | Flag, queue depth (admin diagnostics) |

**Rule:** All AI generation endpoints (`analyze`, `generate-outline`, `generate-article`, `regenerate`) MUST enqueue jobs and return `{ jobId, aiRunId }` immediately — HTTP 202.

---

## 18. ADMIN UI

**Location:** `apps/admin/app/marketing/content-plans/**` (new routes, existing Marketing permission)

### Pages

| Route | Purpose |
|-------|---------|
| `/marketing/content-plans` | Dashboard + plans list |
| `/marketing/content-plans/new` | Create plan form |
| `/marketing/content-plans/[id]` | Plan detail tabs |
| `/marketing/content-automation/runs` | AI runs log (optional sub-route) |

### Plan detail tabs

1. **Overview** — status, action, keyword, intent, type, timeline
2. **Intelligence** — snapshot, recommendations, cannibalization
3. **Outline** — view/approve
4. **Article** — preview HTML (read-only), fact flags, links
5. **Quality** — hard checks + diagnostic scores
6. **AI Runs** — job history, errors, tokens/cost

### CMS editor

- Button "Open in CMS Editor" → `/marketing/articles?edit={cmsPageId}` (deep link only, no editor change)
- Publish happens in existing CMS UI

**No AI chatbot. No new TipTap instance.**

---

## 19. SECURITY / PERMISSION

### MVP permission

Reuse **`cms.manage`** for all content-automation endpoints (same as Marketing CMS).

| Action | Permission |
|--------|------------|
| Create plan | `cms.manage` |
| Analyze / generate | `cms.manage` |
| Approve outline / content | `cms.manage` |
| Create CMS draft | `cms.manage` |
| Publish CMS | Existing CMS publish (same permission via CMS UI) |

Phase 2 MAY split `content.automation.*` — out of MVP.

### Settings

- AI API key: `system_settings.key = 'content.ai'` (encrypted fields)
- Only SUPER_ADMIN / settings admin can update (follow existing settings pattern)

### Rate limiting

- Global Throttler applies
- Additional: max 10 AI jobs / plan / hour (application-level, content-automation module)

---

## 20. ERROR HANDLING

| Scenario | Plan status | ai_run | User-facing | System impact |
|----------|-------------|--------|-------------|---------------|
| AI timeout | unchanged | FAILED | Retry button | None on CMS |
| Provider 5xx | unchanged | FAILED | Retry | None |
| Invalid JSON from AI | unchanged | FAILED | Error detail | None |
| Schema validation fail | unchanged | FAILED | Fix/regenerate | None |
| Fact validation fail | CONTENT_READY or IN_REVIEW | SUCCEEDED + flags | Show FACT_UNVERIFIED | None |
| Quality hard fail | IN_REVIEW blocked | SUCCEEDED | Cannot approve | None |
| CMS draft slug conflict | APPROVED | N/A | Edit slug retry | None |
| CMS createPage error | APPROVED | N/A | Error message | No partial page |
| CMS publish fail | APPROVED | N/A | Use CMS UI | CMS stays DRAFT |
| Worker retry exhaustion | unchanged | FAILED | Manual retry | None |
| Feature flag OFF mid-job | running job completes or fails isolated | — | 503 new requests | Existing app OK |

**Principle:** Errors contained in content-automation tables; never throw into Order/Payment pipelines.

---

## 21. TESTING

### Unit tests (new module)

- ArticleDocument validator (all block types, reject h1)
- Renderer output ⊆ allowed HTML tags
- CmsPublicPathResolver paths match `apps/web/lib/routes.ts` cases
- FactSourceService snapshots (mock ProductRepository)
- ContentPlan state machine transitions
- Quality Gate Layer 1+2 hard rules
- Context builder size limits

### Integration tests

- Mock AiProvider → orchestrator → plan update
- Queue enqueue + worker process (test Redis)
- CmsAdapter with mocked CmsService.createPage

### Regression tests (existing — MUST pass unchanged)

- `cms.service.publish.spec.ts`
- `cms.security.spec.ts` (sanitize)
- CMS public mapper sanitize
- Notification/provider worker smoke
- `CmsScheduledPublishCronService` behavior

### Manual smoke (staging)

- Flag OFF → CMS create/publish blog manually
- Flag ON → full plan workflow → CMS draft → publish → plan sync

---

## 22. DEPLOYMENT

### Sequence

1. Deploy DB migration (3 new tables only)
2. Deploy API + worker build (flag **OFF** in env)
3. Deploy admin UI (nav hidden or disabled when flag OFF)
4. Seed `ai_prompt_templates` (staging/prod)
5. Configure `content.ai` settings (encrypted API key)
6. Smoke: flag OFF — regression suite
7. Enable `CONTENT_AUTOMATION_ENABLED=true` on staging
8. E2E one plan workflow
9. Enable prod flag after owner sign-off

### Environment variables

```text
CONTENT_AUTOMATION_ENABLED=false   # default
CONTENT_AI_PROVIDER=openai         # TBD at readiness
CONTENT_AI_MODEL=...               # TBD
```

---

## 23. ROLLBACK

### Fast rollback (minutes)

1. Set `CONTENT_AUTOMATION_ENABLED=false`
2. Restart API + worker processes
3. Verify CMS admin publish works
4. Optional: pause `content_automation_queue` in Redis CLI

### Code rollback

1. Revert deploy (remove module import)
2. Flag OFF
3. Existing CMS/Order unaffected

### Migration rollback

```sql
-- Only if no production plans needed
DROP TABLE ai_runs;
DROP TABLE content_plans;
DROP TABLE ai_prompt_templates;
-- cms_pages untouched
```

### Data left behind

- CMS DRAFT pages from automation remain — normal CMS drafts
- Orphan plans without cms_page_id — archive manually

---

## 24. IMPLEMENTATION MILESTONES

### M1 — Foundation

| Item | Detail |
|------|--------|
| Scope | Prisma models, module scaffold, feature flag guard, constants |
| Files | `content-automation.module.ts`, entities, repositories skeleton |
| Dependencies | SC checklist approved |
| Risk | Low |
| Acceptance | Module loads; flag OFF → no routes/worker; migration adds 3 tables only |

### M2 — Content Plan + Intelligence

| Item | Detail |
|------|--------|
| Scope | Plan CRUD API, analyze job (heuristic, no AI), admin list/create UI |
| Dependencies | M1 |
| Risk | Medium (heuristic tuning) |
| Acceptance | Analyze produces snapshot; CREATE/IGNORE; no AI provider yet |

### M3 — AI Orchestration

| Item | Detail |
|------|--------|
| Scope | Provider interface, orchestrator, queue producer/worker, outline + write jobs |
| Dependencies | M2, prompt seed, API key |
| Risk | High (cost, quality) |
| Acceptance | Async outline + article; ai_runs logged; plan states transition |

### M4 — ArticleDocument + Quality

| Item | Detail |
|------|--------|
| Scope | Schema, validator, renderer, sanitize, quality gate, preview API |
| Dependencies | M3 |
| Risk | Medium (TipTap compatibility) |
| Acceptance | Preview HTML loads in test harness; hard gate blocks bad docs |

### M5 — CMS Integration + UI

| Item | Detail |
|------|--------|
| Scope | CmsAdapter, create-cms-draft, publish sync cron, plan detail UI, approve flows |
| Dependencies | M4 |
| Risk | Low (isolated adapter) |
| Acceptance | E2E: approve → CMS DRAFT → manual publish → plan PUBLISHED within 60s |

### M6 — Hardening

| Item | Detail |
|------|--------|
| Scope | ai_run retention, rate limits, activity log, optional regen section, docs |
| Dependencies | M5 |
| Risk | Low |
| Acceptance | Regression suite green; change budget verified |

---

## 25. FILE IMPACT

### NEW FILES (representative)

| File | Purpose |
|------|---------|
| `docs/CONTENT_AUTOMATION_MASTER_SPEC_v0.2.md` | This contract |
| `src/modules/content-automation/content-automation.module.ts` | Module root |
| `src/modules/content-automation/controllers/content-automation-admin.controller.ts` | API |
| `src/modules/content-automation/services/content-plan.service.ts` | Plan lifecycle |
| `src/modules/content-automation/services/content-intelligence.service.ts` | Snapshot |
| `src/modules/content-automation/services/fact-source.service.ts` | Fact bundle |
| `src/modules/content-automation/services/context-builder.service.ts` | AI context |
| `src/modules/content-automation/services/ai-orchestrator.service.ts` | AI jobs |
| `src/modules/content-automation/services/ai-prompt-composer.service.ts` | Templates |
| `src/modules/content-automation/services/quality-gate.service.ts` | Validation |
| `src/modules/content-automation/services/article-document.validator.ts` | Zod |
| `src/modules/content-automation/services/article-document.renderer.ts` | HTML |
| `src/modules/content-automation/services/content-automation-cms.adapter.ts` | CMS gateway |
| `src/modules/content-automation/services/cms-public-path.resolver.ts` | URL resolve |
| `src/modules/content-automation/services/content-plan-publish-sync.service.ts` | Poll sync |
| `src/modules/content-automation/providers/ai-provider.interface.ts` | Provider contract |
| `src/modules/content-automation/providers/openai.provider.ts` | MVP provider |
| `src/modules/content-automation/providers/ai-provider.router.ts` | Single provider |
| `src/modules/content-automation/repositories/content-plan.repository.ts` | DB |
| `src/modules/content-automation/repositories/ai-run.repository.ts` | DB |
| `src/modules/content-automation/repositories/ai-prompt.repository.ts` | DB |
| `src/modules/content-automation/producers/content-automation-queue.producer.ts` | Queue |
| `src/modules/content-automation/workers/content-automation.worker.ts` | Worker |
| `src/modules/content-automation/entities/*.ts` | Enums, types, schema |
| `src/modules/content-automation/dto/*.ts` | DTOs |
| `apps/admin/app/marketing/content-plans/**` | Admin UI |
| `apps/admin/services/content-automation-api.ts` | API client |

### EXISTING FILES TO MODIFY

| File | Reason | Risk | Unavoidable |
|------|--------|------|-------------|
| `src/app.module.ts` | Import module | Low | Nest bootstrap |
| `src/worker.module.ts` | Worker context | Low | Worker bootstrap |
| `src/queue/queue.constants.ts` | New queue name | Low | BullMQ registry |
| `prisma/schema.prisma` | Add 3 models | Low | Persistence |

**Optional (within budget):**

| File | Reason |
|------|--------|
| `prisma/seed.mjs` | Prompt templates |
| `apps/admin/lib/permissions.ts` | Nav item |
| `src/modules/queue-monitor/entities/queue-config.constants.ts` | Monitor |

### FORBIDDEN FILES

| File/Module | Reason |
|-------------|--------|
| `src/modules/cms/services/cms.service.ts` | SC-05 |
| `src/modules/cms/controllers/cms-public.controller.ts` | SC-07 |
| `apps/admin/components/marketing/cms-editor/**` | SC-06 |
| `apps/web/**` | SC-07 |
| `src/modules/order/**`, `payment/**`, `provider/**` | SC-01 |
| Existing queue workers | SC-04 |

---

## 26. FINAL IMPLEMENTATION CONTRACT

Before any implementation code, reviewers MUST verify:

- [ ] **SC-01–SC-15** Safety Constraints satisfied
- [ ] **Change Budget** satisfied (≤8 existing files, 0 ALTER existing tables)
- [ ] **No existing DB alteration** on production tables
- [ ] **No existing API behavior change** (`/admin/cms/*`, `/cms/*`)
- [ ] **No existing queue behavior change**
- [ ] **No public behavior change**
- [ ] **CMS isolated** (adapter only, no CmsService edits)
- [ ] **AI worker isolated** (no publish, no business data writes)
- [ ] **Feature flag** available, default OFF
- [ ] **Rollback** documented and tested on staging
- [ ] **Regression tests** defined for CMS/queues/public
- [ ] **MVP scope** respected (§4)
- [ ] **Out-of-scope items** excluded (§5)
- [ ] **ArticleDocument v1** schema frozen (§11)
- [ ] **State machines** frozen (§8)
- [ ] **API contract** frozen (§17)
- [ ] **Publish sync** uses poll only (§14)

**If any item FAILS: do NOT proceed to coding.**

---

## APPENDIX A — Intelligence Snapshot Schema v1

See architecture review §1. Stored in `content_plans.intelligence_snapshot`.

## APPENDIX B — FactRef Schema

```json
{
  "refId": "fact-1",
  "type": "product_variant",
  "sourceId": "uuid",
  "snapshot": {
    "productName": "string",
    "variantName": "string",
    "faceValueVnd": "string",
    "sellPriceVnd": "string",
    "sku": "string",
    "status": "ACTIVE"
  }
}
```

**Never include:** `providerCost`, internal provider IDs, agent pricing.

## APPENDIX C — Public Path Resolution

Canonical builder lives in `cms-public-path.resolver.ts` and MUST stay aligned with `apps/web/lib/routes.ts`:

```text
blogPostPath(categorySlug, slug):
  categorySlug ? `/tin-tuc/${categorySlug}/${slug}` : `/${slug}`
```

---

*End of MASTER SPEC v0.2*
