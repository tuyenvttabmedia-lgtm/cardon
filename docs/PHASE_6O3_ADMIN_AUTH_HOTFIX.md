# Phase 6O.3 — Admin Auth Redirect Hotfix + Local Redeploy

**Date:** 2026-06-22  
**Scope:** Admin frontend auth state, login redirect, local deployment only.  
**Out of scope:** Backend auth logic, permissions, new features.

---

## Root Cause

`useAuth()` was implemented as a **standalone hook with local React state** — not a shared Context Provider.

Each component calling `useAuth()` (`LoginPage`, `AuthGuard`, `AdminLayout`, etc.) had **its own isolated auth state**.

**Failure sequence:**
1. Login page calls `login()` → updates **only** LoginPage's hook instance (`user` set).
2. `router.push('/dashboard')` navigates to dashboard.
3. `AuthGuard` uses a **different** hook instance where `user` is still `null`.
4. `AuthGuard` sees `!isAuthenticated` → redirects back to `/login` (previously via `window.location.href`).
5. User sees a flash and stays on `/login`. Manual URL entry to `/dashboard` could work if tokens were in localStorage and a full reload re-synced one instance.

This matches the web app bug pattern already fixed in `apps/web/contexts/AuthContext.tsx`.

---

## Fix

Introduced a shared **`AuthProvider`** (React Context) for admin, mirroring the customer web app pattern.

### After successful login
1. Save access + refresh tokens to `localStorage`
2. Set user state immediately from login response
3. Fetch `/auth/me` and update user + permissions
4. `router.replace('/dashboard')` + `router.refresh()` from login page
5. Shared context ensures `AuthGuard` sees `isAuthenticated: true` instantly — no full page reload

### Auth guard improvements
- Replaced `window.location.href` with `router.replace()` to avoid hard reload loops
- Authenticated users on `/login` → redirect to `/dashboard`
- Unauthenticated users on protected routes → redirect to `/login`
- Login page waits for `authLoading` before rendering form

---

## Files Changed

| File | Change |
|------|--------|
| `apps/admin/contexts/AuthContext.tsx` | **New** — shared AuthProvider with login/logout/sync |
| `apps/admin/hooks/useAuth.ts` | Re-exports `useAuthContext` from provider |
| `apps/admin/app/layout.tsx` | Wraps app with `<AuthProvider>` |
| `apps/admin/components/layout/AdminShell.tsx` | AuthGuard uses `useEffect` + `router.replace` |
| `apps/admin/app/login/page.tsx` | Loading gate, `router.replace('/dashboard')` after login |

**Not changed:** `apps/admin/services/api-client.ts`, backend auth modules, permissions.

---

## Localhost Status

### Deploy command
```bash
docker compose -f docker-compose.local-full.yml --env-file .env.local-full up -d --build
```

**Note:** After container recreate, restart nginx if upstream returns 502:
```bash
docker restart cardon-local-full-nginx
```
(Docker DNS IP for `admin`/`web`/`partner` changes on recreate; nginx caches upstream IPs until reload.)

### Migrations
16 migrations applied — database schema up to date.

### Portal health (2026-06-22)

| URL | Status |
|-----|--------|
| http://localhost | ✅ 200 |
| http://admin.localhost | ✅ 200 |
| http://partner.localhost | ✅ 200 |

### Smoke test results

| Test | Result |
|------|--------|
| Admin login → auto redirect `/dashboard` | ✅ PASS (no Ctrl+F5) |
| Admin dashboard loads after login | ✅ PASS |
| Customer homepage | ✅ PASS (200) |
| Partner login page | ✅ PASS (200) |

**Admin credentials:** `superadmin@cardon.vn` / `SuperAdmin2026!`

---

## Verdict

**Phase 6O.3: PASS** — Admin login redirect fixed; local-full stack rebuilt and reachable.
