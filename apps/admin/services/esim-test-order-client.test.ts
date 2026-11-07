import { readFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { adminApi, ApiClientError } from '@/services/api-client';
import type { OrderView } from '@/types/api';

const adminRoot = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const apiClientSource = readFileSync(resolve(adminRoot, 'services/api-client.ts'), 'utf8');

const variantId = '11111111-1111-4111-8111-111111111111';

function orderView(): OrderView {
  return {
    id: '22222222-2222-4222-8222-222222222222',
    orderCode: 'CD-TEST-1',
    channel: 'WEB',
    isGuestOrder: false,
    guestEmail: 'admin@example.test',
    guestPhone: null,
    invoiceRequired: false,
    invoiceMetadata: {},
    customerNote: null,
    totalAmount: '79000.00',
    faceValue: '0.00',
    sellAmount: '78300.00',
    discountAmount: '0.00',
    paymentMethodCode: 'VIETQR',
    methodDisplayName: 'VietQR',
    paymentGateway: 'SEPAY',
    settlementType: 'DIRECT_TO_MERCHANT',
    paymentFeePercent: '0.00',
    paymentFeeFixed: '700.00',
    paymentFeeAmount: '700.00',
    customerPaid: '79000.00',
    providerCost: '10000.00',
    profit: '68300.00',
    paymentStatus: 'WAITING_PAYMENT',
    fulfillmentStatus: 'PENDING',
    customerStatus: 'WAITING_PAYMENT',
    customerStatusLabel: 'Chờ thanh toán',
    paymentExpiresAt: '2026-10-26T13:00:00.000Z',
    createdAt: '2026-10-26T12:00:00.000Z',
    items: [
      {
        id: '33333333-3333-4333-8333-333333333333',
        variantId,
        quantity: 1,
        unitPrice: '78300.00',
        discount: '0.00',
        totalAmount: '78300.00',
        status: 'PENDING',
        variant: { sku: 'JP_1GB_7D', name: 'Japan 1GB 7D' },
      },
    ],
  };
}

function jsonResponse(status: number, body: unknown): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'Content-Type': 'application/json' },
  });
}

describe('createEsimTestOrder contract in source', () => {
  const start = apiClientSource.indexOf('createEsimTestOrder(body');
  const wrapper = apiClientSource.slice(start, apiClientSource.indexOf('},', start) + 2);

  it('posts only to the admin esim-ops endpoint', () => {
    expect(wrapper).toContain("apiRequest<OrderView>('/admin/esim-ops/orders'");
    expect(wrapper).toContain("method: 'POST'");
    expect(wrapper).not.toContain("'/orders'");
    expect(wrapper).not.toContain('/payments');
  });

  it('does not add a create-order retry or public fallback', () => {
    expect(wrapper).not.toContain('retry');
    expect(wrapper).not.toContain('for (');
    expect(wrapper).not.toContain('while (');
    expect(apiClientSource).not.toMatch(/createEsimTestOrder[\s\S]{0,400}POST \/orders/);
  });

  it('does not persist LPA, secrets, or payment URLs', () => {
    expect(wrapper).not.toContain('localStorage');
    expect(wrapper).not.toContain('sessionStorage');
    expect(wrapper).not.toContain('installSecret');
    expect(wrapper).not.toContain('paymentUrl');
  });
});

