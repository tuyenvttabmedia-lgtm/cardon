# M3 AI Orchestration — Architecture Discovery & Feasibility Review

**Project:** CardOn.vn Content Automation  
**Version:** Draft 1.0  
**Date:** 2026-08-28  
**Status:** Architecture review only — **NO CODE**  
**Contract:** `docs/CONTENT_AUTOMATION_MASTER_SPEC_v1.0.md` (frozen)  
**Prerequisite:** M1 COMPLETE · M2 COMPLETE · M2 post-verification SAFE

---

## Executive Summary

M3 có thể triển khai **trong module `content-automation` hiện có**, mở rộng pipeline queue/worker đã có từ M1–M2, **không cần pipeline song song** và **không cần ALTER bảng production** nếu tuân thủ convention prompt JSON + `system_settings.content.ai`.

Điểm injection chính: **`ContentAutomationWorker` → `AiOrchestrator`** — orchestrator gọi `ContextBuilderService` và persist qua repositories hiện có.

**Blockers trước implementation:** (1) owner chọn AI provider, (2) convention prompt template JSON, (3) reader `content.ai` encrypted config.  
**Không block architecture:** dependency SDK (quyết định lúc implement), worker guards chưa code, rate limit chưa code.

---

## 1. Current M2 → M3 Boundary

### 1.1 Pipeline hiện tại (verified)

```text
POST /plans/:id/analyze (202)
  → ContentAutomationQueueProducer.enqueueAnalyze()
  → BullMQ job ANALYZE (jobId = content-{planId}-ANALYZE-{epoch})
  → ContentAutomationWorker.processAnalyze()
  → ContentIntelligenceService.runAnalyze()
       → ContextBuilderService.buildFromPlan()
       → buildHeuristicSnapshot()          ← M2: heuristic-only
       → ContentPlanRepository.update(intelligenceSnapshot, status)
  → AiRunRepository.updateStatus(SUCCEEDED | FAILED)
```

**Files verified:**

| Layer | File | Role |
|-------|------|------|
| API | `controllers/content-automation-admin.controller.ts` | `POST analyze` |
| Producer | `producers/content-automation-queue.producer.ts` | Idempotency + enqueue |
| Worker | `workers/content-automation.worker.ts` | Job dispatch |
| Intelligence | `services/content-intelligence.service.ts` | Analyze business outcome |
| Context | `services/context-builder.service.ts` | `GenerationContext` assembly |
| Context slices | `brand-context`, `fact-context`, `existing-content-context`, `internal-link-candidate` | Read-only backend |

### 1.2 Injection point — recommended (single pipeline)

**Primary entry (M3):** `ContentAutomationWorker` delegates all AI tasks to **`AiOrchestrator.execute(params)`**.

```text
Worker (ANALYZE | GENERATE_OUTLINE | GENERATE_ARTICLE | …)
  → AiOrchestrator.execute({ task, planId, aiRunId, generationEpoch })
       → WorkerGuardService.assertRunnable()     [epoch, status, idempotency]
       → ContextBuilderService.build(planId)     [always backend-sourced]
       → PromptComposer.compose(task, context)   [ai_prompt_templates]
       → AiProviderRouter.invoke(request)        [adapter only]
       → AiOutputValidator.validate(task, raw)   [parse + schema + business]
       → TaskResultHandler.apply(task, plan, output)  [repositories]
       → AiRunRepository.complete(run, metadata)
```

**Secondary (refactor M2, not parallel):** `ContentIntelligenceService.runAnalyze()` becomes thin wrapper gọi `AiOrchestrator` với `task=ANALYZE`, hoặc worker gọi orchestrator trực tiếp và **deprecate** direct heuristic path trong worker.

**Không tạo:** queue mới, worker mới, module mới song song, hoặc AI path bỏ qua `ContextBuilderService`.

### 1.3 Strategy pattern for ANALYZE (M2 compatibility)

| Mode | Behavior |
|------|----------|
| AI enabled + configured | Orchestrator → provider → `intelligence_snapshot.source = 'AI'` |
| AI disabled / misconfigured / dry-run | `HeuristicAnalyzeStrategy` (logic từ `buildHeuristicSnapshot`) → `source = 'HEURISTIC'` |
| Feature flag OFF | Producer 503; worker skip — **no orchestrator call** |

