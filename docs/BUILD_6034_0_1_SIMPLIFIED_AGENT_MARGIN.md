# BUILD 6034.0.1 — SIMPLIFIED AGENT MARGIN

**Build label:** `6034.0.1 SIMPLIFIED AGENT MARGIN`

Reverts BUILD 6034.1 (Pricing & Discount Center) in favor of a simpler margin model per service type.

## Summary

| Item | Detail |
|------|--------|
| Rollback | Drops pricing groups, discount rules, pricing history tables |
| Margin | Per `HomeServiceType`: **% of face value** or **fixed VND** |
| Rounding | **100đ** (configurable via `roundTo`) |
| Formula | `CK_ĐL = CK_NCC − biên_LN`; `Giá ĐL = round(mệnh giá × (1 − CK_ĐL))` ≡ `vốn NCC + biên LN` |
| Admin UI | **Đại lý → Cấu hình lợi nhuận** + pricing tab on agent detail |
| Partner UI | **Giá mua (CardOn)** only — no NCC/esale cost |

## Default margins

| Service | Biên LN (% mệnh giá) |
|---------|----------------------|
| Thẻ game (`GAME_CARD`) | 0.5% |
| Thẻ ĐT (`PHONE_CARD`) | 0.5% |
| Nạp cước (`TOPUP`) | 0.3% |
| Nạp data (`DATA`) | 0.3% |

Example: mệnh giá 10,000đ, NCC 9,700đ (CK NCC 3%), biên LN CardOn 1% → CK ĐL 2% → giá ĐL **9,800đ**.

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
