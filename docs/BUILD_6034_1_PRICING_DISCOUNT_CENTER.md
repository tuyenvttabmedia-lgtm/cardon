# BUILD 6034.1 — PRICING & DISCOUNT CENTER

> **Deprecated:** Superseded by BUILD 6034.0.1 (Simplified Agent Margin). Tables and UI removed.

**Build label:** `6034.1 PRICING & DISCOUNT CENTER`

Pricing Management layer only — **no changes** to Order, Payment, Ledger, Provider, Wallet engines.

---

## Pricing hierarchy

```
Provider Cost (provider_product_mappings)
        ↓
Global Base Price (product_variants.sell_price)
        ↓
Pricing Group (default % or per-variant price)
        ↓
Discount Rules (priority, effective dates)
        ↓
Agent Override (agent_product_prices)
        ↓
Final Selling Price → Order Engine snapshots at purchase
```

## Priority (resolution)

1. **Agent Override** — `agent_product_prices` ACTIVE
2. **Pricing Group** — variant fixed price OR variant discount OR group default %
3. **Discount Rule** — best matching ACTIVE rule by priority
4. **Global Base** — `sell_price`

Loss prevention: selling price cannot fall below lowest active provider cost unless `allowBelowCost` (SUPER_ADMIN flows).

---

## Schema (new)

| Model | Purpose |
|-------|---------|
| `pricing_groups` | Mặc định, VIP, Enterprise, Reseller, Strategic |
| `pricing_group_variant_prices` | Per-group variant override |
| `pricing_discount_rules` | % / fixed, scope product/category/provider/global |
| `pricing_change_histories` | Who/when/old/new/reason |
| `agents.pricing_group_id` | Agent → group assignment |

Migration: `20250630170000_phase_6034_1_pricing_discount_center`

---

## API — `/api/v1/admin/pricing-center/*`

| Route | Description |
|-------|-------------|
| `GET dashboard` | Reports cards + margin charts |
| `GET/POST/PATCH groups` | CRUD pricing groups |
| `POST groups/:id/clone` | Clone group + variant prices |
| `GET products` | Product pricing + margins |
| `GET providers` | Read-only provider costs |
| `GET agents` | Agent pricing list |
| `GET agents/:id` | Full agent pricing detail |
| `POST agents/:id/assign-group` | Assign pricing group |
| `POST agents/bulk-assign-group` | Bulk assign |
| `POST agents/:id/overrides` | Upsert agent price override |
| `DELETE agents/:id/overrides/:variantId` | Reset override |
| `GET/POST/PATCH discount-rules` | Discount rules |
| `POST simulate` | Price simulator |
| `GET history` | Pricing change history |
| `GET export` / `POST import` | CSV/JSON export & import |

Permission: `pricing.manage` (SUPPORT: read-only UI)

---

## Admin UI

| Route | Tab |
|-------|-----|
| `/pricing/overview` | Dashboard + simulator |
| `/pricing/groups` | Nhóm giá |
| `/pricing/agents` | Bảng giá đại lý |
| `/pricing/providers` | Bảng giá NCC (read-only) |
| `/pricing/discounts` | Chiết khấu |
| `/pricing/history` | Lịch sử thay đổi |

Agent Detail tab **Bảng giá** (`/agents/[id]?tab=pricing`) — assign group, override, effective prices.

Sidebar: **Bảng giá** (main menu)

---

## Partner Portal

`GET /agents/me/platform/products` — read-only: pricing group, discount rules, resolved agent prices.

---

## Audit

- `SystemAuditLog` resource: `PRICING`
- `pricing_change_histories` for all writes (assign, override, import, clone, rules)

---

## Import format (JSON/CSV rows)

```json
{
  "rows": [
    { "sku": "VTT-100K", "groupCode": "VIP", "discountPercent": 5 },
    { "sku": "VTT-100K", "agentCode": "A1B2C3D4", "sellPrice": 97000 }
  ],
  "reason": "Bulk update Q2"
}
```

---

## Deployment

```powershell
cd C:\Users\MyHome\Projects\cardon
docker compose -f docker-compose.local-full.yml --env-file .env.local-full build admin api partner
docker compose -f docker-compose.local-full.yml --env-file .env.local-full up -d --force-recreate admin api partner nginx worker
```

Verify:
- http://admin.localhost/pricing
- Agent detail → Bảng giá tab
- http://partner.localhost → Products (read-only)
- Footer: **6034.1 PRICING & DISCOUNT CENTER**

---

## Docker status

| Service | Status |
|---------|--------|
| api | **healthy** — `/health` OK, pricing-center routes registered |
| admin | **running** — `/pricing/overview` HTTP 200 |
| partner | **rebuilt** — read-only pricing response |
| worker | **healthy** |
| nginx | **running** |

Docker build: **PASS** (admin + api + partner)

---

## Verification checklist

- [x] Docker build PASS
- [x] API healthy + pricing routes
- [x] Admin `/pricing/overview` reachable
- [ ] Full UI walkthrough after login (groups, simulator, agent tab, import/export)

---

## Known issues

- Excel export returns JSON/CSV foundation; full XLSX in future build.
- Agent code partial search in import uses 8-char prefix match.
