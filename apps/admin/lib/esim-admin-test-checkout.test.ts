import { describe, expect, it } from 'vitest';
import {
  adminTestOrderPayload,
  canUseAdminTest,
  matchRecoveredAdminTestOrder,
  parseAdminTestUsd,
  readPaypalApprovalUrl,
} from '@/lib/esim-admin-test-checkout';
import type { EsimOpsListItem } from '@/types/api';

const variant = { name: 'Ireland 1GB', sku: 'IE_1GB' };

function item(overrides: Partial<EsimOpsListItem>): EsimOpsListItem {
  return {
    id: 'order-1',
    orderCode: 'CD-1',
    customerEmail: 'admin@example.test',
    customerName: 'Admin',
    packageTitle: variant.name,
    providerProductCode: 'airalo-ie',
    airaloOrderId: null,
    lastError: null,
    profilePresent: false,
    paymentStatus: 'WAITING_PAYMENT',
    fulfillmentStatus: 'PENDING',
    paymentMethod: 'PAYPAL',
    customerPaid: '103000',
    createdAt: '2026-11-05T10:00:00.000Z',
    lane: 'sandbox',
    ...overrides,
  };
}

describe('admin test checkout rules', () => {
  it('allows only SUPER_ADMIN with orders.manage', () => {
    const can = (permission: string) => permission === 'orders.manage';
    expect(canUseAdminTest('SUPER_ADMIN', can)).toBe(true);
    expect(canUseAdminTest('ADMIN', can)).toBe(false);
    expect(canUseAdminTest('SUPER_ADMIN', () => false)).toBe(false);
  });

  it('defaults and bounds the sandbox USD charge', () => {
    expect(parseAdminTestUsd('1.00')).toBe('1.00');
    expect(parseAdminTestUsd('1')).toBe('1.00');
    expect(parseAdminTestUsd('80')).toBe('80.00');
    expect(parseAdminTestUsd('0.01')).toBe('0.01');
    expect(parseAdminTestUsd('0')).toBeNull();
    expect(parseAdminTestUsd('-1')).toBeNull();
    expect(parseAdminTestUsd('80.01')).toBeNull();
    expect(parseAdminTestUsd('1.001')).toBeNull();
  });

  it('builds a PayPal payload without adminTest and keeps VietQR unchanged', () => {
    expect(adminTestOrderPayload({
      variantId: 'variant-1',
      method: 'VIETQR',
      testAmountUsd: '5.00',
    })).toEqual({
      variantId: 'variant-1',
      paymentMethodCode: 'VIETQR',
      market: 'VN',
    });
    const paypal = adminTestOrderPayload({
      variantId: 'variant-1',
      method: 'PAYPAL',
      testAmountUsd: '1.00',
    });
    expect(paypal).toEqual({
      variantId: 'variant-1',
      paymentMethodCode: 'PAYPAL',
      market: 'INTL',
      testAmountUsd: '1.00',
    });
    expect(paypal).not.toHaveProperty('adminTest');
    expect(JSON.stringify(paypal)).not.toMatch(/clientSecret|client_id|webhook/i);
  });

  it('reads the approval URL from the payment response and rejects other hosts', () => {
    const url = 'https://www.sandbox.paypal.com/checkoutnow?token=PP1';
    expect(readPaypalApprovalUrl({ paymentUrl: url }).ok && readPaypalApprovalUrl({ paymentUrl: url })).toEqual({
      ok: true,
      url,
    });
    expect(readPaypalApprovalUrl({}).reason).toBe('missing');
    expect(readPaypalApprovalUrl({ paymentUrl: 'https://www.paypal.com/checkoutnow?token=LIVE' }).reason).toBe('not-sandbox');
  });

  it('matches a waiting sandbox order and ignores commerce rows', () => {
    const waiting = item({});
    const commerce = item({ id: 'commerce', lane: 'commerce' });
    const paid = item({ id: 'paid', paymentStatus: 'PAID', createdAt: '2026-11-05T12:00:00.000Z' });
    expect(matchRecoveredAdminTestOrder([commerce, paid, waiting], variant, 'PAYPAL')?.id).toBe('order-1');
  });
});