describe('adminApi.createEsimTestOrder', () => {
  const fetchMock = vi.fn();

  beforeEach(() => {
    fetchMock.mockReset();
    vi.stubGlobal('fetch', fetchMock);
    process.env.NEXT_PUBLIC_API_URL = 'http://localhost:3000/api/v1';
  });

  afterEach(() => {
    vi.unstubAllGlobals();
    delete process.env.NEXT_PUBLIC_API_URL;
  });

  it('sends variantId, VIETQR and VN to POST /admin/esim-ops/orders', async () => {
    const created = orderView();
    fetchMock.mockResolvedValueOnce(
      jsonResponse(201, { success: true, data: created, timestamp: '2026-10-26T12:00:00.000Z' }),
    );

    const result = await adminApi.createEsimTestOrder({
      variantId,
      paymentMethodCode: 'VIETQR',
      market: 'VN',
    });

    expect(result).toEqual(created);
    expect(fetchMock).toHaveBeenCalledTimes(1);
    const [url, init] = fetchMock.mock.calls[0] as [string, RequestInit];
    expect(url).toBe('http://localhost:3000/api/v1/admin/esim-ops/orders');
    expect(init.method).toBe('POST');
    expect(JSON.parse(String(init.body))).toEqual({
      variantId,
      paymentMethodCode: 'VIETQR',
      market: 'VN',
    });
  });

  it('surfaces 400/403 with the API message and does not retry', async () => {
    fetchMock.mockResolvedValueOnce(
      jsonResponse(400, {
        success: false,
        error: { code: 'BAD_REQUEST', message: 'Payment method is not available' },
      }),
    );

    const bad = adminApi.createEsimTestOrder({ variantId, paymentMethodCode: 'SEPAY' });
    await expect(bad).rejects.toMatchObject({
      name: 'ApiClientError',
      status: 400,
      code: 'BAD_REQUEST',
      message: 'Payment method is not available',
    });
    expect(fetchMock).toHaveBeenCalledTimes(1);

    fetchMock.mockResolvedValueOnce(
      jsonResponse(403, {
        success: false,
        error: { code: 'FORBIDDEN', message: 'Insufficient role' },
      }),
    );
    const forbidden = adminApi.createEsimTestOrder({ variantId, paymentMethodCode: 'VIETQR', market: 'VN' });
    await expect(forbidden).rejects.toBeInstanceOf(ApiClientError);
    await expect(forbidden).rejects.toMatchObject({ status: 403, message: 'Insufficient role' });
    expect(fetchMock).toHaveBeenCalledTimes(2);
  });

  it('does not retry on 401 when there is no refresh token, or on network failure', async () => {
    fetchMock.mockResolvedValueOnce(
      jsonResponse(401, {
        success: false,
        error: { code: 'UNAUTHORIZED', message: 'Unauthorized' },
      }),
    );
    await expect(adminApi.createEsimTestOrder({ variantId })).rejects.toMatchObject({
      status: 401,
      message: 'Unauthorized',
    });
    expect(fetchMock).toHaveBeenCalledTimes(1);

    fetchMock.mockRejectedValueOnce(new Error('network down'));
    await expect(adminApi.createEsimTestOrder({ variantId })).rejects.toThrow('network down');
    expect(fetchMock).toHaveBeenCalledTimes(2);
  });
});

describe('createSepayCheckout contract in source', () => {
  const start = apiClientSource.indexOf('createSepayCheckout(orderId');
  const wrapper = apiClientSource.slice(start, apiClientSource.indexOf('getOrderDetail(', start));

  it('posts only to existing /payments with SEPAY and Idempotency-Key', () => {
    expect(wrapper).toContain("apiRequest<PaymentCheckoutView>('/payments'");
    expect(wrapper).toContain("method: 'POST'");
    expect(wrapper).toContain("gateway: 'SEPAY'");
    expect(wrapper).toContain("'Idempotency-Key': idempotencyKey");
    expect(wrapper).not.toContain('/admin/esim-ops');
    expect(wrapper).not.toContain('localStorage');
    expect(wrapper).not.toContain('sessionStorage');
    expect(wrapper).not.toContain('retry');
    expect(wrapper).not.toContain('for (');
    expect(wrapper).not.toContain('while (');
  });
});