M2 heuristic code **reuse** as strategy — không duplicate pipeline.

### 1.4 M3 task scope (per Master Spec §9, §15, §24)

| Job name | AiTaskType | M3 target |
|----------|------------|-----------|
| `ANALYZE` | ANALYZE | AI analyze (optional fallback heuristic) |
| `GENERATE_OUTLINE` | OUTLINE | AI outline → `content_plans.outline` |
| `GENERATE_ARTICLE` | WRITE | AI draft → `content_plans.article_document` (structure only; renderer M4) |
| `REGENERATE_SECTION` | REGENERATE_SECTION | Stub / defer partial M3 |
| `QUALITY_CHECK` | QUALITY_CHECK | Defer M4 quality gate |

M3 MVP recommendation: **ANALYZE + OUTLINE + WRITE** enqueue + worker handlers; REGENERATE/QUALITY_CHECK return `FAILED` + clear message until M4.

---

## 2. AI Provider Abstraction

### 2.1 Layer separation (mirror Payment/Provider patterns)

CardOn đã có precedent:

- `PaymentProviderInterface` + `PaymentProviderRegistry`
- `ProviderInterface` + `ProviderRegistryService`

M3 nên mirror trong `content-automation/providers/`:

```text
Business layer          AiOrchestrator, TaskResultHandler, ContentPlanService
                              ↓
Composition layer       PromptComposer, AiOutputValidator, AiConfigService
                              ↓
Routing layer           AiProviderRouter (1 provider MVP per spec)
                              ↓
Adapter layer           AiProvider interface → OpenAiCompatibleProvider | …
                              ↓
External API            HTTPS (fetch) — no business imports
```

**Rule:** `ContentIntelligenceService`, `ContentPlanService`, worker **không import** SDK OpenAI/Anthropic/Google.

### 2.2 Proposed interfaces (spec-only)

```typescript
/** Adapter — HTTP/SDK isolated here */
interface AiProvider {
  readonly providerId: string; // e.g. 'openai-compatible'
  complete(request: AiCompletionRequest): Promise<AiCompletionResponse>;
  classifyError(error: unknown): AiProviderErrorKind;
}

interface AiCompletionRequest {
  model: string;
  systemPrompt: string;
  userPrompt: string;
  /** JSON schema / response_format hint — provider-specific mapping in adapter */
  structuredOutput?: { schemaName: string; schema: object };
  timeoutMs: number;
  maxTokens?: number;
  temperature?: number;
}

interface AiCompletionResponse {
  rawText: string;
  parsedJson?: unknown;
  tokensIn: number;
  tokensOut: number;
  model: string;
  latencyMs: number;
  providerRequestId?: string;
}

type AiProviderErrorKind =
  | 'TIMEOUT'
  | 'RATE_LIMIT'
  | 'AUTH'
  | 'INVALID_REQUEST'
  | 'MALFORMED_OUTPUT'
  | 'PROVIDER_UNAVAILABLE'
  | 'UNKNOWN';
```

```typescript
/** Business orchestration — no SDK */
interface AiOrchestrator {
  execute(input: AiOrchestratorInput): Promise<AiOrchestratorResult>;
}

interface AiOrchestratorInput {
  task: AiTaskType;
  planId: string;
  aiRunId: string;
  generationEpoch: number;
}

interface AiOrchestratorResult {
  status: 'SUCCEEDED' | 'FAILED';
  outputSnapshot?: object;
  error?: string;
  tokensIn?: number;
 tokensOut?: number;
  costUsd?: string;
  durationMs?: number;
}
```

```typescript
/** Config — read from system_settings content.ai (encrypted) */
interface ContentAiConfig {
  providerId: string;
  model: string;
  apiKeyEncrypted: string; // never exposed to context/prompt/logs
  timeoutMs: number;
  maxTokens?: number;
  temperature?: number;
  /** Optional: use heuristic fallback when false */
  analyzeUseAi: boolean;
}
```

### 2.3 Model configuration ownership

