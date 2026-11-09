# 28 — W2 Read-only security verification (pre-acceptance)

**Mode:** AUDIT READ-ONLY — no source/DB/Redis/env/prod changes.  
**Basis:** `27-w2-implementation-completion-report.md` + current working tree.  
**Jest re-run (local, non-destructive unit):** 6 suites / 18 tests **passed**  
(`support-upload|request-client.util|abuse-rate-limit|payment-skip-throttle|order-create-unchanged|image-magic`).

---

## Verdict (executive)

**CONDITIONAL — chưa đủ PASS tuyệt đối để nghiệm thu “sạch”.**

| Area | Status |
|------|--------|
| A Support upload authz (code path) | Mostly **PASS** with residual Medium |
| A Support upload HTTP IDOR matrix | **NOT VERIFIED** (no HTTP e2e in this audit) |
| B Trust proxy / topology | **PARTIAL** — repo nginx/CF configs present; **prod live topology NOT VERIFIED** |
| C KYC exclusive lock (code) | **PASS** design; concurrency stress **NOT VERIFIED** |
| D Redis abuse limiter | **PASS** (unit) |
| E Webhook/IPN isolation | **PASS** (source + unit) |

**Trước nghiệm thu W2 nên xử lý hoặc chấp nhận rủi ro ghi nhận:**  
1. Ownership check dùng `String.includes` (substring) — Medium.  
2. Thiếu HTTP tests: unauth / cross-user / static 401.  
3. `TRUST_PROXY_HOPS=1` phù hợp CF→nginx→API **nếu** origin không public; direct-to-API spoof **chưa chứng minh** bằng firewall prod.

**Có thể nghiệm thu W2 code-scope** nếu owner chấp nhận residual + bắt buộc smoke HTTP trước deploy.

---

## A. Support upload — access control

### A1. Download controllers / services

| Role | Route | File | Lines | Evidence |
|------|-------|------|-------|----------|
| Customer | `GET /account/support/files/:filename` | `support-account.controller.ts` | L29–30 guards JWT+Roles(CUSTOMER); L93–106 download | Calls `assertCustomerCanDownload` then `openReadStream` |
| Admin | `GET /admin/support/files/:filename` | `support-admin-files.controller.ts` | L10–12 Jwt+Permissions(`support.manage`); L16–24 | **No** per-ticket ownership — any staff with permission |
| Upload | `POST /account/support/upload` | same account controller | L80–90 | JWT customer + abuse bucket `support_upload` |
| Storage | — | `support-upload.service.ts` | L41–74 save; L77–117 open | Magic bytes; filename `{userId}_{ts}_{hex}` |

**Severity:** Info · **PASS** (paths exist as designed)

### A2. Customer ownership of ticket / message

| Step | File | Lines |
|------|------|-------|
| Filename sanitize | `support-upload.service.ts` `assertSafeFilename` | L77–88 — reject `..` `/` `\` and non `[A-Za-z0-9._-]+` |
| Prefix ownership (new files) | `support.repository.ts` `filenameOwnedByUser` | L90–92 — `filename.startsWith(`${userId}_`)` |
| Ticket message ownership | `support.repository.ts` `customerOwnsAttachment` | L69–86 — messages on tickets where `ticket.customerId = customerId`, URL contains marker+filename |
| Gate | `support.service.ts` `assertCustomerCanDownload` | L139–147 — prefix OR owns; else `NotFoundException` |

**Severity:** Info · **PASS** (logic present)

### A3. File actually on a ticket message

Evidence: `customerOwnsAttachment` loads up to 1000 messages with `attachmentUrl` for that customer’s tickets and checks:

```70:86:src/modules/support/repositories/support.repository.ts
    const markers = [
      `/uploads/support/${filename}`,
      `/account/support/files/${filename}`,
      `/admin/support/files/${filename}`,
    ];
    ...
    return markers.some((marker) => url.includes(marker));
