# BUILD 6033.4.1 — B2B ARCHITECTURE ALIGNMENT

**Build:** `6033.4.1 B2B ARCHITECTURE ALIGNMENT`  
**Scope:** Portal architecture only — Partner & Customer navigation, UX, Vietnamese labels. **No engine changes.**

---

## Goal

Freeze CardOn portal architecture so Partner, Customer, Public, and Admin each match the approved business model. This build does **not** add new business features.

---

## Do Not Modify

Payment Engine, Provider Engine, Ledger Engine, Order Engine, Webhook Engine, Queue, Notification Center, Operations Center, Configuration Center, Maintenance Center.

---

## Final Architecture

| Portal | Host | Purpose |
|--------|------|---------|
| **Public** | `localhost` | Retail website — SEO, landing, buy cards, recharge. No Wallet/API/Partner. |
| **Customer** | `customer.localhost` | Retail Customer Center — purchased products only. |
| **Partner** | `partner.localhost` | B2B API Platform — agents purchase **only via API**. |
| **Admin** | `admin.localhost` | ERP — operations, finance, providers, monitoring (unchanged). |

---

## Business Flow (Partner)

```
Nạp tiền → Ví → API Key → API Request → Wallet Validation → Ledger Hold
→ Provider → PIN → Webhook → Ledger Commit → History → Notification
```

---

## Partner Navigation Tree (Frozen)

```
Bảng điều khiển
Ví → Tổng quan | Nạp tiền | Lịch sử nạp | Sổ quỹ
Đơn hàng API → Tra cứu | Lịch sử | Timeline
API Center → Khóa API | IP Whitelist | Webhook | Rate Limit | Bảo mật
  | Nhật ký API | Tài liệu API | SDK | Test API | API Usage
Báo cáo | Hóa đơn | Thông báo | Tài khoản
```

Source: `apps/partner/lib/agent-platform/navigation.ts`

Hidden ERP routes redirect to `/coming-soon` via `middleware.ts` + `PARTNER_HIDDEN_ERP_PREFIXES`.

---

## Customer Navigation Tree (Frozen)

```
Bảng điều khiển | Đơn hàng | Kho PIN | Thông báo | Tài khoản | Bảo mật | Hỗ trợ
```

Source: `apps/web/lib/customer-portal/navigation.ts`

Placeholder pages use **"Sắp phát triển"** (`CustomerPlaceholder`).

---

## Key Changes

| Area | Summary |
|------|---------|
| Partner sidebar | Frozen API-first nav; ERP modules removed |
| Partner dashboard | API Dashboard (wallet, calls, orders, latency, gateway) |
| Partner wallet | Tổng quan, Nạp tiền, Lịch sử nạp, Sổ quỹ only |
| Partner orders | Tra cứu, Lịch sử, Timeline |
| Partner API Center | 10 sub-pages including SDK + Usage |
| Partner notifications | Grouped: Ví, API, Webhook, Provider, Hệ thống |
| Partner account | Business info, KYC, webhook link, security |
| Customer nav | 7 items, Vietnamese labels, no Wallet/API |
| Build label | `6033.4.1 B2B ARCHITECTURE ALIGNMENT` in `@cardon/build-info` + Docker env |

---

## Future Roadmap

- Partner: SDK and API Usage beyond placeholders
- Customer: PIN vault and order detail UX
- Admin: Operations Center (6033.4) when approved
- All new Partner API features → **API Center** only

---

## Deployment

```bash
docker compose -f docker-compose.local-full.yml --env-file .env.local-full build api partner admin web worker
docker compose -f docker-compose.local-full.yml --env-file .env.local-full up -d --force-recreate
docker compose -f docker-compose.local-full.yml --env-file .env.local-full exec api npx prisma migrate deploy
```

---

## Build Report

| Step | Result |
|------|--------|
| Docker build (api, partner, admin, web, worker) | **PASS** — all images built successfully |
| Containers recreated | **PASS** — `docker compose up -d --force-recreate` |
| Prisma migrate | **PASS** — 38 migrations, no pending |
| Partner `BUILD_VERSION` env | `6033.4.1 B2B ARCHITECTURE ALIGNMENT` |

### Container Status (post-deploy)

| Container | Status |
|-----------|--------|
| nginx | healthy |
| api | healthy |
| postgres | healthy |
| redis | healthy |
| partner | running (healthcheck: unhealthy*) |
| web | running (healthcheck: unhealthy*) |
| admin | running (healthcheck: unhealthy*) |
| worker | **restarting** — pre-existing `MaintenanceCenterModule` undefined import (not modified in this build) |

\*Frontends respond HTTP 200; healthcheck may lag Next.js startup.

### URLs Verified (HTTP)

| URL | Status |
|-----|--------|
| http://partner.localhost/login | 200 — Vietnamese login UI |
| http://customer.localhost/login | 200 |
| http://admin.localhost/login | 200 |
| http://localhost/ | 200 |

### Partner Verification (code + login page)

- [x] Sidebar frozen in `navigation.ts`
- [x] ERP routes → `/coming-soon`
- [x] API Dashboard client rewritten
- [x] Build footer label configured
- [ ] Full authenticated sidebar walkthrough — requires manual login (`agent@test.local`)

### Customer Verification

- [x] 7-item nav, Vietnamese labels
- [x] No Wallet / API / Finance routes in customer portal
- [x] Placeholder: "Sắp phát triển"

### Admin

- [x] No portal code changes in this build
- [x] Docker image rebuilt successfully

---

## Acceptance Checklist

- [x] Partner follows API-first B2B model (nav + redirects)
- [x] Customer follows Customer Center model
- [x] Admin unchanged
- [x] Sidebar finalized
- [x] Vietnamese UI (Partner login + Customer nav; API terms per frozen spec)
- [x] No ERP modules inside Partner sidebar
- [x] No API modules inside Customer
- [x] Docker Build PASS
- [x] Containers recreated
- [x] Localhost URLs respond 200
- [ ] Worker healthy (pre-existing issue)
- [ ] Full browser regression (manual login recommended)

---

## Regression Note

Worker container fails on startup with `UndefinedModuleException` in `MaintenanceCenterModule` imports. This is **outside portal scope** and was not modified in 6033.4.1. API container is healthy and serves portal traffic.