| Concern | Owner |
|---------|-------|
| Default model, timeout, API key | `system_settings` key `content.ai` (encrypted) — Master Spec §9 |
| Per-task model override | Prompt template `modelConfig` JSON (optional override) |
| Runtime merge | `AiConfigService.resolve(task, promptTemplate)` |

Business services **never** read env API keys directly except via dedicated config service at worker boundary.

---

## 3. Provider / Model Requirements

**Không chọn provider/model cuối cùng** — spec §24: "Provider TBD — config only".

### 3.1 Capability requirements (M3)

| Requirement | Why | Compatibility notes |
|-------------|-----|---------------------|
| **Structured output** | ANALYZE snapshot, outline JSON, article sections | OpenAI JSON mode, Anthropic tool/schema, Gemini JSON — adapter maps unified contract |
| **JSON / schema validation** | Post-parse validation before DB write | Adapter may assist; **backend always re-validates** |
| **Long context** | GenerationContext: brand + facts + 10 CMS snippets + 20 links + plan metadata | Estimate 8–25K tokens input; need ≥32K context window model tier |
| **Vietnamese quality** | CardOn content market | Require VN eval set before prod; no provider selected without eval |
| **Timeout** | Spec: 180s job timeout | Adapter timeout ≤ 170s; leave margin for validation |
| **Retry** | BullMQ attempts=2, backoff 10s | Retry **transient** provider errors only; **not** malformed output |
| **Token usage** | `ai_runs.tokens_in/out` | All providers expose usage metadata — map in adapter |
| **Cost tracking** | `ai_runs.cost_usd` | Compute from usage × price table in config service (static table OK for MVP) |
| **Error classification** | Retry vs fail-fast vs invalid output | `AiProvider.classifyError()` |

### 3.2 Provider selection gates (pre-implementation)

1. Structured output reliability on outline schema (manual eval ≥ N plans)
2. Vietnamese tone QA by marketing owner
3. Cost ceiling per plan/task documented
4. Data processing / API region policy sign-off

---

## 4. Prompt Architecture

### 4.1 Current DB (`ai_prompt_templates`)

| Column | M1 schema |
|--------|-----------|
| `key` | VARCHAR — maps to task family |
| `version` | VARCHAR — semver/date |
| `content` | TEXT — **single blob today** |
| `is_active` | BOOLEAN |

Repository: `AiPromptRepository.findActiveByKey(key)` — latest active by `updatedAt`.

**No prompt admin UI** in MVP (spec §5 OUT OF MVP).

### 4.2 Proposed contract — JSON inside `content` (no migration)

`content` stores versioned JSON document:

```json
{
  "task": "ANALYZE",
  "version": "1.0.0",
  "systemPrompt": "You are…",
  "userTemplate": "Plan:\n{{topic}}\nKeyword: {{primaryKeyword}}\n…",
  "outputSchema": { "type": "object", "properties": { … } },
  "modelConfig": {
    "temperature": 0.3,
    "maxTokens": 4096,
    "responseFormat": "json"
  }
}
```

| Field | Purpose |
|-------|---------|
| `task` | Must match `AiTaskType` / prompt `key` |
| `version` | Copied to `ai_runs.prompt_version` |
| `systemPrompt` | Fixed system instructions |
| `userTemplate` | Handlebars-lite / mustache variables from sanitized context |
| `outputSchema` | Backend validation contract (Joi/JSON Schema) |
| `modelConfig` | Optional override of `content.ai` defaults |

**Prompt key convention:**

| key | task |
|-----|------|
| `content.analyze` | ANALYZE |
| `content.outline` | OUTLINE |
| `content.write` | WRITE |

### 4.3 PromptComposer responsibilities

1. Load active template via `AiPromptRepository`
2. Build **sanitized** variable map from `GenerationContext` (no API keys, no full CMS HTML bodies)
3. Render `userTemplate`
4. Hash input → `ai_runs.input_hash`
5. Store `context_refs` = `{ planId, factRefIds[], pageIds[] }` only (spec §16)

**Hard rule:** No prompt string literals in `AiOrchestrator` / `ContentIntelligenceService` — only in DB seed / migration seed script.

### 4.4 Seeding

