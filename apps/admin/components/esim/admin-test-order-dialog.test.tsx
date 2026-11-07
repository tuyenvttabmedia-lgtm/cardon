/** @vitest-environment jsdom */
import { createElement, type ReactNode } from 'react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { AdminTestOrderDialog } from '@/components/esim/AdminTestOrderDialog';
import type { OrderView, ProductVariant } from '@/types/api';

vi.mock('next/link', () => ({
  default: ({ href, children }: { href: string; children?: ReactNode }) =>
    createElement('a', { href }, children),
}));

vi.mock('@/components/ui/Toast', () => ({
  useToast: () => ({ success: vi.fn(), error: vi.fn() }),
}));

vi.mock('@/services/api-client', () => {
  class ApiClientError extends Error {
    status: number;
    constructor(message: string, status = 400) {
      super(message);
      this.name = 'ApiClientError';
      this.status = status;
    }
  }
  return {
    ApiClientError,
    adminApi: {
      createEsimTestOrder: vi.fn(),
      createPaypalCheckout: vi.fn(),
      listEsimOps: vi.fn(),
      getEsimOpsDetail: vi.fn(),
    },
  };
});

import { adminApi } from '@/services/api-client';

const createOrder = vi.mocked(adminApi.createEsimTestOrder);
const createPaypal = vi.mocked(adminApi.createPaypalCheckout);
const listOps = vi.mocked(adminApi.listEsimOps);
const getDetail = vi.mocked(adminApi.getEsimOpsDetail);

const variant: ProductVariant = {
  id: '11111111-1111-4111-8111-111111111111',
  productId: 'product-1',
  sku: 'IE_1GB',
  name: 'Ireland 1GB',
  type: 'ESIM',
  faceValue: '103000',
  sellPrice: '103000',
  status: 'ACTIVE',
};

function orderView(): OrderView {
  return {
    id: '22222222-2222-4222-8222-222222222222',
    orderCode: 'CD-TEST-1',
    channel: 'WEB',
    isGuestOrder: false,
    guestEmail: null,
    guestPhone: null,
    invoiceRequired: false,
    invoiceMetadata: {},
    customerNote: null,
    totalAmount: '103000.00',
    faceValue: '103000.00',
    sellAmount: '103000.00',
    discountAmount: '0.00',
    paymentMethodCode: 'PAYPAL',
    methodDisplayName: 'PayPal',
    paymentGateway: 'PAYPAL',
    settlementType: null,
    paymentFeePercent: '0.00',
    paymentFeeFixed: '0.00',
    paymentFeeAmount: '0.00',
    customerPaid: '103000.00',
    providerCost: '90000.00',
    profit: '13000.00',
    paymentStatus: 'WAITING_PAYMENT',
    fulfillmentStatus: 'PENDING',
    customerStatus: 'WAITING_PAYMENT',
    customerStatusLabel: 'Chờ thanh toán',
    paymentExpiresAt: null,
    createdAt: '2026-11-05T10:00:00.000Z',
    items: [],
  };
}

function renderDialog(allowed = true) {
  return render(
    <AdminTestOrderDialog
      variant={variant}
      allowed={allowed}
      onClose={() => undefined}
      onVietQrCreated={() => undefined}
      onPaypalReady={() => undefined}
    />,
  );
}