```

**Finding A-SUBSTR — Medium · FAIL (hardening gap)**  
`includes(marker)` can false-positive if another attachment URL contains the marker as substring (e.g. filename `a.png` vs stored `.../a.png.bak` or longer name embedding the path). Recommend exact suffix / path-segment equality before/after accept.

**Severity:** Medium · **FAIL** (logic weakness) — not proven exploited; recommend fix before or immediately after accept.

### A4. New files with userId prefix

`saveScreenshot` L62: `` `${userId}_${Date.now()}_${randomBytes(16).toString('hex')}${ext}` ``  
Download allows via `filenameOwnedByUser` **before** attach — intentional for UX.

**Severity:** Info · **PASS**

### A5. Admin `support.manage`

`SUPPORT_PERMISSION = 'support.manage'` — `support.constants.ts` L1; admin files controller L12 `@Permissions(SUPPORT_PERMISSION)`.

**Finding A-ADMIN-ANY-FILE — Low · PASS (by design)**  
Admin with permission can stream **any** safe filename under `uploads/support/` without ticket binding. Acceptable for support staff; document residual.

### A6. Path traversal

Unit tests in `support-upload.service.spec.ts` — `../etc/passwd`, `a/b.png` → Forbidden.  
Jest re-run: **PASS**.

**Severity:** Info · **PASS** (unit)

### A7. Nest static + Nginx `/uploads/support`

| Layer | File | Lines | Behavior |
|-------|------|-------|----------|
| Nest | `main.ts` | L67–73 | `/uploads/support` → **401 JSON** before static |
| Nest | `main.ts` | L75 | other `/uploads` still `express.static` |
| Nginx | `infra/nginx/conf.d/snippets/uploads-proxy.conf` | L1–6 | `location /uploads/` → `cardon_api/uploads/` + Cache-Control public 7d |

**Finding A-NGINX-CACHE — Medium · NOT VERIFIED (deploy)**  
Nginx still advertises `Cache-Control: public` on `/uploads/` proxy. After Nest returns 401 for support, CDN/browser should not cache file body; **verify** no edge cached **old** public support objects from before W2. Repo cannot prove purge.

**Severity:** Medium · **NOT VERIFIED** for live cache/purge

### A8. Old static URL cannot read support files

Code path: request `/uploads/support/...` hits Nest middleware → 401.  
HTTP live probe **not run** in this audit (no server assumption).

**Severity:** High for product · **PASS** (code) / **NOT VERIFIED** (runtime HTTP)

### A9. Cross-user / IDOR matrix

| Scenario | Expected | Verified how | Status |
|----------|----------|--------------|--------|
| Unauthenticated `GET .../files/:f` | 401 (JwtAuthGuard) | Code L29–30 | **PASS** (code) / **NOT VERIFIED** (HTTP) |
| Customer A → B’s file (no prefix, not on A’s tickets) | 404 | Code L139–147 | **PASS** (code) / **NOT VERIFIED** (HTTP) |
| Filename swap in URL | sanitize + ownership | Unit + code | **PASS** (unit sanitize) / **NOT VERIFIED** (HTTP IDOR) |
| Unattached legacy (no userId_ prefix, not in messages) | 404 | Code | **PASS** (code) |
| Legacy on own ticket (`/uploads/support/old.png` in message) | allow via API files route | Code markers | **PASS** (code) |
| Admin download | allow with permission | Code | **PASS** (code) |
| Path traversal | 403 | Unit **PASS** | **PASS** |
| Static old URL | 401 | Code main.ts | **PASS** (code) / **NOT VERIFIED** (HTTP) |

**Finding A-NO-HTTP-E2E — High (process) · NOT VERIFIED**  
Không có Jest/e2e HTTP cho IDOR/unauth trong audit này. Khuyến nghị smoke local trước nghiệm thu cứng hoặc trước deploy.

---

## B. Trust proxy / IP spoofing

### Evidence in repo

| Item | Location |
|------|----------|
| `TRUST_PROXY_HOPS` → `app.trustProxyHops` | `configuration.ts` L40–44 default **1** |
| Express `trust proxy` | `main.ts` L50–51 |
| `extractClientIp` | `request-client.util.ts` L9–13 — **only** `req.ip` / socket; **no** raw XFF parse |
| Unit anti-spoof | `request-client.util.spec.ts` — ignores forged XFF when `req.ip` set; no blind XFF — Jest **PASS** |
| Nginx CF real IP | `00-cloudflare-real-ip.conf` — `real_ip_header CF-Connecting-IP`; `set_real_ip_from` CF ranges |
| Nginx → API headers | `proxy-headers.conf` L2–5 — `X-Real-IP $remote_addr`; `X-Forwarded-For $proxy_add_x_forwarded_for` (**append**) |

### Answers

1. **Hops in intended prod path (from repo):** Client → Cloudflare → Nginx → API = **1 hop trusted at Express** (nginx), after nginx has already replaced `$remote_addr` with CF connecting IP.  
2. **Trusted at nginx:** Cloudflare IP ranges (`set_real_ip_from`). **Trusted at Express:** 1 proxy hop (default).  
3. **XFF behavior at nginx:** `$proxy_add_x_forwarded_for` **appends**; with CF real_ip, `$remote_addr` should already be client IP before append.  
4. **Client spoof via XFF to API:** If traffic **must** go CF→nginx→API and origin is locked, spoofing public XFF is largely neutralized by CF real_ip + trust 1. If client hits **API directly** with `TRUST_PROXY_HOPS=1`, Express may treat XFF as trusted — **spoof possible**.  
5. **`TRUST_PROXY_HOPS=1` fitness:** **Likely appropriate** for CF→nginx→API as coded; **NOT VERIFIED** against live docker network / extra proxies.  
6. **Direct API access:** Safer with `TRUST_PROXY_HOPS=0` locally; prod should **firewall origin** to Cloudflare/nginx only — **NOT VERIFIED** in this audit (no prod access).

**Finding B-ORIGIN-EXPOSURE — High · NOT VERIFIED (ops)**  
Cần xác minh firewall/security group trước deploy.

**Finding B-PAYMENT-XFF — Low · PASS (noted)**  
`payment.controller.ts` L88–90 vẫn parse XFF[0] cho webhook IP logging — không phải abuse limiter; residual spoof on log IP only if direct access.

---

## C. KYC exclusive submit

### Evidence

| Step | File | Lines |
|------|------|-------|
| HTTP | `agent.controller.ts` | L66–77 `@Roles(AGENT)` + abuse `kyc_submit` → `submitKyc` |
| Pre-checks (outside tx) | `agent.service.ts` | L92–106 status + KYC status |
| Exclusive upsert | `agent.repository.ts` `tryUpsertSubmittedExclusive` | L293–343 |
| Lock | same | L294–296 `SELECT id FROM agents WHERE id = $1::uuid FOR UPDATE` |
| Order | same | lock → `findUnique` KYC → reject if SUBMITTED/APPROVED → `upsert` SUBMITTED |
| Alternate path | `upsertSubmitted` L221–272 | **Still present** but **not** called from `AgentService.submitKyc` (grep: only exclusive used in service) |

### Analysis

1. **FOR UPDATE:** yes, on `agents` row.  
2. **Transaction boundary:** entire check+upsert inside `prisma.$transaction`.  
3. **Order:** lock → status check → upsert. Pre-checks outside are TOCTOU-safe because exclusive re-checks.  
4. **Other submit paths:** only `POST /agents/kyc` → `submitKyc` → exclusive (admin approve/reject are different methods).  
5. **Deadlock:** single-row lock on `agents` by id — low deadlock risk vs multi-lock.  
6. **Concurrency tests:** `agent.service.spec` mocks `tryUpsertSubmittedExclusive` — **sequential unit only**. **No** dual parallel HTTP/DB stress run in this audit (would mutate DB; out of read-only data-change preference).

**Finding C-NO-STRESS-TEST — Medium · NOT VERIFIED**  
Recommend local concurrent dual-submit against staging DB before deploy; optional unique constraint later (migration — stop if required).

**Severity for lock design:** **PASS**

---

## D. Redis abuse limiter

| Check | Evidence | Status |
|-------|----------|--------|
| Lua atomic INCR+TTL | `abuse-rate-limit.constants.ts` L91–97 | **PASS** |
| Key TTL per dimension | `incr` passes `ttlSeconds` from bucket config; EXPIRE on first hit | **PASS** |
| Timeout / fail-closed 503 | `abuse-rate-limit.service.ts` L80–90; unit mock ECONNREFUSED | **PASS** (Jest) |
| 429 over limit | L70–78; unit | **PASS** |
| Kill switch | `isEnabled` L37–39; `ABUSE_RATE_LIMIT_ENABLED` via config L60–61 | **PASS** |
| Prefix isolation | `cardon:abuse:` L1 constants | **PASS** |
| Dedicated ioredis | service `getClient` separate from Bull (`maxRetriesPerRequest: 1`, commandTimeout) | **PASS** (code) |
| Cardinality / memory | Keys = buckets × dimensions × distinct ids; all TTL’d (15m–24h) | **PASS** with ops monitor note |
| No limiter on `POST /orders` | `order-create-unchanged.w2.spec.ts` | **PASS** |
| Multi-instance | Shared Redis keys — by design; **not** load-tested here | **PASS** (design) / **NOT VERIFIED** (multi-process load) |

**Finding D-SKIP-NO-DIM — Low · PASS (noted)**  
If required dimension missing (e.g. no IP), `consumeOrThrow` **skips** (L58–62 warn) rather than fail-closed — edge case for mis-extracted IP.

---

## E. Webhook / IPN inventory

| Route | Controller | SkipThrottle | Abuse limiter | Signature / replay |
|-------|------------|--------------|---------------|-------------------|
| `POST /payments/ipn/esim/sepay` | `payment.controller.ts` L67–75 | **Yes** L69 | **No** | `EsimSepayPaymentService.handleIpn` (not re-audited line-by-line here) |
| `POST /payments/webhook/:gateway` | L78–152 | **Yes** L80 | **No** | `provider.verifyWebhook` then process; duplicate flags in `payment.service.ts` L528+ / L602+ |
| Agent API `*` | `agent-api.controller.ts` | Class `@SkipThrottle` | N/A | API key auth |

Payment create / sync are **not** SkipThrottle (authenticated/optional JWT) — out of abuse W2 webhook scope.

Jest: `payment-skip-throttle.spec.ts` **PASS**; no `AbuseRateLimit` import in payment controller.

**SePay wallet / fulfillment / eSIM workers:** not modified in this verification; no code changes made.

**Status:** **PASS** for W2 isolation requirements (source).

---

## Findings summary table

| ID | Severity | Result | Topic |
|----|----------|--------|-------|
| A-SUBSTR | Medium | **FAIL** | Ownership `includes()` substring |
| A-NO-HTTP-E2E | High (process) | **NOT VERIFIED** | Unauth/IDOR HTTP smoke |
| A-NGINX-CACHE | Medium | **NOT VERIFIED** | Old CDN/public cache of support files |
| A-ADMIN-ANY-FILE | Low | **PASS** | Staff can read any support file |
| B-ORIGIN-EXPOSURE | High (ops) | **NOT VERIFIED** | Direct API + trust hop spoof |
| B-PAYMENT-XFF | Low | **PASS** | Webhook log IP still uses XFF[0] |
| C-NO-STRESS-TEST | Medium | **NOT VERIFIED** | Parallel KYC submit |
| D-SKIP-NO-DIM | Low | **PASS** | Skip when dimension missing |
| E-SKIP | Info | **PASS** | Webhook SkipThrottle + no abuse |

---

## Conclusion

### Đủ nghiệm thu W2?

**Chưa đủ cho “PASS tuyệt đối”.**  
**Có thể nghiệm thu có điều kiện** nếu owner:

1. Chấp nhận A-SUBSTR tạm thời hoặc yêu cầu patch nhỏ trước accept.  
2. Bắt buộc HTTP smoke (unauth, cross-user, static 401) trên local/staging trước deploy.  
3. Xác minh origin firewall + (nếu có) purge cache `/uploads/support/*` trước prod.

### Phải khắc phục trước nghiệm thu (khuyến nghị)

- **A-SUBSTR:** exact path match cho ownership (code change — ngoài scope audit này).  
- **A-NO-HTTP-E2E:** chạy smoke và ghi kết quả vào nghiệm thu.

### Chỉ cần xác minh khi chuẩn bị deploy

- **B-ORIGIN-EXPOSURE** / trust hop vs live topology  
- **A-NGINX-CACHE** purge  
- **C-NO-STRESS-TEST** concurrent KYC on staging DB  

### Không làm trong audit này

Không sửa code, không migration, không deploy, không mở W3+.

---

**Stop.** Chờ owner quyết định nghiệm thu có điều kiện hoặc yêu cầu patch trước accept.
