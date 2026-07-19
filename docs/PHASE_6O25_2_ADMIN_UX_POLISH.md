# Phase 6O25.2 — Admin Finance & Operation UX Polish

**Build marker:** `6O25.2`  
**Scope:** Admin UI only — no database, finance calculation, reconciliation logic, order snapshot, or ledger changes.

## Summary

Refactored the admin finance area from flat tabs into grouped navigation, added a global finance summary header with date shortcuts, polished provider and order detail UX, cleaned up the sidebar, and tightened role-based navigation.

## Task 1 — Finance navigation

| Route | Content |
|-------|---------|
| `/finance` | Hub with cards: Tổng quan, Cổng thanh toán, Nhà cung cấp, Đại lý |
| `/finance/dashboard` | Profit overview (reuses `financeApi.getProfit`) + system invoices list |
| `/finance/payments` | Tabs: Đối soát giao dịch, Phí giao dịch, Hóa đơn cổng |
| `/finance/providers` | Tabs: Đối soát NCC, Giao dịch NCC, Biến động giá vốn (placeholder) |
| `/finance/agents` | Phase 7 placeholder |

Shared layout: `FinanceShell` + `FinanceDateContext` for global date filter.

## Task 2 — Label renames

- Settlement → **Đối soát nhận tiền**
- Phí cổng thanh toán → **Phí giao dịch**
- Gateway (display) → **Cổng thanh toán**
- NCC labels kept admin-only where applicable

## Task 3 — Finance summary header

On all finance sub-pages (not hub): cards for Doanh thu, Giá vốn, Phí thanh toán, Lợi nhuận with shortcuts Hôm nay / 7 ngày / Tháng này.

## Task 4 — Provider page polish

Provider cards show health badge (ONLINE/SLOW/ERROR/MAINTENANCE), metrics grid, and actions: Kiểm tra kết nối, Đồng bộ số dư, Đồng bộ sản phẩm, Bảo trì.

## Task 5 — Order detail polish

Tabs: Tổng quan · Thanh toán · Giao hàng · Nhà cung cấp · Nhật ký xử lý  
Journal shows customer-friendly message + internal `eventType`. Support actions: Gửi lại email, Thử lại NCC, Đổi NCC, Hoàn tiền.

## Task 6 — Sidebar cleanup

Final menu: Tổng quan, Đơn hàng, Sản phẩm, Nhà cung cấp, Khách hàng, Marketing, Tài chính, Cài đặt.  
Removed top-level agents, audit, staff, duplicate finance links. Payments nav visible for SUPPORT only.

## Task 7 — Permissions

| Role | Navigation |
|------|------------|
| SUPER_ADMIN | All permitted items |
| ADMIN | Full menu (per permissions) |
| ACCOUNTANT | Tài chính only → lands on `/finance` |
| SUPPORT | Orders (+ dashboard, customers, payments review) |
| MARKETING | Marketing only |

## Task 8 — Build & verify

```bash
docker compose -f docker-compose.local-full.yml --env-file .env.local-full build api admin web
docker compose -f docker-compose.local-full.yml --env-file .env.local-full up -d api admin web
```

Verify: http://admin.localhost — finance hub, sub-routes, provider cards, order detail tabs.

## Files changed

- `apps/admin/app/finance/**` — new route structure
- `apps/admin/components/finance/**` — shell, date context, panels
- `apps/admin/lib/permissions.ts` — sidebar + role routing
- `apps/admin/app/providers/page.tsx` — provider card polish
- `apps/admin/app/orders/[id]/page.tsx` — tab reorder + journal
- `apps/admin/lib/i18n/vi.ts` — finance labels
- `apps/web/lib/build-version.ts` — `6O25.2`
- `apps/admin/lib/build-version.ts` — `6O25.2`
- `docker-compose.local-full.yml` — build env

## Known limitations

- **Biến động giá vốn:** UI placeholder — no admin API for `provider_cost_histories` yet.
- **Đại lý:** Phase 7 placeholder; sao kê đại lý not migrated from old flat finance page.

**CardOn build 6O25.2**
