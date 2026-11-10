/** @vitest-environment jsdom */
import { createElement, type ReactNode } from 'react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { cleanup, render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { adminApi } from '@/services/api-client';
import type { EsimOpsDetail } from '@/types/api';

const route = vi.hoisted(() => ({ id: 'order-recover' }));
const auth = vi.hoisted(() => ({
  can: (permission: string) => permission === 'orders.retry' || permission === 'orders.read',
}));

vi.mock('next/link', () => ({
  default: ({ href, children }: { href: string; children?: ReactNode }) =>
    createElement('a', { href: typeof href === 'string' ? href : '#' }, children),
}));

vi.mock('next/navigation', () => ({
  useParams: () => ({ id: route.id }),
  usePathname: () => `/esim-ops/${route.id}`,
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
const recover = vi.mocked(adminApi.recoverEsimOrder);

function nmrDetail(extra: Partial<EsimOpsDetail> = {}): EsimOpsDetail {
  return {
    id: route.id,
    orderCode: 'ORD-RECOVER',
    paymentStatus: 'PAID',
    fulfillmentStatus: 'NEED_MANUAL_REVIEW',
    paidUnfulfilled: true,
    lane: 'LIVE',
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
    snapshot: null,
    payments: [{ paymentReference: 'PAY-1', gateway: 'SEPAY', amount: '79000', status: 'SUCCESS', paidAt: null }],
    lastError: null,
    adminActions: [],
    present: true,
    providerName: 'Airalo',
    providerCode: 'AIRALO',
    providerMode: 'LIVE',
    providerProductCode: 'pkg-1',
    packageTitle: '1GB',
    airaloOrderId: 'AL-99',
    profilePresent: false,
    installSecretMasked: null,
    installSecret: null,
    canRevealInstallSecret: false,
    attempts: [],
    ...extra,
  } as EsimOpsDetail;
}

describe('Admin eSIM ops recover confirmation (D2-A2)', () => {
  beforeEach(() => {
    route.id = 'order-recover';
    auth.can = (permission: string) => permission === 'orders.retry' || permission === 'orders.read';
    getDetail.mockReset();
    recover.mockReset();
    getDetail.mockResolvedValue(nmrDetail());
    recover.mockResolvedValue({ fulfillmentStatus: 'NEED_MANUAL_REVIEW' });
    vi.stubGlobal('fetch', vi.fn(() => {
      throw new Error('network disabled in admin eSIM component tests');
    }));
  });

  afterEach(() => {
    cleanup();
    vi.unstubAllGlobals();
  });

  it('does not call recover on page load', async () => {
    render(<EsimOpsDetailPage />);
    await waitFor(() => expect(getDetail).toHaveBeenCalled());
    expect(recover).not.toHaveBeenCalled();
  });

  it('opens confirm, cancel does not call API, confirm calls once', async () => {
    const user = userEvent.setup();
    render(<EsimOpsDetailPage />);
    await waitFor(() =>
      expect(screen.getByRole('button', { name: 'Đọc lại đơn nhà cung cấp' })).toBeTruthy(),
    );

    await user.click(screen.getByRole('button', { name: 'Đọc lại đơn nhà cung cấp' }));
    expect(screen.getByRole('button', { name: 'Xác nhận đọc lại' })).toBeTruthy();
    expect(screen.getByText(/Đơn ORD-RECOVER · TT PAID/)).toBeTruthy();
    expect(recover).not.toHaveBeenCalled();

    await user.click(screen.getByRole('button', { name: 'Hủy' }));
    expect(recover).not.toHaveBeenCalled();
    expect(screen.queryByRole('button', { name: 'Xác nhận đọc lại' })).toBeNull();

    await user.click(screen.getByRole('button', { name: 'Đọc lại đơn nhà cung cấp' }));
    await user.click(screen.getByRole('button', { name: 'Xác nhận đọc lại' }));
    await waitFor(() => expect(recover).toHaveBeenCalledTimes(1));
    expect(recover).toHaveBeenCalledWith('order-recover');
  });

  it('blocks double confirm while busy', async () => {
    const user = userEvent.setup();
    let resolveRecover: ((value: { fulfillmentStatus: string }) => void) | undefined;
    recover.mockImplementation(
      () =>
        new Promise((resolve) => {
          resolveRecover = resolve;
        }),
    );

    render(<EsimOpsDetailPage />);
    await waitFor(() =>
      expect(screen.getByRole('button', { name: 'Đọc lại đơn nhà cung cấp' })).toBeTruthy(),
    );
    await user.click(screen.getByRole('button', { name: 'Đọc lại đơn nhà cung cấp' }));
    await user.click(screen.getByRole('button', { name: 'Xác nhận đọc lại' }));

    await waitFor(() => expect(recover).toHaveBeenCalledTimes(1));
    const busyButtons = screen.getAllByRole('button', {
      name: /Đang đọc nhà cung cấp/,
    }) as HTMLButtonElement[];
    expect(busyButtons.length).toBeGreaterThan(0);
    expect(busyButtons.every((btn) => btn.disabled)).toBe(true);
    await user.click(busyButtons[0]);
    expect(recover).toHaveBeenCalledTimes(1);

    resolveRecover?.({ fulfillmentStatus: 'COMPLETED' });
    await waitFor(() =>
      expect(screen.queryByRole('button', { name: 'Xác nhận đọc lại' })).toBeNull(),
    );
  });
});
