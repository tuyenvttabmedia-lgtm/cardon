# Gate 1 — Partner Sandbox UAT Checklist

Use after KYC APPROVED. Sandbox key prefix: `ak_test_`.

## Prerequisites

- [ ] Agent status ACTIVE, KYC APPROVED
- [ ] Sandbox API key + secret stored (shown once on KYC approve or partner rotate)
- [ ] Webhook URL reachable (HTTPS) + webhook secret configured
- [ ] IP whitelist empty or includes tester IP
- [ ] Docs tab matches real signing path `api/partner/v1/...`

## Sandbox API

- [ ] `GET /balance` → available ≈ seeded 10.000.000 (minus prior tests)
- [ ] `GET /products` → list with `product_code`, `agent_price`
- [ ] `POST /cards/buy` → `status: SUCCESS`, fake `card_serial` / `card_pin`
- [ ] Live balance unchanged after sandbox buy
- [ ] Duplicate buy same `request_id` → HTTP 200 identical body
- [ ] `GET /transactions/:request_id` → same cards
- [ ] Wrong signature → `INVALID_SIGNATURE`
- [ ] Insufficient sandbox balance → `INSUFFICIENT_BALANCE`

## Webhook

- [ ] Receive `order.completed` with `environment: "SANDBOX"`
- [ ] Verify `X-CardOn-Signature` with webhook secret
- [ ] Delivery log shows success (or retry then success)

## Pass criteria

All boxes checked → eligible for **Enable Live API** (admin `POST .../enable-live-api`).

## Live smoke (after enable — invite window)

- [ ] Live key `ak_live_` works on balance
- [ ] One small `cards/buy` with real provider
- [ ] Webhook `environment: "PRODUCTION"`
- [ ] Ledger HOLD → DEBIT on live balance
