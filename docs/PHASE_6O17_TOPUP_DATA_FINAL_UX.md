# Phase 6O.17 — TOPUP/DATA UX + Provider Mapping Final

**Date:** 2026-06-24  
**Build marker:** `WEB_BUILD_VERSION=6O17`  
**Scope:** TOPUP/DATA labels, telco auto-detect, DATA metadata, provider validation, Esale telco normalize.

**Not modified:** CARD checkout flow, payment, wallet, ledger.

---

## TASK 1 — Customer labels

| Surface | Label |
|---------|--------|
| Homepage CARD | **Chọn loại thẻ** (unchanged) |
| `/nap-cuoc` | **Chọn nhà mạng** |
| `/nap-data` | **Chọn nhà mạng** + **Chọn gói Data** |

---

## TASK 2 — TOPUP phone auto-detect

- `detectTelcoFromPhone()` in `topup-flow.ts` (VN prefix rules)
- `/nap-cuoc`: typing phone auto-selects carrier when available
- Manual carrier click sets override; editing phone resets auto-detect

---

## TASK 3 — Separate DATA provider mapping

Admin mapping helper text per variant type:

| Type | Example codes |
|------|----------------|
| CARD | `VIETTEL:35` |
| TOPUP | `VIETTEL_TOPUP_10000`, `MOBI_TOPUP_50000` |
| DATA | `VIETTEL_DATA_ST15K`, `MOBI_DATA_HD70` |

`parseDataProductCode()` separate from TOPUP parsing.

---

## TASK 4 — DATA variant metadata

JSON fields: `packageName`, `capacity`, `duration`

Frontend card display:
```
ST15K
3GB / 3 ngày
15.000đ
```

---

## TASK 5 — TOPUP amount UI

Amount cards show **face value only** (e.g. `100.000đ`), sorted ASC.

---

## TASK 6 — Provider execution validation

`provider-fulfillment-validation.ts`:

- **CARD:** `providerProductCode`
- **TOPUP:** `phoneNumber`, `amount`, `telco`, `providerProductCode`
- **DATA:** `phoneNumber`, `packageCode`, `providerProductCode`

Validated in `ProviderService` (CARD) and `TopupService` (TOPUP/DATA) before provider call.

---

## TASK 7 — Esale

`EsaleTopupAdapter.normalizeTelco()` (internal):
- viettel → viettel
- mobifone → mobi
- vinaphone → vina
- vietnamobile → vietnamobile

Not exposed to customers.

---

## Deploy

```powershell
docker compose -f docker-compose.local-full.yml --env-file .env.local-full up -d --build api web admin
```

| Check | Result |
|-------|--------|
| Build marker `6O17` | ✅ |
| `/nap-cuoc` auto-detect | ✅ |
| `/nap-data` package cards | ✅ |