`prisma/seed.mjs` (optional, exception list Class B) — insert v1 prompt templates.  
Alternative: one-time admin SQL / deploy script — no runtime hardcode.

---

## 5. AI Run Lifecycle

### 5.1 State machine (existing)

```text
QUEUED → RUNNING → SUCCEEDED | FAILED | CANCELLED
```

Plan status **never** FAILED — AI failure isolated in `ai_runs`.

### 5.2 Idempotency (frozen §15)

```text
idempotencyKey = {planId}:{task}:{generationEpoch}
bullmqJobId    = content-{planId}-{task}-{generationEpoch}
```

| Scenario | Expected behavior | M2 code status |
|----------|-------------------|----------------|
| No active run | 202 enqueue | ✅ Implemented |
| QUEUED/RUNNING same key | 409 | ✅ Implemented |
| SUCCEEDED same key | 200 reuse, no AI | ✅ Implemented |
| FAILED same key | 202 retry | ✅ Implemented |
| Duplicate BullMQ job | Same jobId → BullMQ dedupe | ✅ jobId set |

### 5.3 Worker guards (spec §15 — **CODE GAP in M2**)

M3 **must implement** before prod AI:

| Guard | Rule | Implementation |
|-------|------|----------------|
| **Epoch match** | `job.data.generationEpoch === plan.generationEpoch` else CANCELLED/no-op | Fetch plan at worker start |
| **SUCCEEDED exists** | Skip provider call | Partial ✅ (check aiRun SUCCEEDED) |
| **Plan status compatible** | ANALYZE: DRAFT; OUTLINE: PLANNED/… | New `PlanTaskCompatibility` map |
| **Write epoch** | Updates use `WHERE generation_epoch = :epoch` | Repository method |

### 5.4 Retry matrix

| Failure type | BullMQ retry? | ai_run row | Provider call again? |
|--------------|---------------|------------|----------------------|
| Provider timeout | Yes (attempt 2) | FAILED then new RUNNING | Yes |
| Rate limit | Yes with backoff | Same | Yes |
| Auth/config error | No | FAILED permanent | No — alert admin |
| Malformed JSON output | No | FAILED | No — same epoch must fix prompt |
| Business validation fail | No | FAILED | No |
| Stale epoch | No | CANCELLED | No |

### 5.5 Stale job / epoch bump

When admin rejects outline → epoch bumps **before** re-enqueue (spec §8.2):

- Old job arrives: epoch guard → **no-op**, mark run CANCELLED or skip
- New job: new epoch → new idempotency key → fresh ai_run

### 5.6 Worker restart

BullMQ redelivery:

- RUNNING run without finish → retry or stall detection
- Recommend: on worker start processing, set RUNNING; on crash, BullMQ retry; guard SUCCEEDED to prevent double AI billing
- **Risk:** double provider call if SUCCEEDED check only on ai_run but provider already charged — mitigate with idempotency key in adapter metadata + SUCCEEDED short-circuit **before** provider call

---

## 6. Structured Output Pipeline

### 6.1 Proposed flow

```text
AiProvider.complete()
  → rawText
  → AiOutputParser.parse(rawText)           [strip markdown fences, JSON extract]
  → AiOutputValidator.validateSchema()    [Joi / JSON Schema from prompt template]
  → AiOutputValidator.validateBusiness()    [task-specific rules]
  → accept → TaskResultHandler.persist()
  → reject → FAILED (error = VALIDATION_*), no plan mutation
```

### 6.2 Validation location

| Stage | Layer | File (proposed) |
|-------|-------|-----------------|
| Parse | Adapter-adjacent | `validators/ai-output.parser.ts` |
| Schema | Business | `validators/ai-output.validator.ts` |
| Business rules | Business | `validators/analyze-output.validator.ts`, `outline-output.validator.ts`, … |
| Fact claims | Business | Reject prices/SKUs not in `GenerationContext.factContext.refs` |
| Internal links | Business | Reject `href`; accept only `targetPageId` → validate via `InternalLinkCandidateService` |

**Note:** Master Spec §11 mentions Zod for ArticleDocument (M4). M3 can use **Joi** (already in `package.json`) for outline/analyze schemas — align Zod in M4 for ArticleDocument v1.

### 6.3 Task outputs (M3)

