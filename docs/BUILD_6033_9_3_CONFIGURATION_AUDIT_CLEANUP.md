# BUILD 6033.9.3 — CONFIGURATION & AUDIT CLEANUP

**Build label:** `6033.9.3 CONFIGURATION & AUDIT CLEANUP`

Finalize Admin Configuration architecture — **no settings business logic, API, or database changes**.

---

## Business principle

| Concept | Meaning | Location |
|---------|---------|----------|
| **Cấu hình** | Cài đặt hệ thống hiện tại | `/configuration/*` |
| **Audit** | Lịch sử thay đổi cấu hình (diff, user, time, reason) | `/configuration/audit` |
| **Activity** | Hành động vận hành | `/monitoring/activity` |

Never mix these three.

---

## Configuration tree

```
/configuration
├── Tổng quan
├── Hệ thống          /system
├── Sức khỏe          /health
├── Nâng cao          /advanced
├── Sao lưu           /backup
├── Bảo trì           /maintenance
├── Tích hợp          /integrations
├── Bảo mật           /security
├── Thanh toán        /payment
├── Nhà cung cấp      /providers
├── Đơn hàng          /orders
├── SMTP              /smtp
├── Telegram          /telegram
├── Webhook           /webhooks
└── Nhật ký cấu hình  /audit   ← single audit entry
```

Every settings page uses:

- `ConfigurationShell` (layout)
- `ConfigurationSubNav`
- `ConfigurationAuditBar` (except audit page itself)
- `ConfigurationSearchDialog` (Ctrl+K — unchanged)

---

## Audit tree

```
/configuration/audit
├── Filters (module, action, role, date)
├── Stats (today / month / total)
├── Table (user, field, old/new, reason)
└── Detail drawer (diff)
```

Deep-link from any module: `/configuration/audit?module=payment`

---

## Redirect table

| Legacy | Canonical |
|--------|-----------|
| `/settings` | `/configuration` |
| `/settings/*` | `/configuration/*` |
| `/audit` | `/configuration/audit` |
| `/configuration/feature-flags` | `/configuration/system` |

---

## Removed pages / components

| Item | Action |
|------|--------|
| `apps/admin/app/settings/**` | Removed (6033.9.1) |
| `apps/admin/app/audit/page.tsx` | Removed (6033.9.1) |
| `configuration/feature-flags` | Removed + redirect |
| `ConfigurationNav.tsx` | Replaced by `ConfigurationSubNav.tsx` |

---

## Files added

```
apps/admin/lib/configuration-routes.ts
apps/admin/components/configuration/ConfigurationShell.tsx
apps/admin/components/configuration/ConfigurationSubNav.tsx
```

---

## Deployment

```powershell
cd C:\Users\MyHome\Projects\cardon
docker compose -f docker-compose.local-full.yml --env-file .env.local-full build admin
docker compose -f docker-compose.local-full.yml --env-file .env.local-full up -d --force-recreate admin nginx
```

Verify:

- http://admin.localhost/configuration
- http://admin.localhost/configuration/audit
- Ctrl+K configuration search
- Footer: `6033.9.3 CONFIGURATION & AUDIT CLEANUP`

---

## Acceptance checklist

- [x] Single Configuration entry (sidebar → `/configuration`)
- [x] Single Audit entry (`/configuration/audit`)
- [x] No duplicate routes (redirects in place)
- [x] ConfigurationSearch preserved (Ctrl+K)
- [x] ConfigurationAuditBar preserved on settings pages
- [x] 100% Vietnamese (configuration labels)
- [ ] Docker PASS
- [ ] No regression (manual verify)
