# Gate 1 — Partner MVP Freeze (`partner-mvp-v1`)

## Locked decisions

1. Webhook outbound required before prod  
2. Sandbox credentials after KYC APPROVED  
3. Invite-only **2 weeks** after freeze before open registration  

## In scope (frozen)

- Partner API: products / balance / cards/buy / transactions / providers  
- Soft sandbox (`ak_test_` + sandbox balances + mock fulfill)  
- Live gate (`live_api_enabled` + `ak_live_`)  
- Outbound webhook `order.completed` / `order.failed` (sign + retry)  
- Deposit hạn mức (SePay), docs web synced  

## Out of scope (v2 — do not merge into hotfix without release)

- PDF API docs, full SDK  
- Multi-user / roles team UI  
- Settlement / withdraw / credit line  
- Partner catalog / support portal  

## Freeze rules

- Tag release: `partner-mvp-v1` when Gate 1 UAT PASS  
- No drive-by changes to `agent-api`, sandbox/live credentials, HOLD/DEBIT paths except P0 hotfix  
- Feature work → `feat/partner-v2-*` → staged release  

## Admin ops

| Action | Endpoint |
|--------|----------|
| Approve KYC → sandbox keys | `POST /api/v1/admin/agents/:id/kyc/approve` |
| Enable live after UAT | `POST /api/v1/admin/agents/:id/enable-live-api` |
| Rotate live key | `POST /api/v1/admin/agents/:id/api-keys/rotate` |