describe('AdminTestOrderDialog', () => {
  afterEach(() => {
    cleanup();
    vi.clearAllMocks();
  });

  it('shows the admin test form to an allowed SUPER_ADMIN and hides it otherwise', () => {
    renderDialog(true);
    expect(screen.getByRole('heading', { name: 'Tạo đơn eSIM kiểm thử' })).toBeTruthy();
    expect(screen.getByRole('option', { name: 'VietQR' })).toBeTruthy();
    expect(screen.getByRole('option', { name: 'PayPal Sandbox' })).toBeTruthy();
    expect(screen.queryByRole('option', { name: /PayPal Live/i })).toBeNull();
    cleanup();
    renderDialog(false);
    expect(screen.queryByRole('heading', { name: 'Tạo đơn eSIM kiểm thử' })).toBeNull();
  });

  it('keeps VietQR on the previous payload and does not start PayPal', async () => {
    createOrder.mockResolvedValueOnce({ ...orderView(), paymentMethodCode: 'VIETQR', paymentGateway: 'SEPAY' });
    renderDialog();
    fireEvent.click(screen.getByRole('button', { name: 'Tạo một đơn VN / VietQR' }));
    await waitFor(() => expect(createOrder).toHaveBeenCalledTimes(1));
    expect(createOrder.mock.calls[0][0]).toEqual({
      variantId: variant.id,
      paymentMethodCode: 'VIETQR',
      market: 'VN',
    });
    expect(createPaypal).not.toHaveBeenCalled();
  });

  it('sends the PayPal payload with the default 1.00 USD charge and the returned approval URL', async () => {
    const approvalUrl = 'https://www.sandbox.paypal.com/checkoutnow?token=FROM-API';
    createOrder.mockResolvedValueOnce(orderView());
    createPaypal.mockResolvedValueOnce({
      id: 'pay-1',
      orderId: orderView().id,
      gateway: 'PAYPAL',
      paymentReference: 'PP-1',
      amount: '1.00',
      status: 'PENDING',
      paymentUrl: approvalUrl,
      expiresAt: null,
      paidAt: null,
      createdAt: '2026-11-05T10:00:00.000Z',
    });
    renderDialog();
    fireEvent.change(screen.getByLabelText('Phương thức thanh toán kiểm thử'), { target: { value: 'PAYPAL' } });
    expect((screen.getByLabelText('Số tiền thanh toán thử nghiệm (USD)') as HTMLInputElement).value).toBe('1.00');
    fireEvent.click(screen.getByRole('button', { name: 'Tạo đơn PayPal Sandbox' }));
    await waitFor(() => expect(createPaypal).toHaveBeenCalledTimes(1));
    expect(createOrder.mock.calls[0][0]).toEqual({
      variantId: variant.id,
      paymentMethodCode: 'PAYPAL',
      market: 'INTL',
      testAmountUsd: '1.00',
    });
    expect(createOrder.mock.calls[0][0]).not.toHaveProperty('adminTest');
    const link = screen.getByRole('link', { name: 'Mở PayPal Sandbox Checkout' });
    expect(link.getAttribute('href')).toBe(approvalUrl);
    expect(screen.getAllByText(/Giá catalog:/).length).toBeGreaterThan(1);
    expect(screen.getByText(/Số tiền thanh toán thử nghiệm:/).textContent).toContain('1.00');
    expect(screen.getByText(/Số tiền thanh toán thử nghiệm:/).textContent).toContain('USD');
    expect(screen.getByText(/không phải doanh thu/i)).toBeTruthy();
    expect(document.body.textContent).not.toMatch(/clientSecret|client_id|webhook id/i);
  });

  it('blocks 0, negative, over 80 and more than two decimal places', () => {
    renderDialog();
    fireEvent.change(screen.getByLabelText('Phương thức thanh toán kiểm thử'), { target: { value: 'PAYPAL' } });
    const input = screen.getByLabelText('Số tiền thanh toán thử nghiệm (USD)');
    for (const bad of ['0', '-1', '80.01', '1.001']) {
      fireEvent.change(input, { target: { value: bad } });
      expect(screen.getByRole('button', { name: 'Tạo đơn PayPal Sandbox' }).hasAttribute('disabled')).toBe(true);
    }
    expect(createOrder).not.toHaveBeenCalled();
  });

  it('shows a clear error when the payment response has no approval URL', async () => {
    createOrder.mockResolvedValueOnce(orderView());
    createPaypal.mockResolvedValueOnce({
      id: 'pay-1',
      orderId: orderView().id,
      gateway: 'PAYPAL',
      paymentReference: 'PP-1',
      amount: '1.00',
      status: 'FAILED',
      expiresAt: null,
      paidAt: null,
      createdAt: '2026-11-05T10:00:00.000Z',
    });
    renderDialog();
    fireEvent.change(screen.getByLabelText('Phương thức thanh toán kiểm thử'), { target: { value: 'PAYPAL' } });
    fireEvent.click(screen.getByRole('button', { name: 'Tạo đơn PayPal Sandbox' }));
    await waitFor(() => expect(screen.getByText(/API không trả approval URL/)).toBeTruthy());
    expect(screen.queryByRole('link', { name: 'Mở PayPal Sandbox Checkout' })).toBeNull();
    expect(screen.getByText(/Trạng thái payment:/).textContent).toContain('Thất bại');
  });

  it('ignores a second click while the order request is in flight', async () => {
    let release: (order: OrderView) => void = () => undefined;
    createOrder.mockImplementationOnce(() => new Promise((resolve) => { release = resolve; }));
    createPaypal.mockResolvedValue({
      id: 'pay-1',
      orderId: orderView().id,
      gateway: 'PAYPAL',
      paymentReference: 'PP-1',
      amount: '1.00',
      status: 'PENDING',
      paymentUrl: 'https://www.sandbox.paypal.com/checkoutnow?token=PP1',
      expiresAt: null,
      paidAt: null,
      createdAt: '2026-11-05T10:00:00.000Z',
    });
    renderDialog();
    fireEvent.change(screen.getByLabelText('Phương thức thanh toán kiểm thử'), { target: { value: 'PAYPAL' } });
    const button = screen.getByRole('button', { name: 'Tạo đơn PayPal Sandbox' });
    fireEvent.click(button);
    fireEvent.click(button);
    expect(createOrder).toHaveBeenCalledTimes(1);
    release(orderView());
    await waitFor(() => expect(createPaypal).toHaveBeenCalledTimes(1));
    expect(createOrder).toHaveBeenCalledTimes(1);
  });

  it('does not create a second order when the first request times out', async () => {
    createOrder.mockRejectedValueOnce(new TypeError('Failed to fetch'));
    listOps.mockResolvedValue({
      summary: { total: 0, paidWaiting: 0, needReview: 0, completed: 0, unpaid: 0 },
      page: { skip: 0, take: 20, total: 0 },
      items: [],
    });
    renderDialog();
    fireEvent.change(screen.getByLabelText('Phương thức thanh toán kiểm thử'), { target: { value: 'PAYPAL' } });
    fireEvent.click(screen.getByRole('button', { name: 'Tạo đơn PayPal Sandbox' }));
    await waitFor(() => expect(listOps).toHaveBeenCalled());
    expect(createOrder).toHaveBeenCalledTimes(1);
    expect(createPaypal).not.toHaveBeenCalled();
    expect(screen.getByText(/không tạo đơn mới/i)).toBeTruthy();
  });

  it('resumes a recovered order instead of posting a second create', async () => {
    createOrder.mockRejectedValueOnce(new TypeError('timeout'));
    listOps
      .mockResolvedValueOnce({
        summary: { total: 0, paidWaiting: 0, needReview: 0, completed: 0, unpaid: 0 },
        page: { skip: 0, take: 20, total: 0 },
        items: [],
      })
      .mockResolvedValueOnce({
        summary: { total: 1, paidWaiting: 1, needReview: 0, completed: 0, unpaid: 0 },
        page: { skip: 0, take: 20, total: 1 },
        items: [{
          id: orderView().id,
          orderCode: 'CD-TEST-1',
          customerEmail: null,
          customerName: null,
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
        }],
      });
    getDetail.mockResolvedValue({
      id: orderView().id,
      orderCode: 'CD-TEST-1',
      paymentStatus: 'WAITING_PAYMENT',
      fulfillmentStatus: 'PENDING',
      createdAt: '2026-11-05T10:00:00.000Z',
      customer: { name: null, email: null, phone: null },
      pricing: {
        customerPaid: '103000',
        sellAmount: '103000',
        providerCost: '90000',
        paymentFeeAmount: '0',
        paymentMethod: 'PAYPAL',
        paymentGateway: 'PAYPAL',
      },
      payments: [],
      lastError: null,
      present: false,
      providerName: null,
      providerCode: null,
      providerMode: null,
      providerProductCode: null,
      packageTitle: variant.name,
      airaloOrderId: null,
      profilePresent: false,
      installSecretMasked: null,
      installSecret: null,
      attempts: [],
    });
    createPaypal.mockResolvedValue({
      id: 'pay-1',
      orderId: orderView().id,
      gateway: 'PAYPAL',
      paymentReference: 'PP-1',
      amount: '1.00',
      status: 'PENDING',
      paymentUrl: 'https://sandbox.paypal.com/checkoutnow?token=PP1',
      expiresAt: null,
      paidAt: null,
      createdAt: '2026-11-05T10:00:00.000Z',
    });
    renderDialog();
    fireEvent.change(screen.getByLabelText('Phương thức thanh toán kiểm thử'), { target: { value: 'PAYPAL' } });
    fireEvent.click(screen.getByRole('button', { name: 'Tạo đơn PayPal Sandbox' }));
    await waitFor(() => expect(screen.getByText(/không tạo đơn mới/i)).toBeTruthy());
    fireEvent.click(screen.getByRole('button', { name: 'Tạo đơn PayPal Sandbox' }));
    await waitFor(() => expect(createPaypal).toHaveBeenCalledTimes(1));
    expect(createOrder).toHaveBeenCalledTimes(1);
    const firstKey = createPaypal.mock.calls[0][1];
    fireEvent.click(screen.getByRole('button', { name: 'Thử lại thanh toán' }));
    await waitFor(() => expect(createPaypal).toHaveBeenCalledTimes(2));
    expect(createPaypal.mock.calls[1][1]).toBe(firstKey);
    expect(createOrder).toHaveBeenCalledTimes(1);
  });
});
