# 43 — Turnstile vs CF `w4-challenge-register` conflict

**Date:** 2026-11-09  
**Symptom:** Register form shows Turnstile «Thành công!» then red «Phiên đăng nhập không còn hiệu lực».

## Root cause (prod evidence)

| Observation | Evidence |
|-------------|----------|
| Widget + Site Key OK | `GET /api/v1/public/turnstile` → enabled + siteKey; CF widget success |
| Server siteverify works | Internal API smoke → `turnstile_reject success_false` after dummy token |
| User submit never hits origin | nginx: page `/register` + `public/turnstile` from `1.53.160.212` @ 08:09Z; **zero** `POST /api/v1/auth/register` |
| Misleading FE copy | Non-JSON / 403 mapped via `statusKey(403)` → `error.unauthorized` |

**Cause:** W4 S2 Custom Rule `w4-challenge-register` = **Managed Challenge** on  
`POST /api/v1/auth/register` and `POST /api/v1/auth/agent-register`.  
Browser `fetch` JSON cannot complete Managed Challenge → CF responds at edge → Nest never runs Turnstile siteverify for that attempt.

## Owner fix (Cloudflare Dashboard) — required

1. Security → WAF → Custom rules  
2. Rule **`w4-challenge-register`**  
3. Set action to **Skip** (same components as other skip rules) **or Disable**  
4. Save

Rationale: Turnstile (admin-configured) + W2 abuse + Nest throttle already protect register. Double Managed Challenge breaks SPA signup.

Keep `w4-skip-payments` / partner / health skips unchanged.

## Code follow-ups (shipped with this note)

- AuthContext: persist register tokens; do not fail signup if `/auth/me` enrichment fails  
- FE: map edge 403 / HTML / `cf-mitigated` to `error.edgeBlocked`, not session-expired  
- FE: map 429 to `error.rateLimited`