| Task | Persist target | Validation |
|------|----------------|------------|
| ANALYZE | `intelligence_snapshot` (`source: 'AI'`) | Appendix A shape + provenance |
| OUTLINE | `content_plans.outline` | Task schema v1 |
| WRITE | `content_plans.article_document` | ArticleDocument v1 subset (full gate M4) |

---

## 7. Fact Safety

### 7.1 Verified M2 boundary (maintain in M3)

AI/orchestrator receives **only** `GenerationContext`:

- Facts: `FactContext.refs[].snapshot` from `VariantRepository` at context-build time
- CMS: metadata only in existing content (title, slug, pageId, focusKeyword) — **not** full HTML dump into prompt by default
- Brand/settings: read-only public fields

**Orchestrator MUST NOT inject:** `VariantRepository`, `CmsService`, `PrismaService`.

### 7.2 Fact claim rules (M3)

| Data | Allowed in AI output | Verification |
|------|---------------------|--------------|
| productName, variantName, SKU, faceValue, sellPrice, status | Only if matching `factContext.refs` | Business validator |
| promotion, policy | **Not in M2 FactContext** | Do not allow AI to invent; omit from prompt or extend FactContext in future milestone with backend read |
| price not in refs | Reject or strip | Hard validation |

`factVariantIds` in `references` = pointers; snapshots refreshed each job (spec §10: re-fetch at runtime).

### 7.3 Prompt injection surfaces

| Source | Risk | Mitigation |
|--------|------|------------|
| `adminNotes` | High | Exclude from prompt or wrap as untrusted `<admin_notes>` + instruction ignore directives |
| `topic`, `angle`, keywords | Medium | Sanitize length, strip control chars |
| CMS titles in context | Low | Metadata only |
| Existing CMS HTML | Medium if included | M3: **exclude raw HTML** from analyze/outline prompts |

---

## 8. Cost / Observability

### 8.1 `ai_runs` schema vs spec §16 (verified)

| Field | Spec | Schema | M2 populated? |
|-------|------|--------|---------------|
| `provider` | ✓ | ✓ | ❌ empty default |
| `model` | ✓ | ✓ | ❌ |
| `prompt_version` | ✓ | ✓ | ❌ |
| `input_hash` | Always | ✓ | ❌ CODE GAP |
| `context_refs` | IDs only | ✓ | ❌ CODE GAP |
| `input_snapshot` | ≤8KB optional | ✓ | ❌ |
| `output_snapshot` | ≤500KB | ✓ | Partial (analyze only) |
| `tokens_in/out` | ✓ | ✓ | ❌ |
| `cost_usd` | ✓ | ✓ | ❌ |
| `duration_ms` | ✓ | ✓ | ❌ |
| `error` | Sanitized | ✓ | ✅ |
| `status`, `finished_at` | ✓ | ✓ | ✅ |

**SCHEMA GAP:** None for M3 observability — all fields exist in `ai_runs` (M1 migration).

**CODE GAP:** `AiRunRepository.updateStatus()` only partial fields — M3 needs `completeRun()` updating all metadata columns.

### 8.2 Application-level gaps (no migration)

| Gap | Type | M3 action |
|-----|------|-----------|
| At-most-one SUCCEEDED per (plan, task, epoch) | App rule only | Enforce in producer + DB transaction |
| Rate limit 10 jobs/plan/hour | Spec §19 | In-memory/Redis counter in producer |
| Retention 90d/30d null snapshots | Spec §16 | M6 — defer |
| AI run list API | Spec §17 | M3 controller endpoints |

### 8.3 Logging

Use existing `ContentAutomationAuditService` (structured Logger) + ai_run row.  
Never log: API keys, full prompts with secrets, decrypted `content.ai`.

---

## 9. Security

