# 29 — W2 Hardening completion report (LOCAL ONLY)

**Status:** Hardening A-SUBSTR + HTTP smoke fixture completed on local working tree — **await owner nghiệm thu**.  
**Mode:** LOCAL ONLY — no deploy, no migration, no schema change, no production data/JWT.  
**Refs:** `27-w2-implementation-completion-report.md`, `28-w2-read-only-security-verification.md`.  
**Scope closed:** W2 hardening only. W3/W4/W5/W6 **not opened**.

---

## Verdict

| Item | Result |
|------|--------|
| A-SUBSTR exact attachment ownership | **FIXED** |
| Unit ownership positive/negative | **PASS** (9 cases) |
| HTTP smoke (Nest fixture, local) | **PASS** (8 scenarios) |
| W1/W2 regression Jest | **PASS** (13 suites / 75 tests) |
| Payment / SePay / ledger / fulfillment / eSIM / POST `/orders` limiter | **Unchanged** |
| Deploy / migration / prod | **Not done** (by design) |

**Recommendation:** Owner có thể nghiệm thu W2 code-scope sau hardening này. Residual ops từ doc 28 (nginx cache purge, origin firewall, KYC concurrency stress) vẫn ngoài scope patch này.

---

## 1. Diff chính xác (A-SUBSTR)

### Before (doc 28 Finding A-SUBSTR)

```ts
const markers = [
  `/uploads/support/${filename}`,
  `/account/support/files/${filename}`,
  `/admin/support/files/${filename}`,
];
return markers.some((marker) => url.includes(marker));
```

False-positive risk: stored `/uploads/support/a.png.bak` or `/uploads/support/backup_a.png` could satisfy `includes('/uploads/support/a.png')`.

### After

`SupportRepository.customerOwnsAttachment` delegates to exact matcher:

```ts
return onTickets.some((m) =>
  attachmentUrlMatchesFilename(m.attachmentUrl ?? '', filename),
);
```

New util `support-attachment-url.util.ts`:

1. `normalizeAttachmentPathname` — trim; strip `?`/`#`; parse absolute `http(s)` pathname; reject other schemes.
2. `extractExactSupportAttachmentFilename` — require one of:
   - `/uploads/support/{filename}`
   - `/account/support/files/{filename}`
   - `/admin/support/files/{filename}`
   - bare safe filename (legacy)
   - single path segment only; reject `/`, `\`, `..`, unsafe charset
3. `attachmentUrlMatchesFilename` — `extracted === filename` (exact string equality after safe-filename gate).

`SupportUploadService` filename extraction from stored URL also uses `extractExactSupportAttachmentFilename` (same exact-segment rules).

**Unchanged by design:**

- Prefix ownership `filename.startsWith(`${userId}_`)` for new uploads before ticket attach.
- Admin `support.manage` may stream any safe file under `uploads/support/` (no ticket bind).
- No public reopen of `/uploads/support` static.

---

## 2. Cách sửa A-SUBSTR

| Requirement | Implementation |
|-------------|----------------|
| Remove `includes()` ownership | Removed from repository |
| Exact filename + path segment | Prefix + remainder must be single segment equal to request filename |
| URL forms supported | Relative prefixes above + absolute https URL pathname + bare filename |
| Safe normalize before match | Query/hash stripped; schemes validated; decodeURIComponent guarded |
| No substring of other filenames | `a.png` ≠ `a.png.bak` / `backup_a.png` |
| Keep prefix ownership | `filenameOwnedByUser` unchanged |
| Keep admin permission | `support-admin-files.controller` + `support.manage` unchanged |
| Legacy ticket attachments | Exact match still allows real ticket-bound URLs via authenticated API |

---

## 3. Test cases trước / sau

### Ownership util (`support-attachment-url.util.spec.ts`)

| Case | Before (`includes`) | After (exact) |
|------|---------------------|---------------|
| `/uploads/support/a.png` → `a.png` | Allow | **Allow** |
| `/uploads/support/a.png.bak` → `a.png` | Likely allow (bug) | **Deny** |
| `/uploads/support/backup_a.png` → `a.png` | Deny (marker longer) / fragile | **Deny** |
| `/account/support/files/a.png?x=1` → `a.png` | Allow if marker present | **Allow** (query stripped) |
| Absolute `https://…/uploads/support/legacy-1.png?v=2` | Depends on string | **Allow** |
| `/uploads/support/../x.png` / multi-segment | Weak | **Deny** |
| `javascript:…` | N/A / risky | **Deny** |

### Jest ownership suite

```
PASS src/modules/support/entities/support-attachment-url.util.spec.ts
```

---

## 4. HTTP smoke results

**Harness:** `support-download.http-smoke.spec.ts` — Nest `TestingModule` + fixture Jwt/Roles/Permissions guards. **No production DB/Redis/JWT.** Tokens never printed.

