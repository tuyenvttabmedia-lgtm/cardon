import { describe, expect, it } from 'vitest';
import {
  SEPAY_CHECKOUT_FIELD_ORDER,
  orderedSepayCheckoutEntries,
} from './sepay-checkout-form';

describe('orderedSepayCheckoutEntries', () => {
  it('rebuilds Postgres-scrambled jsonb keys into SePay signed order', () => {
    const scrambled = {
      currency: 'VND',
      merchant: 'SP-TEST',
      error_url: 'https://cardon.vn/e',
      operation: 'PURCHASE',
      signature: 'sig',
      cancel_url: 'https://cardon.vn/c',
      customer_id: 'u1',
      success_url: 'https://cardon.vn/s',
      order_amount: '103000',
      payment_method: 'BANK_TRANSFER',
      order_description: 'CardOn eSIM',
      order_invoice_number: 'ESIMABC',
    };

    const keys = orderedSepayCheckoutEntries(scrambled).map(([key]) => key);
    expect(keys).toEqual([...SEPAY_CHECKOUT_FIELD_ORDER, 'signature']);
  });

  it('keeps signature last and drops empty signed fields', () => {
    const keys = orderedSepayCheckoutEntries({
      order_amount: '1000',
      merchant: 'SP-TEST',
      currency: 'VND',
      operation: 'PURCHASE',
      order_description: 'x',
      order_invoice_number: 'INV-1',
      customer_id: '',
      payment_method: 'BANK_TRANSFER',
      success_url: 'https://cardon.vn/s',
      error_url: 'https://cardon.vn/e',
      cancel_url: 'https://cardon.vn/c',
      signature: 'sig',
      custom_data: 'meta',
    }).map(([key]) => key);

    expect(keys).not.toContain('customer_id');
    expect(keys.at(-1)).toBe('signature');
    expect(keys).toContain('custom_data');
  });
});
