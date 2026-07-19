# Phase 2F.1 — eSale Real Integration Report

**Status:** FULL PASS  
**Date:** 2026-06-19  
**Scope:** Replace mock eSale with real HTTP adapter (Buy Card + Topup foundation)

---

## Summary

Implemented `ESaleProvider` against eSale Integration V3 APIs. Production registry uses real adapter when credentials are configured; tests and dev without credentials continue using `MockESaleProvider`.

---

## Deliverables

| Item | Path |
|------|------|
| Config | `src/modules/provider/adapters/esale/esale.config.ts` |
| Signature / crypto | `src/modules/provider/adapters/esale/esale.signature.ts` |
| HTTP client | `src/modules/provider/adapters/esale/esale.client.ts` |
| Types + mappers | `src/modules/provider/adapters/esale/esale.types.ts`, `esale.mapper.ts` |
| Provider | `src/modules/provider/adapters/esale/esale.provider.ts` |
| Tests | `src/modules/provider/adapters/esale/esale.provider.spec.ts` |
| Docs | `docs/04_ESALE_BUYCARD_API.md`, `docs/04_ESALE_TOPUP_API.md`, `docs/04_PROVIDER_ESALE.md` |

---

## ENV variables

| Variable | Purpose |
|----------|---------|
| `ESALE_API_URL_CARD` | Card shop base URL |
| `ESALE_API_URL_TOPUP` | Mobile topup base URL |
| `ESALE_AGENCY_CODE` | eSale agency code |
| `ESALE_CLIENT_CODE` | eSale client code |
| `ESALE_SECRET_KEY` | SHA256 checkSum/sig |
| `ESALE_PRIVATE_KEY` | RSA PKCS8 — sign requests, decrypt PIN |
| `ESALE_PUBLIC_KEY` | eSale public key — verify responses |
| `ESALE_TIMEOUT_MS` | HTTP timeout (default 30000) |
| `ESALE_USE_MOCK` | Force mock adapter |

Aliases: `ESALE_PARTNER_ID`, `ESALE_PARTNER_KEY`, `ESALE_API_URL`.

---

## Registry selection

```
ESALE_USE_MOCK=true  → MockESaleProvider
APP_ENV=test         → MockESaleProvider
credentials missing  → MockESaleProvider
otherwise            → ESaleProvider
```

---

## Flow highlights

### buyCard

1. Parse `providerProductCode` as `SUPPLIER:CARD_ID`
2. POST `/buycard` with SHA256 + RSA signature
3. Verify response signature (when public key configured)
4. RSA-decrypt `cardCode` → AES-256-GCM in `ProviderService`
5. Map retCode: `-3004` OUT_OF_STOCK, `-3000` LOW_BALANCE, processing → PENDING

### Timeout / processing

- HTTP abort → `TIMEOUT`
- eSale processing retCode → `PENDING`
- `ProviderService` calls `checkTransaction` for both TIMEOUT and PENDING
- **Never** retries `buyCard` after timeout

### syncProducts

- Calls `/getcardlist` for Card, Game, Card3G
- Returns count only — admin-driven mapping updates

---

## Security

- SecretKey, private key, signatures, PIN plain text are **not logged**
- Response signature verification enabled when `ESALE_PUBLIC_KEY` is set
- Card PIN encrypted at rest via existing `CardEncryptionService`

---

## Test results

```
npm run build          → PASS
npm run test:provider  → 39 passed (4 suites)
```

eSale-specific tests (11):

- buyCard SUCCESS + PIN decrypt
- OUT_OF_STOCK / LOW_BALANCE mapping
- HTTP timeout → TIMEOUT
- checkTransaction recovery
- getBalance
- INVALID_SKU
- syncProducts catalog count
- Signature + product code parsing

Existing Provider Core tests unchanged (MockESaleProvider via registry test helper).

---

## Not in scope (unchanged)

- Agent API
- Admin UI
- Frontend
- iMedia real integration
- Automatic DB product mapping from syncProducts

---

## Sandbox checklist

1. Set ENV from eSale sandbox credentials
2. Register client public key + IP with Thanh Sơn
3. Map product variant → `VIETTEL:35` (example)
4. Test buyCard on sandbox URL
5. Verify balance via `ProviderHealthService`

---

## Related

- [04_PROVIDER_ESALE.md](./04_PROVIDER_ESALE.md)
- [PHASE_2F_PROVIDER_CORE_REPORT.md](./PHASE_2F_PROVIDER_CORE_REPORT.md)
