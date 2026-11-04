import { HomeServiceType, ProductVariantType } from '@prisma/client';
import {
  ESIM_AIRALO_CATALOGUE_CACHE_KEY,
  ESIM_AIRALO_CATALOGUE_TTL_MS,
  ESIM_AIRALO_PROVIDER_CODE,
  EsimCatalogSyncService,
  EsimCatalogueMappingRow,
  EsimCatalogueMappingStore,
  PrismaEsimCatalogueMappingStore,
} from './esim-catalog-sync.service';
import { EsimProviderPort } from './esim-provider.port';

function row(overrides: Partial<EsimCatalogueMappingRow>): EsimCatalogueMappingRow {
  return {
    id: 'map-esim',
    providerId: 'provider-esim',
    providerCode: ESIM_AIRALO_PROVIDER_CODE,
    variantId: 'variant-esim',
    variantType: ProductVariantType.ESIM,
    homeService: HomeServiceType.ESIM,
    providerProductCode: 'japan-7days-1gb',
    providerCost: '10000',
    ...overrides,
  };
}

function store(rows: EsimCatalogueMappingRow[]): EsimCatalogueMappingStore & { updateCost: jest.Mock } {
  return {
    listMappings: jest.fn(async () => rows.map((item) => ({ ...item }))),
    updateCost: jest.fn(async (current, nextCost) => {
      current.providerCost = nextCost;
    }),
  };
}

describe('EsimCatalogSyncService', () => {
  it('caches catalogue under the Airalo key and does not call the provider again inside the TTL', async () => {
    let clock = 1_000;
    const listBundles = jest.fn(async () => [{ name: 'japan-7days-1gb' }]);
    const provider = { listBundles } as unknown as EsimProviderPort;
    const service = new EsimCatalogSyncService(provider, store([]));
    service.clock = () => clock;

    await expect(service.loadCatalogue()).resolves.toEqual([{ name: 'japan-7days-1gb' }]);
    clock += ESIM_AIRALO_CATALOGUE_TTL_MS - 1;
    await service.loadCatalogue();
    expect(listBundles).toHaveBeenCalledTimes(1);
    expect(ESIM_AIRALO_CATALOGUE_CACHE_KEY).toBe('esim:catalogue:AIRALO');

    clock += 2;
    await service.loadCatalogue();
    expect(listBundles).toHaveBeenCalledTimes(2);
  });

  it('does not write consumption prices onto any mapping', async () => {
    const mappings = store([
      row({}),
      row({
        id: 'map-card',
        providerCode: 'ESALE',
        variantType: ProductVariantType.CARD,
        homeService: HomeServiceType.GAME_CARD,
        providerProductCode: 'CARD-10',
      }),
    ]);
    const service = new EsimCatalogSyncService({} as EsimProviderPort, mappings);
    const decision = service.rejectConsumptionPrices([
      { countryIso: 'VN', currency: 'USD', price: '1.50', profile: 'default' },
    ]);

    expect(decision.updated).toEqual([]);
    expect(decision.rejected).toEqual([{ bundleName: 'VN', reason: 'UNVERIFIED_PRICE_UNIT' }]);
    expect(mappings.updateCost).not.toHaveBeenCalled();
  });

  it('updates only an AIRALO bundle mapping when the VND bundle cost is verified', async () => {
    const card = row({
      id: 'map-card',
      providerId: 'provider-card',
      providerCode: 'ESALE',
      variantId: 'variant-card',
      variantType: ProductVariantType.CARD,
      homeService: HomeServiceType.GAME_CARD,
      providerProductCode: 'japan-7days-1gb',
      providerCost: '9000',
    });
    const esim = row({});
    const mappings = store([card, esim]);
    const service = new EsimCatalogSyncService({} as EsimProviderPort, mappings);

    const decision = await service.applyVerifiedBundleCosts([
      { bundleName: 'japan-7days-1gb', currency: 'VND', unit: 'bundle', amountVnd: 12000 },
    ]);

    expect(decision.updated.map((item) => item.id)).toEqual(['map-esim']);
    expect(mappings.updateCost).toHaveBeenCalledTimes(1);
    expect(card.providerCost).toBe('9000');
  });

  it('does not open a database write for a card mapping or legacy eSIM Go row', async () => {
    const update = jest.fn();
    const create = jest.fn();
    const prisma = {
      $transaction: jest.fn(async (fn: (tx: unknown) => Promise<void>) =>
        fn({
          providerProductMapping: { update },
          providerCostHistory: { create },
        }),
      ),
    };
    const catalogue = new PrismaEsimCatalogueMappingStore(prisma as never);

    for (const current of [
      row({ providerCode: 'ESALE', variantType: ProductVariantType.CARD, homeService: HomeServiceType.GAME_CARD }),
      row({ providerCode: 'ESIM_GO', variantType: ProductVariantType.ESIM, homeService: HomeServiceType.ESIM }),
    ]) {
      await expect(catalogue.updateCost(current, '12000')).rejects.toThrow('AIRALO ESIM catalogue');
    }

    expect(prisma.$transaction).not.toHaveBeenCalled();
    expect(update).not.toHaveBeenCalled();
    expect(create).not.toHaveBeenCalled();
  });
});
