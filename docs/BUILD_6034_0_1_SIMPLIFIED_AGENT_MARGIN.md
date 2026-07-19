# BUILD 6034.0.1 — SIMPLIFIED AGENT MARGIN

**Build label:** `6034.0.1 SIMPLIFIED AGENT MARGIN`

Reverts BUILD 6034.1 (Pricing & Discount Center) in favor of a simpler margin model per service type.

## Summary

| Item | Detail |
|------|--------|
| Rollback | Drops pricing groups, discount rules, pricing history tables |
| Margin | Per `HomeServiceType`: **% + fixed amount** |
| Rounding | **100đ** (configurable via `roundTo`) |
| Formula | `Giá đại lý = round(Giá vốn NCC × (1 + %/100) + fixed)` |
| Admin UI | **Đại lý → Cấu hình lợi nhuận** + pricing tab on agent detail |
| Partner UI | **Giá mua (CardOn)** only — no NCC/esale cost |

## Default margins

| Service | % | Fixed |
|---------|---|-------|
| Thẻ game (`GAME_CARD`) | 0.5% | 500đ |
| Thẻ ĐT (`PHONE_CARD`) | 0.5% | 500đ |
| Nạp cước (`TOPUP`) | 0.3% | 300đ |
| Nạp data (`DATA`) | 0.3% | 300đ |

Example: NCC cost 96,500đ → 96,500 × 1.005 + 500 = 97,482.5 → **97,500đ** (rounded to 100đ).

## Resolution order

1. `agent_product_prices` override (manual)
2. Margin config by product `homeService`
3. Fallback to variant `sellPrice` if no NCC cost

## API

- `GET/PATCH /admin/agent-center/margin-config` — global margin settings (`settings.agent.margin`)
- Agent detail tab `pricing` — admin sees NCC cost + CardOn margin + agent price
- Partner `GET /agent-platform/products` — agent price only

## Migration

`20250630180000_revert_6034_1_simplified_agent_margin`

## Deprecated

See `docs/BUILD_6034_1_PRICING_DISCOUNT_CENTER.md` — superseded by this build.

## Verification

- Admin: `http://admin.localhost/agents/margin-config`
- Admin agent detail → Bảng giá tab
- Partner: `http://partner.localhost/products` — Giá mua only
- Footer: **6034.0.1 SIMPLIFIED AGENT MARGIN**
