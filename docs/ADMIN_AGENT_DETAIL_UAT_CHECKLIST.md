# Admin Agent Detail — UAT Checklist

Use this checklist whenever `AgentDetailView` or an agent tab changes.

## Prerequisites

- Two agents with distinguishable company names, balances and orders.
- A `SUPER_ADMIN` account and at least one restricted-role account.
- Chrome DevTools Network throttling set to **Slow 3G** for race tests.
- Production-like API and seeded pricing data.

## Agent isolation

- [ ] Open agent A on Bảng giá, then navigate directly to agent B.
- [ ] Header, agent code and pricing never show agent A on agent B's route.
- [ ] Repeat on Số dư, Đơn hàng, Sao kê and Hóa đơn.
- [ ] Unsaved note/edit/wallet forms do not carry to agent B.
- [ ] One-time API credentials are cleared when leaving the agent.

## Fast tab switching

Click each pair in under one second while Slow 3G is enabled:

- [ ] API → Bảng giá → API
- [ ] Đơn hàng → Bảng giá
- [ ] Webhook → Thành viên
- [ ] Hoạt động → Lịch sử đăng nhập
- [ ] Số dư → Sao kê → Hóa đơn

For every pair:

- [ ] The highlighted tab matches the `?tab=` URL.
- [ ] Loading and error messages belong only to the active tab.
- [ ] Content from the previous tab is never rendered in the active tab.
- [ ] A late response never replaces newer content.
- [ ] No `undefined`, `NaN đ`, `Invalid Date` or raw `null` is visible.

## Search race

- [ ] Type quickly in Số dư → Sổ cái search; only the final query result remains.
- [ ] Type quickly in Sao kê order search; only the final query result remains.
- [ ] Pressing Enter does not create duplicate visible refreshes.
- [ ] Clearing the query restores the unfiltered list.

## Detail race

- [ ] Open statement A then statement B before A completes; only B is displayed.
- [ ] Open invoice A then invoice B before A completes; only B is displayed.
- [ ] Closing a detail before its response completes does not reopen stale detail.

## RBAC

- [ ] Restricted roles only see permitted tabs.
- [ ] Hidden tabs cannot be opened by changing `?tab=` manually.
- [ ] Wallet, pricing, statement and invoice write actions follow backend permissions.

## Automated regression

```powershell
npm run test --workspace=@cardon/admin
npm run test:e2e --workspace=@cardon/admin
```

Playwright environment:

- `ADMIN_E2E_BASE_URL`
- `ADMIN_E2E_EMAIL`
- `ADMIN_E2E_PASSWORD`
- `ADMIN_E2E_AGENT_ID`
- `ADMIN_E2E_SECOND_AGENT_ID`

