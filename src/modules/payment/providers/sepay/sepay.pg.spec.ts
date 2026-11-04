import {
  buildSepayPgCheckoutFields,
  getSepayPgCheckoutUrl,
  mapSepayPgOrderStatus,
  querySepayPgOrder,
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

  it('maps SePay PG order statuses', () => {
    expect(mapSepayPgOrderStatus('CAPTURED')).toBe('SUCCESS');
    expect(mapSepayPgOrderStatus('CANCELLED')).toBe('FAILED');
    expect(mapSepayPgOrderStatus('AUTHENTICATION_NOT_NEEDED')).toBe('PENDING');
  });

  it('queries SePay PG by invoice number', async () => {
    const fetchImpl = jest.fn().mockResolvedValue({
      ok: true,
      json: async () => ({
        data: [
          {
            order_id: 'SEPAY-1',
            order_invoice_number: 'DH45479305',
            order_status: 'CAPTURED',
            order_amount: '181000.00',
          },
        ],
      }),
    });
    const result = await querySepayPgOrder({
      environment: 'sandbox',
      merchantId: 'SP-TEST',
      merchantSecretKey: 'secret',
      invoiceNumber: 'DH45479305',
      fetchImpl: fetchImpl as unknown as typeof fetch,
    });
    expect(result.status).toBe('SUCCESS');
    expect(result.amount).toBe('181000.00');
    expect(String(fetchImpl.mock.calls[0][0])).toContain('q=DH45479305');
  });
});
