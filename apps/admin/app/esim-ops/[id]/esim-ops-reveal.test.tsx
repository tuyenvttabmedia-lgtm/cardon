/** @vitest-environment jsdom */
import { createElement, type ReactNode } from 'react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { act, cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { ESIM_REVEAL_TEST_FIXTURE } from '@/lib/esim-reveal-state';
import { adminApi } from '@/services/api-client';
import type { EsimOpsDetail } from '@/types/api';

const route = vi.hoisted(() => ({ id: 'order-a' }));

vi.mock('next/link', () => ({
  default: ({ href, children }: { href: string; children?: ReactNode }) =>
    createElement('a', { href: typeof href === 'string' ? href : '#' }, children),
}));

vi.mock('next/navigation', () => ({
  useParams: () => ({ id: route.id }),
}));

vi.mock('@/hooks/useAuth', () => ({
  useAuth: () => ({
    can: () => true,
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
      revealEsimInstallSecret: vi.fn(),
      recoverEsimOrder: vi.fn(),
      closeEsimQueryClaim: vi.fn(),
      createSepayCheckout: vi.fn(),
    },
  };
});

import EsimOpsDetailPage from './page';

const FIXTURE = ESIM_REVEAL_TEST_FIXTURE;
const MASK = '••••-masked';
const SAFE_ERROR = 'eSIM reveal failed';
const getDetail = vi.mocked(adminApi.getEsimOpsDetail);
const revealSecret = vi.mocked(adminApi.revealEsimInstallSecret);

function opsDetail(orderId: string, extra: Partial<EsimOpsDetail> = {}): EsimOpsDetail {
  return {
    id: orderId,
    orderCode: `ORD-${orderId}`,
    paymentStatus: 'PAID',
    fulfillmentStatus: 'COMPLETED',
    createdAt: '2026-10-26T00:00:00.000Z',
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
    profilePresent: true,
    installSecretMasked: MASK,
    installSecret: null,
    canRevealInstallSecret: true,
    attempts: [],
    ...extra,
  };
}

function hasFixture(root: HTMLElement): boolean {
  return Boolean(root.textContent?.includes(FIXTURE) || root.innerHTML.includes(FIXTURE));
}

function expectFixturePresent(root: HTMLElement) {
  if (!hasFixture(root)) throw new Error('install fixture missing from UI');
}

function expectFixtureAbsent(root: HTMLElement) {
  if (hasFixture(root)) throw new Error('install fixture leaked into UI');
}

function expectNoFixtureInStorage() {
  for (const storage of [window.localStorage, window.sessionStorage]) {
    for (let index = 0; index < storage.length; index += 1) {
      const key = storage.key(index) ?? '';
      const value = storage.getItem(key) ?? '';
      if (key.includes(FIXTURE) || value.includes(FIXTURE)) {
        throw new Error('install fixture leaked into browser storage');
      }
    }
  }
}

function expectNoFixtureInUrl() {
  if (window.location.href.includes(FIXTURE)) {
    throw new Error('install fixture leaked into URL');
  }
}

function expectNoFixtureInConsole(spies: Array<ReturnType<typeof vi.spyOn>>) {
  for (const spy of spies) {
    for (const args of spy.mock.calls) {
      const text = args.map((arg: unknown) => (typeof arg === 'string' ? arg : '')).join(' ');
      if (text.includes(FIXTURE)) {
        throw new Error('install fixture leaked to console');
      }
    }
  }
}

async function renderOps() {
  const view = render(<EsimOpsDetailPage />);
  await waitFor(() => expect(getDetail).toHaveBeenCalled());
  await waitFor(() => screen.getByRole('button', { name: 'Hiện mã cài' }));
  return view;
}

function installClipboardStub(writeText: ReturnType<typeof vi.fn>) {
  Object.defineProperty(navigator, 'clipboard', {
    configurable: true,
    value: { writeText },
  });
}

describe('Admin eSIM ops reveal UI', () => {
  let consoleSpies: Array<ReturnType<typeof vi.spyOn>>;
  let writeText: ReturnType<typeof vi.fn>;
  let navigatorClipboardDescriptor: PropertyDescriptor | undefined;

  beforeEach(() => {
    route.id = 'order-a';
    writeText = vi.fn().mockResolvedValue(undefined);
    navigatorClipboardDescriptor = Object.getOwnPropertyDescriptor(navigator, 'clipboard');
    installClipboardStub(writeText);
    vi.stubGlobal('fetch', vi.fn(() => {
      throw new Error('network disabled in admin eSIM component tests');
    }));
    getDetail.mockReset();
    revealSecret.mockReset();
    getDetail.mockImplementation(async (id: string) => opsDetail(id));
    window.localStorage.clear();
    window.sessionStorage.clear();
    consoleSpies = ['log', 'info', 'warn', 'error', 'debug'].map((method) =>
      vi.spyOn(console, method as keyof Console).mockImplementation(() => undefined),
    );
  });

  afterEach(() => {
    cleanup();
    consoleSpies.forEach((spy) => spy.mockRestore());
    if (navigatorClipboardDescriptor) {
      Object.defineProperty(navigator, 'clipboard', navigatorClipboardDescriptor);
    } else {
      Reflect.deleteProperty(navigator, 'clipboard');
    }
    vi.unstubAllGlobals();
  });

  it('1. loads GET detail metadata and does not auto-reveal', async () => {
    const view = await renderOps();
    expect(getDetail).toHaveBeenCalledTimes(1);
    expect(getDetail).toHaveBeenCalledWith('order-a');
    expect(revealSecret).not.toHaveBeenCalled();
    expect(screen.getByText(MASK)).toBeTruthy();
    expectFixtureAbsent(view.container);
  });

  it('2. reveal runs only after click and calls the mock once', async () => {
    revealSecret.mockResolvedValue({
      installSecret: FIXTURE,
      qrSvg: null,
      appleSetupUrl: null,
    });
    const user = userEvent.setup();
    const view = await renderOps();
    await user.click(screen.getByRole('button', { name: 'Hiện mã cài' }));
    await waitFor(() => expectFixturePresent(view.container));
    expect(revealSecret).toHaveBeenCalledTimes(1);
    expect(revealSecret).toHaveBeenCalledWith('order-a');
    expect(screen.getByRole('button', { name: 'Ẩn mã' })).toBeTruthy();
  });

  it('3. hide removes the fixture from the DOM', async () => {
    revealSecret.mockResolvedValue({ installSecret: FIXTURE, qrSvg: null, appleSetupUrl: null });
    const user = userEvent.setup();
    const view = await renderOps();
    await user.click(screen.getByRole('button', { name: 'Hiện mã cài' }));
    await waitFor(() => expectFixturePresent(view.container));
    await user.click(screen.getByRole('button', { name: 'Ẩn mã' }));
    expectFixtureAbsent(view.container);
    expect(screen.getByText(MASK)).toBeTruthy();
    expect(screen.getByRole('button', { name: 'Hiện mã cài' })).toBeTruthy();
  });

  it('4. changing params.id from A to B does not show A secret', async () => {
    revealSecret.mockResolvedValue({ installSecret: FIXTURE, qrSvg: null, appleSetupUrl: null });
    const user = userEvent.setup();
    const view = await renderOps();
    await user.click(screen.getByRole('button', { name: 'Hiện mã cài' }));
    await waitFor(() => expectFixturePresent(view.container));
    route.id = 'order-b';
    view.rerender(<EsimOpsDetailPage />);
    await waitFor(() => expect(screen.getAllByText('ORD-order-b').length).toBeGreaterThan(0));
    expectFixtureAbsent(view.container);
    expect(screen.getByRole('button', { name: 'Hiện mã cài' })).toBeTruthy();
    expect(revealSecret).toHaveBeenCalledTimes(1);
  });

  it('5. ignores a late reveal response after switching orders', async () => {
    let resolveA: ((value: { installSecret: string; qrSvg: null; appleSetupUrl: null }) => void) | undefined;
    revealSecret.mockImplementationOnce(
      () =>
        new Promise((resolve) => {
          resolveA = resolve;
        }),
    );
    const view = await renderOps();
    fireEvent.click(screen.getByRole('button', { name: 'Hiện mã cài' }));
    route.id = 'order-b';
    view.rerender(<EsimOpsDetailPage />);
    await waitFor(() => expect(screen.getAllByText('ORD-order-b').length).toBeGreaterThan(0));
    await act(async () => {
      resolveA?.({ installSecret: FIXTURE, qrSvg: null, appleSetupUrl: null });
    });
    expectFixtureAbsent(view.container);
  });

  it('6. stale load() for A does not overwrite B detail', async () => {
    let resolveA: ((value: EsimOpsDetail) => void) | undefined;
    getDetail.mockImplementationOnce(
      () =>
        new Promise((resolve) => {
          resolveA = resolve;
        }),
    );
    const view = render(<EsimOpsDetailPage />);
    route.id = 'order-b';
    view.rerender(<EsimOpsDetailPage />);
    await waitFor(() => expect(screen.getAllByText('ORD-order-b').length).toBeGreaterThan(0));
    await act(async () => {
      resolveA?.(
        opsDetail('order-a', {
          orderCode: 'ORD-STALE-A',
          installSecret: FIXTURE,
        }),
      );
    });
    expect(screen.getAllByText('ORD-order-b').length).toBeGreaterThan(0);
    expect(screen.queryByText('ORD-STALE-A')).toBeNull();
    expectFixtureAbsent(view.container);
  });

  it('7. refresh metadata does not call reveal', async () => {
    const user = userEvent.setup();
    await renderOps();
    await user.click(screen.getByRole('button', { name: 'Làm mới' }));
    await waitFor(() => expect(getDetail.mock.calls.length).toBeGreaterThanOrEqual(2));
    expect(revealSecret).not.toHaveBeenCalled();
  });

  it('8. does not persist the fixture in storage, URL, or console', async () => {
    revealSecret.mockResolvedValue({ installSecret: FIXTURE, qrSvg: null, appleSetupUrl: null });
    const user = userEvent.setup();
    const view = await renderOps();
    await user.click(screen.getByRole('button', { name: 'Hiện mã cài' }));
    await waitFor(() => expectFixturePresent(view.container));
    expectNoFixtureInStorage();
    expectNoFixtureInUrl();
    expectNoFixtureInConsole(consoleSpies);
  });

  it('9. copy happens only after an explicit user click and does not log clipboard', async () => {
    revealSecret.mockResolvedValue({ installSecret: FIXTURE, qrSvg: null, appleSetupUrl: null });
    const user = userEvent.setup();
    const view = await renderOps();
    expect(writeText).not.toHaveBeenCalled();
    await user.click(screen.getByRole('button', { name: 'Hiện mã cài' }));
    await waitFor(() => expectFixturePresent(view.container));
    expect(writeText).not.toHaveBeenCalled();
    writeText.mockClear();
    installClipboardStub(writeText);
    await act(async () => {
      screen.getByRole('button', { name: 'Copy' }).click();
    });
    await expect.poll(() => writeText.mock.calls.length).toBe(1);
    const written = writeText.mock.calls[0]?.[0];
    if (written !== FIXTURE) {
      throw new Error('clipboard did not receive the install fixture');
    }
    expectNoFixtureInConsole(consoleSpies);
  });

  it('10. reveal errors stay generic and do not render the fixture', async () => {
    const { ApiClientError } = await import('@/services/api-client');
    revealSecret.mockRejectedValue(new ApiClientError(SAFE_ERROR, 500));
    const user = userEvent.setup();
    const view = await renderOps();
    await user.click(screen.getByRole('button', { name: 'Hiện mã cài' }));
    await waitFor(() => expect(screen.getByText(SAFE_ERROR)).toBeTruthy());
    expectFixtureAbsent(view.container);
    expect(screen.getByRole('button', { name: 'Hiện mã cài' })).toBeTruthy();
  });
});
