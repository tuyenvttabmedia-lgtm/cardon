# BUILD 6033.9.4 — ADMIN POLISH & DEAD CODE CLEANUP

**Build label:** `6033.9.4 ADMIN POLISH & DEAD CODE CLEANUP`

Navigation, redirects, and dead-code cleanup only — **no Payment/Order/Provider/Ledger/Webhook business logic changes**.

---

## Phase A — Quick fixes

| Change | Detail |
|--------|--------|
| Backend feature-flags href | Search index + module overview → `/configuration/system` |
| Dead client API | Removed unused `adminApi.listAuditLogs` |
| Support sidebar | Added **Hỗ trợ** → `/support/tickets` (`support.manage`) |
| Finance hub | Removed `/finance` hub page; redirect → `/finance/dashboard`; sidebar + sub-nav updated |
| Redirects | `/finance`, `/configuration/advanced`, `/configuration/security`, `/configuration/integrations` |

## Phase B — Configuration consolidation

| Change | Detail |
|--------|--------|
| Advanced + Security | Merged into `/configuration/system` (reload, secrets info, health link) |
| Integrations | Test panel moved to `/configuration` overview (`ConfigurationIntegrationsPanel`) |
| Sub-nav | Removed Advanced, Security, Integrations (16 → 13 config sections) |
| Component rename | `components/settings/*` → `components/configuration/*` |

---

## Route count

- **Before:** 55 admin pages
- **After:** 51 admin pages (+ redirects preserve old URLs)

## Redirects (`apps/admin/next.config.ts`)

- `/finance` → `/finance/dashboard`
- `/configuration/advanced` → `/configuration/system`
- `/configuration/security` → `/configuration/system`
- `/configuration/integrations` → `/configuration`
- (Existing) `/settings/*`, `/audit`, `/finance/agents`, `/configuration/feature-flags`, `/monitoring/partner-api-logs`

## Deploy

```powershell
cd C:\Users\MyHome\Projects\cardon
docker compose -f docker-compose.local-full.yml --env-file .env.local-full build admin api
docker compose -f docker-compose.local-full.yml --env-file .env.local-full up -d --force-recreate admin api nginx
```

Footer should show: `6033.9.4 ADMIN POLISH & DEAD CODE CLEANUP`
