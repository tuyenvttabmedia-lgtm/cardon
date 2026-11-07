import { describe, expect, it } from 'vitest';
import type { AiraloCataloguePackageRow, ProductVariant } from '@/types/api';
import {
  SEPAY_SANDBOX_CHECKOUT_HOST,
  canCreateTestPayment,
  checkoutHost,
  isEsimTestOrderVariant,
  publishedEsimVariantIds,
  sandboxCheckoutForm,
  sepaySandboxCheckoutAction,
} from './esim-admin-ops';

function variant(overrides: Partial<ProductVariant> = {}): ProductVariant {
  return {
    id: 'var-1',
    productId: 'prod-1',
    sku: 'JP_1GB_7D',
    name: 'Japan 1GB',
    type: 'ESIM',
    faceValue: '0',
    sellPrice: '79000',
    status: 'ACTIVE',
    providerMappings: [
      {
        id: 'map-1',
        productVariantId: 'var-1',
        providerId: 'prov-1',
        providerProductCode: 'eurolink-500',
        providerCost: '1.00',
        priority: 0,
        status: 'ACTIVE',
        availability: 'AVAILABLE',
        provider: { id: 'prov-1', name: 'Airalo', code: 'AIRALO' },
      },
    ],
    ...overrides,
  };
}

function catalogueRow(
  overrides: Partial<AiraloCataloguePackageRow> = {},
): AiraloCataloguePackageRow {
  return {
    id: 'pkg-1',
    providerPackageId: 'eurolink-500',
    destinationKey: 'JP',
    countryIso: 'JP',
    title: 'Japan',
    operatorTitle: 'Airalo',
    packageType: 'sim',
    validityDays: 7,
    dataAmountMb: 1024,
    isUnlimited: false,
    fupClear: false,
    costCurrency: 'USD',
    costAmount: 1,
    costVnd: 26000,
    sellPriceVnd: 79000,
    lifecycle: 'PUBLISHED',
    reviewReason: null,
    variantId: 'var-1',
    productSlug: 'esim-nhat-ban',
    productName: 'eSIM Nhật Bản',
    ...overrides,
  };
}

describe('publishedEsimVariantIds / isEsimTestOrderVariant', () => {
  it('requires ACTIVE, PUBLISHED catalogue id, and Airalo mapping', () => {
    const published = publishedEsimVariantIds([
      catalogueRow(),
      catalogueRow({ id: 'pkg-2', variantId: 'var-2', lifecycle: 'IMPORTED' }),
      catalogueRow({ id: 'pkg-3', variantId: null }),
    ]);
    expect(published.has('var-1')).toBe(true);
    expect(published.has('var-2')).toBe(false);

    expect(isEsimTestOrderVariant(variant(), published)).toBe(true);
    expect(isEsimTestOrderVariant(variant({ status: 'INACTIVE' }), published)).toBe(false);
    expect(isEsimTestOrderVariant(variant({ id: 'var-2' }), published)).toBe(false);
    expect(
      isEsimTestOrderVariant(
        variant({
          providerMappings: [
            {
              id: 'map-2',
              productVariantId: 'var-1',
              providerId: 'prov-2',
              providerProductCode: 'other',
              providerCost: '1.00',
              priority: 0,
              status: 'ACTIVE',
              provider: { id: 'prov-2', name: 'Other', code: 'ESALE' },
            },
          ],
        }),
        published,
      ),
    ).toBe(false);
  });
});

describe('sandbox checkout host', () => {
  it('only accepts pay-sandbox.sepay.vn', () => {
    expect(checkoutHost('https://pay-sandbox.sepay.vn/v1/checkout/init')).toBe(
      SEPAY_SANDBOX_CHECKOUT_HOST,
    );
    expect(
      sepaySandboxCheckoutAction({
        checkoutUrl: 'https://pay-sandbox.sepay.vn/v1/checkout/init',
      }),
    ).toBe('https://pay-sandbox.sepay.vn/v1/checkout/init');
    expect(
      sepaySandboxCheckoutAction({ checkoutUrl: 'https://pay.sepay.vn/v1/checkout/init' }),
    ).toBeNull();
    expect(
      sandboxCheckoutForm({
        checkoutUrl: 'https://pay-sandbox.sepay.vn/v1/checkout/init',
        checkoutFormFields: { merchant: 'm', signature: 'sig', order_amount: '1000' },
      }),
    ).toEqual({
      action: 'https://pay-sandbox.sepay.vn/v1/checkout/init',
      fields: [
        ['order_amount', '1000'],
        ['merchant', 'm'],
        ['signature', 'sig'],
      ],
    });
    expect(
      sandboxCheckoutForm({
        checkoutUrl: 'https://pay-sandbox.sepay.vn/v1/checkout/init',
        checkoutFormFields: {},
      }),
    ).toBeNull();
    expect(
      sandboxCheckoutForm({
        checkoutUrl: 'https://pay.sepay.vn/v1/checkout/init',
        checkoutFormFields: { merchant: 'm' },
      }),
    ).toBeNull();
  });
});

describe('canCreateTestPayment', () => {
  const owned = {
    role: 'SUPER_ADMIN',
    userEmail: 'superadmin@cardon.vn',
    customerEmail: 'superadmin@cardon.vn',
    paymentStatus: 'WAITING_PAYMENT',
    payments: [] as Array<{ status: string }>,
  };

  it('allows only SUPER_ADMIN owner with WAITING_PAYMENT and no active payment', () => {
    expect(canCreateTestPayment(owned)).toBe(true);
    expect(canCreateTestPayment({ ...owned, role: 'ADMIN' })).toBe(false);
    expect(canCreateTestPayment({ ...owned, customerEmail: 'other@cardon.vn' })).toBe(false);
    expect(canCreateTestPayment({ ...owned, paymentStatus: 'PAID' })).toBe(false);
    expect(canCreateTestPayment({ ...owned, paymentStatus: 'EXPIRED' })).toBe(false);
    expect(canCreateTestPayment({ ...owned, payments: [{ status: 'PENDING' }] })).toBe(false);
    expect(canCreateTestPayment({ ...owned, payments: [{ status: 'SUCCESS' }] })).toBe(false);
    expect(canCreateTestPayment({ ...owned, payments: [{ status: 'FAILED' }] })).toBe(true);
  });
});
