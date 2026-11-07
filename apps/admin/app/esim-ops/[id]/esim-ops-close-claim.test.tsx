/** @vitest-environment jsdom */
import { createElement, type ReactNode } from 'react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { cleanup, render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { adminApi } from '@/services/api-client';
import type { EsimOpsDetail } from '@/types/api';

const route = vi.hoisted(() => ({ id: 'order-lock' }));
const auth = vi.hoisted(() => ({
  can: (permission: string) => permission === 'orders.retry' || permission === 'orders.read',
}));

vi.mock('next/link', () => ({
  default: ({ href, children }: { href: string; children?: ReactNode }) =>
    createElement('a', { href: typeof href === 'string' ? href : '#' }, children),
}));

vi.mock('next/navigation', () => ({
  useParams: () => ({ id: route.id }),
}));

vi.mock('@/hooks/useAuth', () => ({
  useAuth: () => ({
    can: auth.can,
    loading: false,
    user: { role: 'SUPER_ADMIN', email: 'ops-admin@example.test' },
  }),
}));

vi.mock('@/components/layout/AdminShell', () => ({
  RequirePermission: ({ children }: { children: ReactNode }) => children,
}));

vi.mock('@/services/api-client', () => {
  class ApiClientError extends Error {
    constructor(message: string) {
      super(message);
      this.name = 'ApiClientError';
    }
  }
  return {
    ApiClientError,
    adminApi: {
      getEsimOpsDetail: vi.fn(),
      closeEsimQueryClaim: vi.fn(),
      recoverEsimOrder: vi.fn(),
      revealEsimInstallSecret: vi.fn(),
      createSepayCheckout: vi.fn(),
    },
  };
});

import EsimOpsDetailPage from './page';

const getDetail = vi.mocked(adminApi.getEsimOpsDetail);
const closeClaim = vi.mocked(adminApi.closeEsimQueryClaim);

function lockedDetail(extra: Partial<EsimOpsDetail> = {}): EsimOpsDetail {
  return {
    id: route.id,
    orderCode: 'ORD-LOCK',
    paymentStatus: 'PAID',
    fulfillmentStatus: 'PROCESSING',
    createdAt: '2026-10-27T00:00:00.000Z',
    customer: { name: 'Tester', email: 'buyer@example.test', phone: null },
    pricing: {
      customerPaid: '79000',
      sellAmount: '79000',
      providerCost: '10000',
      paymentFeeAmount: '0',
      paymentMethod: 'VIETQR',
      paymentGateway: 'SEPAY',
    },
    payments: [{ paymentReference: 'PAY-1', gateway: 'SEPAY', amount: '79000', status: 'PAID', paidAt: null }],
    lastError: null,
    present: true,
    providerName: 'Airalo',
    providerCode: 'AIRALO',
    providerMode: 'LIVE',
    providerProductCode: 'pkg-1',
    packageTitle: '1GB',
    airaloOrderId: 'AL-1',
    profilePresent: false,
    installSecretMasked: null,
    installSecret: null,
    canRevealInstallSecret: false,
    attempts: [
      { id: 'create-1', operation: 'CREATE', outcome: 'SENT', providerReference: '104159', providerStatus: null, errorMessage: null, createdAt: '2026-10-27T00:00:00.000Z', completedAt: null },
      { id: 'query-1', operation: 'QUERY', outcome: 'SENT', providerReference: '104159', providerStatus: null, errorMessage: null, createdAt: '2026-10-27T00:01:00.000Z', completedAt: null },
    ],
    ...extra,
  };
}

describe('Admin eSIM ops close QUERY claim UI', () => {
  beforeEach(() => {
    route.id = 'order-lock';
    auth.can = (permission: string) => permission === 'orders.retry' || permission === 'orders.read';
    getDetail.mockReset();
    closeClaim.mockReset();
    getDetail.mockResolvedValue(lockedDetail());
    closeClaim.mockResolvedValue({ result: 'closed' });
    vi.stubGlobal('fetch', vi.fn(() => {
      throw new Error('network disabled in admin eSIM component tests');
    }));
  });

  afterEach(() => {
    cleanup();
    vi.unstubAllGlobals();
  });

  it('does not send the close request until the admin confirms with a reason', async () => {
    const user = userEvent.setup();
    render(<EsimOpsDetailPage />);
    await waitFor(() => expect(screen.getByRole('button', { name: 'Đóng QUERY claim' })).toBeTruthy());
    expect(closeClaim).not.toHaveBeenCalled();

    await user.click(screen.getByRole('button', { name: 'Đóng QUERY claim' }));
    expect((screen.getByRole('button', { name: 'Xác nhận đóng claim' }) as HTMLButtonElement).disabled).toBe(true);
    expect(closeClaim).not.toHaveBeenCalled();

    await user.click(screen.getByRole('button', { name: 'Hủy' }));
    expect(closeClaim).not.toHaveBeenCalled();
    expect(screen.queryByRole('button', { name: 'Xác nhận đóng claim' })).toBeNull();

    await user.click(screen.getByRole('button', { name: 'Đóng QUERY claim' }));
    await user.type(screen.getByPlaceholderText(/job QUERY_OPEN/), 'job QUERY_OPEN đã rời active');
    await user.click(screen.getByRole('button', { name: 'Xác nhận đóng claim' }));

    await waitFor(() => expect(closeClaim).toHaveBeenCalledTimes(1));
    expect(closeClaim).toHaveBeenCalledWith('order-lock', {
      queryAttemptId: 'query-1',
      createAttemptId: 'create-1',
      reason: 'job QUERY_OPEN đã rời active',
    });
  });

  it('hides the close action when the admin lacks orders.retry', async () => {
    auth.can = () => false;
    render(<EsimOpsDetailPage />);
    await waitFor(() => expect(getDetail).toHaveBeenCalled());
    expect(screen.queryByRole('button', { name: 'Đóng QUERY claim' })).toBeNull();
    expect(closeClaim).not.toHaveBeenCalled();
  });
});