| # | Scenario | Endpoint | Role | Status | File body leaked? | Result |
|---|----------|----------|------|--------|-------------------|--------|
| 1 | No JWT | `GET /account/support/files/{FILE_A}` | none | **401** | No (`FILE_BODY:` absent) | **PASS** |
| 2 | A downloads B’s file | `GET /account/support/files/{FILE_B}` | Customer A | **404** | No | **PASS** |
| 3 | A filename-swap to B | same as #2 | Customer A | not 200 | No | **PASS** |
| 4 | A downloads own file | `GET /account/support/files/{FILE_A}` | Customer A | **200** | Yes (expected) | **PASS** |
| 5 | Static `/uploads/support/{f}` | `GET /uploads/support/any.png` (express mirror of `main.ts`) | none | **401** JSON | No static bytes; message `Authentication required…` | **PASS** |
| 6 | Legacy name on A’s ticket set | `GET /account/support/files/legacy-ticket-file.png` | Customer A | **200** | Yes (expected) | **PASS** |
| 7 | Admin + `support.manage` | `GET /admin/support/files/{FILE_B}` | Admin | **200** | Yes (by design) | **PASS** |
| 8 | Admin without permission | `GET /admin/support/files/{FILE_B}` | Support (no perm) | **403** | No | **PASS** |

**Evidence of non-leak on deny:** responses checked with `hasFileBody = text.includes('FILE_BODY:')` → `false` for cases 1, 2, 3, 8; case 5 body is JSON auth error only.

**Note:** Smoke uses fixture ownership map mirroring `assertCustomerCanDownload` outcomes (prefix + ticket list). Exact URL matching is covered by unit util tests (section 3), not by re-querying a real DB in smoke.

---

## 5. Regression test summary

Command (local, non-destructive):

```text
npx jest --testPathPattern="support-download.http-smoke|support-attachment-url|support-upload|support.service|abuse-rate-limit|payment-skip-throttle|order-create-unchanged|email-policy|auth-registration|agent-registration.email-policy|request-client.util|image-magic" --no-coverage
```

| Result | Value |
|--------|-------|
| Suites | **13 passed** |
| Tests | **75 passed** |
| Failures | **0** |

Covered areas:

- Support upload / download / attachment URL / HTTP smoke
- Support service
- Abuse rate-limit (W2)
- Payment webhook/IPN `@SkipThrottle`
- Order create unchanged (no abuse limiter on POST `/orders`)
- W1 email policy + auth/agent registration policy
- Request client IP + image magic

**Confirmed not touched in this hardening:** payment providers, SePay wallet, ledger, fulfillment workers, eSIM provider worker, schema/migrations, POST `/orders` wiring.

---

## 6. Files changed (hardening delta)

### Added

| File | Purpose |
|------|---------|
| `src/modules/support/entities/support-attachment-url.util.ts` | Exact URL normalize + filename extract/match |
| `src/modules/support/entities/support-attachment-url.util.spec.ts` | Positive/negative A-SUBSTR unit tests |
| `src/modules/support/support-download.http-smoke.spec.ts` | Local fixture HTTP smoke (no prod secrets) |
| `docs/security/phase-1/29-w2-hardening-completion-report.md` | This report |

### Modified

| File | Change |
|------|--------|
| `src/modules/support/repositories/support.repository.ts` | `customerOwnsAttachment` → exact match util |
| `src/modules/support/services/support-upload.service.ts` | Extract filename via exact util |

*(Broader W2 files from report 27 remain in working tree; this report’s code delta for A-SUBSTR is the util + repository/upload wiring + tests above.)*

---

## 7. Rollback

1. Revert `support.repository.ts` ownership to prior marker/`includes` implementation **or** delete util import and restore previous method body.
2. Remove/restore `support-attachment-url.util.ts` (+ spec) and revert `support-upload.service.ts` extract call.
3. Remove `support-download.http-smoke.spec.ts` if undesired.
4. No DB rollback needed (no migration).
5. No Redis key migration for this patch.
6. FE unchanged in this hardening slice.

---

## 8. Residual risks (still open)

| ID | Severity | Status | Notes |
|----|----------|--------|-------|
| A-ADMIN-ANY-FILE | Low | Accepted by design | Admin with `support.manage` can read any safe support filename |
| A-NGINX-CACHE | Medium | **NOT VERIFIED** (ops) | Edge/CDN may retain pre-W2 public support objects — purge before/at deploy |
| B-ORIGIN-EXPOSURE | High | **NOT VERIFIED** (ops) | Direct API access + `TRUST_PROXY_HOPS≥1` can spoof client IP for abuse keys |
| C-NO-STRESS-TEST | Medium | **NOT VERIFIED** | KYC dual-submit concurrency not load-tested against real DB |
| D-SKIP-NO-DIM | Low | Noted | Missing rate-limit dimension skips consume (warn) |
| Smoke vs live Nest `main.ts` | Info | Fixture | Static 401 mirrored in express mini-app; full process boot with real JWT/DB still recommended pre-deploy |
| Ownership take 1000 | Low | Noted | `customerOwnsAttachment` still `take: 1000` messages — very heavy ticket histories could miss older attachments (availability, not cross-tenant) |

---

## 9. Stop conditions met

- [x] No deploy  
- [x] No migration / schema change  
- [x] No production change / no prod data  
- [x] No destructive commands  
- [x] No W3/W4/W5/W6 work  
- [x] Did not reopen public support upload  
- [x] Report **29** written — **waiting owner nghiệm thu**