| Topic | Analysis | M3 requirement |
|-------|----------|----------------|
| **API keys** | Spec: `content.ai` encrypted in `system_settings` | New `ContentAiConfigService` using `SettingsEncryptionService` — **read in worker only** |
| **Secrets in context** | GenerationContext must exclude credentials | Config service never merges keys into context |
| **Prompt injection** | User fields + adminNotes | Sanitize / exclude; system prompt hardening |
| **CMS content** | Full HTML risky | Pass summaries/metadata only |
| **External content** | Out of MVP | No web fetch in M3 |
| **PII** | Brand context: hotline, email, address | Public business info OK; no customer/order PII in context |
| **Logging SC-15** | Error field sanitized | Strip key patterns from provider errors |
| **Permission** | `cms.manage` | Keep on all AI enqueue endpoints |
| **Auth** | Admin only | No public AI routes |

---

## 10. Feature Flag / Rollback

### 10.1 Verified behavior

`CONTENT_AUTOMATION_ENABLED !== 'true'` (default OFF):

| Surface | Behavior |
|---------|----------|
| API | `ContentAutomationEnabledGuard` → 503 |
| Producer | `ServiceUnavailableException` |
| Worker | Early return skip (logs warning) |
| Worker registration | `shouldRegisterWorkers()` — worker class registered but skips |
| CMS / public | No integration in M2/M3 path |

### 10.2 Rollback (spec §23)

1. Set flag OFF + restart → **immediate stop AI calls**
2. Optional pause `content_automation_queue` in Redis
3. In-flight RUNNING jobs: may complete one call — acceptable; no CMS mutation in M3 orchestrator

**M3 confirm:** Orchestrator **must not** call CMS write / publish (deferred M5 adapter).

---

## 11. Existing System Safety

### 11.1 M3 can implement without modifying

| System | Verified |
|--------|----------|
| CMS (`cms.service.ts`, repository, public) | ✅ No imports from content-automation |
| Product module | ✅ Read-only injection only (M2) |
| Order / Payment / Provider | ✅ Isolated |
| Public Web | ✅ No references |
| Other queues/workers | ✅ Separate processor |

### 11.2 Existing files likely touched (within module + exception list)

| File | Reason | Class |
|------|--------|-------|
| `content-automation.worker.ts` | Orchestrator dispatch | Module |
| `content-automation.module.ts` | Register providers | Module |
| `content-automation-queue.producer.ts` | OUTLINE/WRITE enqueue | Module |
| `content-plan.service.ts` | generate-outline/article APIs | Module |
| `content-automation-admin.controller.ts` | M3 endpoints | Module |
| `ai-run.repository.ts` | Full run metadata update | Module |
| `content-intelligence.service.ts` | Delegate to orchestrator | Module |
| `content-automation-config.service.ts` | Read content.ai | Module |
| `prisma/seed.mjs` | Seed prompts | Optional B |

**Should NOT require:** `cms.service.ts`, `product.service.ts`, `order/**`, `payment/**`, `apps/web/**`, `queue.constants.ts` (queue already registered).

**Dependency note:** Implementing M3 will require **one HTTP client strategy** (native `fetch` preferred to avoid SDK lock-in) — decision at implementation, not architecture block.

---

## 12. M3 File Plan (proposed, no code)

### 12.1 New files (~18–22)

```text
src/modules/content-automation/
  orchestrators/
    ai-orchestrator.service.ts
    ai-orchestrator.service.spec.ts
  providers/
    ai-provider.interface.ts
    ai-provider.router.ts
    ai-provider.errors.ts
    openai-compatible.provider.ts          # or generic HTTP adapter
    mock-ai.provider.ts                    # tests
  prompts/
    prompt-composer.service.ts
    prompt-composer.service.spec.ts
    prompt-template.types.ts
  config/
    content-ai-config.service.ts
    content-ai-config.service.spec.ts
  validators/
    ai-output.parser.ts
    ai-output.validator.ts
    analyze-output.validator.ts
    outline-output.validator.ts
    write-output.validator.ts
  handlers/
    analyze-result.handler.ts
    outline-result.handler.ts
    write-result.handler.ts
  guards/
    ai-worker-guard.service.ts
  strategies/
    heuristic-analyze.strategy.ts          # extracted from M2
  entities/
    ai-completion.types.ts
  utils/
    input-hash.util.ts
    context-sanitizer.util.ts
```

### 12.2 Modified files (~8–10)

Listed in §11.2.

### 12.3 Tests (M3)

