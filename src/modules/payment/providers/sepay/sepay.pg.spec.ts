import {
  buildSepayPgCheckoutFields,
  getSepayPgCheckoutUrl,
  signSepayPgFields,
} from './sepay.pg';

describe('sepay.pg', () => {
  it('builds sandbox checkout URL', () => {
    expect(getSepayPgCheckoutUrl('sandbox')).toBe(
      'https://pay-sandbox.sepay.vn/v1/checkout/init',
    );
  });

  it('signs checkout fields with merchant secret', () => {
    const fields = {
      merchant: 'SP-TEST-CT4BB234',
      operation: 'PURCHASE',
      payment_method: 'BANK_TRANSFER',
      order_amount: 10000,
      currency: 'VND',
      order_invoice_number: 'PAY-TEST-001',
      order_description: 'Test order',
      success_url: 'https://cardon.vn/orders/x?payment=success',
      error_url: 'https://cardon.vn/orders/x?payment=error',
      cancel_url: 'https://cardon.vn/orders/x?payment=cancel',
    };
    const signature = signSepayPgFields(fields, 'spsk_test_secret');
    expect(signature).toMatch(/^[A-Za-z0-9+/=]+$/);
    expect(signature.length).toBeGreaterThan(10);
  });

  it('builds complete checkout form fields', () => {
    const result = buildSepayPgCheckoutFields({
      merchantId: 'SP-TEST-CT4BB234',
      merchantSecretKey: 'spsk_test_secret',
      environment: 'sandbox',
      paymentMethod: 'BANK_TRANSFER',
      orderInvoiceNumber: 'PAY-001',
      orderAmount: 50000,
      orderDescription: 'CardOn PAY-001',
      successUrl: 'https://cardon.vn/orders/1?payment=success',
      errorUrl: 'https://cardon.vn/orders/1?payment=error',
      cancelUrl: 'https://cardon.vn/orders/1?payment=cancel',
    });

    expect(result.merchant).toBe('SP-TEST-CT4BB234');
    expect(result.order_invoice_number).toBe('PAY-001');
    expect(result.order_amount).toBe('50000');
    expect(result.signature).toBeTruthy();
  });
});