describe('adminApi.createSepayCheckout', () => {
  const fetchMock = vi.fn();
  const orderId = '44444444-4444-4444-8444-444444444444';
  const idempotencyKey = '55555555-5555-4555-8555-555555555555';

  beforeEach(() => {
    fetchMock.mockReset();
    vi.stubGlobal('fetch', fetchMock);
    process.env.NEXT_PUBLIC_API_URL = 'http://localhost:3000/api/v1';
  });

  afterEach(() => {
    vi.unstubAllGlobals();
    delete process.env.NEXT_PUBLIC_API_URL;
  });

  it('sends orderId, SEPAY and Idempotency-Key once', async () => {
    const payment = {
      id: '66666666-6666-4666-8666-666666666666',
      orderId,
      gateway: 'SEPAY',
      paymentReference: 'DH123',
      amount: '78000.00',
      status: 'PENDING',
      checkoutUrl: 'https://pay-sandbox.sepay.vn/v1/checkout/init',
      checkoutFormFields: { merchant: 'm' },
      expiresAt: null,
      paidAt: null,
      createdAt: '2026-10-26T12:00:00.000Z',
    };
    fetchMock.mockResolvedValueOnce(
      jsonResponse(201, { success: true, data: payment, timestamp: '2026-10-26T12:00:00.000Z' }),
    );

    const result = await adminApi.createSepayCheckout(orderId, idempotencyKey);
    expect(result).toEqual(payment);
    expect(fetchMock).toHaveBeenCalledTimes(1);
    const [url, init] = fetchMock.mock.calls[0] as [string, RequestInit];
    expect(url).toBe('http://localhost:3000/api/v1/payments');
    expect(init.method).toBe('POST');
    expect((init.headers as Record<string, string>)['Idempotency-Key']).toBe(idempotencyKey);
    expect(JSON.parse(String(init.body))).toEqual({ orderId, gateway: 'SEPAY' });
  });

  it('does not retry on timeout or unknown network failure', async () => {
    fetchMock.mockRejectedValueOnce(new Error('timeout'));
    await expect(adminApi.createSepayCheckout(orderId, idempotencyKey)).rejects.toThrow('timeout');
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });
});

describe('adminApi.createPaypalCheckout', () => {
  const fetchMock = vi.fn();
  const orderId = '44444444-4444-4444-8444-444444444444';
  const idempotencyKey = '55555555-5555-4555-8555-555555555555';

  beforeEach(() => {
    fetchMock.mockReset();
    vi.stubGlobal('fetch', fetchMock);
    process.env.NEXT_PUBLIC_API_URL = 'http://localhost:3000/api/v1';
  });

  afterEach(() => {
    vi.unstubAllGlobals();
    delete process.env.NEXT_PUBLIC_API_URL;
  });

  it('posts the existing payments route with PAYPAL and the same Idempotency-Key', async () => {
    const approvalUrl = 'https://www.sandbox.paypal.com/checkoutnow?token=FROM-API';
    fetchMock.mockResolvedValueOnce(
      jsonResponse(201, {
        success: true,
        data: {
          id: 'pay-1',
          orderId,
          gateway: 'PAYPAL',
          paymentReference: 'PP-1',
          amount: '1.00',
          status: 'PENDING',
          paymentUrl: approvalUrl,
          expiresAt: null,
          paidAt: null,
          createdAt: '2026-11-05T10:00:00.000Z',
        },
        timestamp: '2026-11-05T10:00:00.000Z',
      }),
    );
    const result = await adminApi.createPaypalCheckout(orderId, idempotencyKey);
    expect(result.paymentUrl).toBe(approvalUrl);
    expect(fetchMock).toHaveBeenCalledTimes(1);
    const [url, init] = fetchMock.mock.calls[0] as [string, RequestInit];
    expect(url).toBe('http://localhost:3000/api/v1/payments');
    expect(JSON.parse(String(init.body))).toEqual({ orderId, gateway: 'PAYPAL' });
    expect((init.headers as Record<string, string>)['Idempotency-Key']).toBe(idempotencyKey);
    expect(JSON.stringify(init.body)).not.toContain('adminTest');
    expect(JSON.stringify(init.body)).not.toMatch(/clientSecret|client_id|webhook/i);
  });
});