| Suite | Focus |
|-------|-------|
| `ai-orchestrator.service.spec.ts` | Mock provider, full pipeline |
| `prompt-composer.service.spec.ts` | Template render, no secrets |
| `ai-output.validator.spec.ts` | Malformed JSON, business rules |
| `ai-worker-guard.service.spec.ts` | Epoch stale, status mismatch |
| `content-automation.worker.spec.ts` | Job routing |
| Integration | MockAiProvider + queue job |
| Regression | CMS, existing queues, flag OFF |

### 12.4 Admin (optional M3 slice)

- AI Runs tab read-only: `GET /ai-runs`, `GET /ai-runs/:id` (spec §17)
- Enqueue buttons: generate-outline, generate-article on plan detail
- **No** prompt admin UI (out of MVP)

### 12.5 Dependencies (implementation decision)

| Option | Pros | Cons |
|--------|------|------|
| Native `fetch` + provider REST | No new npm dep, full adapter control | More adapter code |
| Official SDK (openai, etc.) | Less boilerplate | Vendor lock-in, dependency add |

Recommendation: **`fetch`-first adapter** implementing `AiProvider` — satisfies abstraction without mandating SDK in architecture review.

---

## 13. M3 Risks

### P0 — Must resolve before prod AI

| Risk | Impact | Mitigation |
|------|--------|------------|
| **Provider not selected / not evaluated** | Wrong quality or cost | Owner gate + VN eval set |
| **No epoch guard** | Stale job mutates plan | `AiWorkerGuardService` |
| **Double AI billing on retry** | Cost | SUCCEEDED check before provider call |
| **API key exposure** | Security breach | Encrypted settings + never in context/logs |
| **AI invents price/SKU** | Commercial misinformation | Fact validator hard reject |
| **Feature flag misconfigured ON** | Unexpected cost | Default OFF + staging soak |

### P1 — High priority early M3

| Risk | Impact | Mitigation |
|------|--------|------------|
| **Malformed structured output** | FAILED runs, ops noise | Strict schema validation + clear errors |
| **Prompt injection via adminNotes** | Off-brand / leaked instructions | Exclude or sandbox |
| **Context size overflow** | Truncation, bad output | Token budget estimator + truncate rules |
| **Cost overrun** | Budget | cost_usd tracking + rate limit 10/plan/hour |
| **Heuristic → AI analyze regression** | Product trust | Keep heuristic fallback; `source` provenance |
| **input_hash not implemented** | Poor audit trail | SHA-256 of sanitized prompt |

### P2 — Monitor / M4+

| Risk | Impact | Mitigation |
|------|--------|------------|
| Provider outage | Queue backlog | BullMQ retry + admin alert |
| Hallucinated internal links | Bad SEO | targetPageId backend validation (M2 ✅) |
| Prompt version drift | Inconsistent output | Seed + version pin in ai_runs |
| Joi vs Zod split | Two validators | Document; unify in M4 ArticleDocument |
| Retention job missing | DB growth | M6 |
| promotion/policy facts absent | Incomplete commercial content | Extend FactContext when Product exposes read API |

---

## 14. Pre-Implementation Checklist

- [ ] Owner selects AI provider candidate for eval (not necessarily final prod)
- [ ] Agree prompt `content` JSON convention + seed templates v1
- [ ] Implement `content.ai` reader (encrypted) — **no schema migration**
- [ ] Implement worker epoch guards
- [ ] Extract heuristic analyze to strategy (no duplicate pipeline)
- [ ] Mock AI provider for CI
- [ ] Staging E2E with flag ON, cost monitoring

---

## 15. Verdict

### M3 ARCHITECTURE READY

Architecture có thể triển khai trong pipeline hiện có với injection tại **`AiOrchestrator`** từ worker, tái sử dụng **`ContextBuilderService` / `GenerationContext`**, abstraction **`AiProvider`** + **`AiProviderRouter`**, prompt versioned qua **`ai_prompt_templates`**, lifecycle map vào **`ai_runs` + generation_epoch + BullMQ idempotency**.

**Không bị block bởi schema migration.**  
**Block thực tế trước code:** provider selection, prompt seed convention, `content.ai` config service, worker guard implementation.

---

**STOP — Không bắt đầu M3 implementation trong review này.**
