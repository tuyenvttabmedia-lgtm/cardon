# Provider Integration — iMedia

## Overview

iMedia is a secondary card/topup provider. All iMedia API calls go through `IMediaProvider` implementing `ProviderInterface`.

```
OrderFulfillmentWorker
    ↓
ProviderInterface
    ↓
IMediaProvider
    ↓
iMedia HTTP API
```

Never call iMedia API directly from OrderService, AgentService, or webhook handlers.

## ProviderInterface Implementation

```typescript
class IMediaProvider implements ProviderInterface {
  buyCard(params: BuyCardDto): Promise<ProviderResult>;
  topup(params: TopupDto): Promise<ProviderResult>;
  checkTransaction(requestId: string): Promise<ProviderResult>;
  getBalance(): Promise<BalanceResult>;
  syncProduct(): Promise<ProductSyncResult>;
}
```

Same interface as `ESaleProvider`. Selection via `ProviderFactory` based on `products.provider_id`.

## Provider Selection

```
ProductEngine.resolveProvider(productId)
    ↓
providers.code = 'esale' | 'imedia'
    ↓
ProviderFactory.getProvider(code)
    ↓
ESaleProvider | IMediaProvider
```

## buyCard / topup Flow

Same pattern as eSale. Each attempt → new `provider_transactions` row.

Multi-quantity cards → N `card_records` per order_item.  
Topup → `topup_transactions` with phone_number, telco, provider_reference.

## Timeout Recovery

Never retry buyCard/topup after timeout. Use `checkTransaction(request_id)`.

## Multi-Provider Failover

No auto-failover in v1. Admin may manually reassign product provider and retry.

## iMedia-Specific Metadata

Stored in `products.metadata`:

```typescript
{
  "imediaProductCode": "...",
  "telcoCode": "...",
  "packageId": "..."
}
```

## Related Docs

- [04_PROVIDER_ESALE.md](./04_PROVIDER_ESALE.md)
- [06_ORDER_FULFILLMENT.md](./06_ORDER_FULFILLMENT.md)
