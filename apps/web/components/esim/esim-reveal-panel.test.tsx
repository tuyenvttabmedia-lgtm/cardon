import { createElement, type ReactNode } from 'react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { act, cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { EsimInstallPanel } from '@/components/esim/EsimInstallPanel';
import AccountEsimPage from '@/app/account/esim/page';
import { ESIM_REVEAL_TEST_FIXTURE } from '@/lib/esim-reveal-state';
import { accountApi, orderApi } from '@/services/api-client';
import type { EsimDelivery } from '@/types/api';

vi.mock('next/link', () => ({
  default: ({ href, children }: { href: string; children?: ReactNode }) =>
    createElement('a', { href: typeof href === 'string' ? href : '#' }, children),
}));

vi.mock('@/services/api-client', () => ({
  orderApi: {
    revealEsim: vi.fn(),
    getDelivery: vi.fn(),
  },
  accountApi: {
    listEsimProfiles: vi.fn(),
  },
}));

const FIXTURE = ESIM_REVEAL_TEST_FIXTURE;
const FAKE_QR = '<svg data-testid="fake-qr"></svg>';
const SAFE_ERROR = 'eSIM reveal failed';

const revealEsim = vi.mocked(orderApi.revealEsim);
const getDelivery = vi.mocked(orderApi.getDelivery);
const listEsimProfiles = vi.mocked(accountApi.listEsimProfiles);

function metadataReady(orderId: string, extra: Partial<EsimDelivery> = {}): EsimDelivery {
  return {
    kind: 'ready',
    destination: 'Japan',
    packageName: '1GB',
    testData: true,
    notice: 'metadata only',
    installSecret: null,
    qrSvg: null,
    appleSetupUrl: null,
    canRevealInstallSecret: true,
    packageSpec: {
      title: '1GB',
      dataAllowanceLabel: '1 GB',
      validityLabel: '7 ngày',
      activationLabel: null,
      fupClear: null,
      fairUsagePolicy: null,
      catalogueLifecycle: null,
      specSource: 'catalogue_current',
      notice: 'spec',
    },
    id: orderId,
    orderId,
    orderCode: `ORD-${orderId}`,
    ...extra,
  };
}

function mockRevealPayload() {
  return {
    installSecret: FIXTURE,
    qrSvg: FAKE_QR,
    appleSetupUrl: null as string | null,
  };
}

function hasFixture(root: HTMLElement): boolean {
  return Boolean(root.textContent?.includes(FIXTURE) || root.innerHTML.includes(FIXTURE));
}

function expectFixturePresent(root: HTMLElement) {
  if (!hasFixture(root)) {
    throw new Error('install fixture missing from UI');
  }
}

function expectFixtureAbsent(root: HTMLElement) {
  if (hasFixture(root)) {
    throw new Error('install fixture leaked into UI');
  }
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
  const href = window.location.href;
  if (href.includes(FIXTURE)) {
    throw new Error('install fixture leaked into URL');
  }
}

function expectNoFixtureInConsole(
  spies: Array<ReturnType<typeof vi.spyOn>>,
) {
  for (const spy of spies) {
    for (const args of spy.mock.calls) {
      const text = args.map((arg: unknown) => (typeof arg === 'string' ? arg : '')).join(' ');
      if (text.includes(FIXTURE)) {
        throw new Error('install fixture leaked to console');
      }
    }
  }
}

describe('Customer eSIM reveal panel', () => {
  let consoleSpies: Array<ReturnType<typeof vi.spyOn>>;

  beforeEach(() => {
    vi.stubGlobal('fetch', vi.fn(() => {
      throw new Error('network disabled in eSIM component tests');
    }));
    revealEsim.mockReset();
    getDelivery.mockReset();
    listEsimProfiles.mockReset();
    window.localStorage.clear();
    window.sessionStorage.clear();
    consoleSpies = ['log', 'info', 'warn', 'error', 'debug'].map((method) =>
      vi.spyOn(console, method as keyof Console).mockImplementation(() => undefined),
    );
  });

  afterEach(() => {
    cleanup();
    consoleSpies.forEach((spy) => spy.mockRestore());
    vi.useRealTimers();
    vi.unstubAllGlobals();
  });

  it('1. mounts metadata only and does not auto-reveal', () => {
    const view = render(<EsimInstallPanel esim={metadataReady('order-a')} />);
    expect(screen.getByRole('button', { name: 'Hiện mã cài' })).toBeTruthy();
    expect(screen.getByText('QR hiện sau khi mở mã')).toBeTruthy();
    expectFixtureAbsent(view.container);
    expect(revealEsim).not.toHaveBeenCalled();
    expect(getDelivery).not.toHaveBeenCalled();
  });

  it('2. clicks reveal once and keeps the result in React state', async () => {
    revealEsim.mockResolvedValue(mockRevealPayload());
    const user = userEvent.setup();
    const view = render(<EsimInstallPanel esim={metadataReady('order-a')} />);
    await user.click(screen.getByRole('button', { name: 'Hiện mã cài' }));
    await waitFor(() => expectFixturePresent(view.container));
    expect(revealEsim).toHaveBeenCalledTimes(1);
    expect(revealEsim).toHaveBeenCalledWith('order-a', undefined);
    expect(screen.getByTestId('fake-qr')).toBeTruthy();
    expect(screen.getByRole('button', { name: 'Ẩn mã' })).toBeTruthy();
  });

  it('3. hide removes the fixture from the DOM', async () => {
    revealEsim.mockResolvedValue(mockRevealPayload());
    const user = userEvent.setup();
    const view = render(<EsimInstallPanel esim={metadataReady('order-a')} />);
    await user.click(screen.getByRole('button', { name: 'Hiện mã cài' }));
    await waitFor(() => expectFixturePresent(view.container));
    await user.click(screen.getByRole('button', { name: 'Ẩn mã' }));
    expectFixtureAbsent(view.container);
    expect(screen.getByRole('button', { name: 'Hiện mã cài' })).toBeTruthy();
    expect(screen.queryByTestId('fake-qr')).toBeNull();
  });

  it('4. remount after unmount does not restore a previous reveal', async () => {
    revealEsim.mockResolvedValue(mockRevealPayload());
    const user = userEvent.setup();
    const first = render(<EsimInstallPanel esim={metadataReady('order-a')} />);
    await user.click(screen.getByRole('button', { name: 'Hiện mã cài' }));
    await waitFor(() => expectFixturePresent(first.container));
    first.unmount();
    const second = render(<EsimInstallPanel esim={metadataReady('order-a')} />);
    expectFixtureAbsent(second.container);
    expect(screen.getByRole('button', { name: 'Hiện mã cài' })).toBeTruthy();
    expect(revealEsim).toHaveBeenCalledTimes(1);
  });

  it('5. changing orderId does not show the previous order secret', async () => {
    revealEsim.mockResolvedValue(mockRevealPayload());
    const user = userEvent.setup();
    const view = render(<EsimInstallPanel esim={metadataReady('order-a')} />);
    await user.click(screen.getByRole('button', { name: 'Hiện mã cài' }));
    await waitFor(() => expectFixturePresent(view.container));
    view.rerender(<EsimInstallPanel esim={metadataReady('order-b')} />);
    expectFixtureAbsent(view.container);
    expect(screen.getByRole('button', { name: 'Hiện mã cài' })).toBeTruthy();
  });

  it('6. ignores a late reveal response after switching orders', async () => {
    let resolveFirst: ((value: ReturnType<typeof mockRevealPayload>) => void) | undefined;
    revealEsim.mockImplementationOnce(
      () =>
        new Promise((resolve) => {
          resolveFirst = resolve;
        }),
    );
    const user = userEvent.setup();
    const view = render(<EsimInstallPanel esim={metadataReady('order-a')} />);
    await user.click(screen.getByRole('button', { name: 'Hiện mã cài' }));
    view.rerender(<EsimInstallPanel esim={metadataReady('order-b')} />);
    expect(screen.getByRole('button', { name: 'Hiện mã cài' })).toBeTruthy();
    resolveFirst?.(mockRevealPayload());
    await waitFor(() => expect(revealEsim).toHaveBeenCalledTimes(1));
    expectFixtureAbsent(view.container);
  });

  it('7. account polling only loads metadata and never reveals', async () => {
    vi.useFakeTimers();
    listEsimProfiles.mockResolvedValue([metadataReady('order-a')]);
    render(<AccountEsimPage />);
    await act(async () => {
      await Promise.resolve();
    });
    expect(listEsimProfiles).toHaveBeenCalledTimes(1);
    expect(screen.getByRole('button', { name: 'Hiện mã cài' })).toBeTruthy();
    await act(async () => {
      await vi.advanceTimersByTimeAsync(8000);
    });
    expect(listEsimProfiles.mock.calls.length).toBeGreaterThanOrEqual(2);
    expect(revealEsim).not.toHaveBeenCalled();
    expect(getDelivery).not.toHaveBeenCalled();
  });

  it('8. polling after hide does not restore a hidden secret', async () => {
    vi.useFakeTimers();
    listEsimProfiles.mockResolvedValue([metadataReady('order-a')]);
    revealEsim.mockResolvedValue(mockRevealPayload());
    const view = render(<AccountEsimPage />);
    await act(async () => {
      await Promise.resolve();
    });
    await act(async () => {
      fireEvent.click(screen.getByRole('button', { name: 'Hiện mã cài' }));
      await Promise.resolve();
    });
    expectFixturePresent(view.container);
    fireEvent.click(screen.getByRole('button', { name: 'Ẩn mã' }));
    expectFixtureAbsent(view.container);
    listEsimProfiles.mockResolvedValue([
      metadataReady('order-a', {
        installSecret: FIXTURE,
        qrSvg: FAKE_QR,
        appleSetupUrl: 'https://example.test/not-a-setup',
      }),
    ]);
    await act(async () => {
      await vi.advanceTimersByTimeAsync(8000);
    });
    expect(listEsimProfiles.mock.calls.length).toBeGreaterThanOrEqual(2);
    expectFixtureAbsent(view.container);
    expect(revealEsim).toHaveBeenCalledTimes(1);
  });

  it('9. does not write the fixture into localStorage or sessionStorage', async () => {
    revealEsim.mockResolvedValue(mockRevealPayload());
    const user = userEvent.setup();
    render(<EsimInstallPanel esim={metadataReady('order-a')} />);
    await user.click(screen.getByRole('button', { name: 'Hiện mã cài' }));
    await waitFor(() => expectFixturePresent(document.body));
    expectNoFixtureInStorage();
  });

  it('10. does not put the fixture in the URL or console', async () => {
    revealEsim.mockResolvedValue(mockRevealPayload());
    const user = userEvent.setup();
    render(<EsimInstallPanel esim={metadataReady('order-a')} />);
    await user.click(screen.getByRole('button', { name: 'Hiện mã cài' }));
    await waitFor(() => expectFixturePresent(document.body));
    expectNoFixtureInUrl();
    expectNoFixtureInConsole(consoleSpies);
  });

  it('11. reveal errors stay generic and do not render the fixture', async () => {
    revealEsim.mockRejectedValue(new Error(SAFE_ERROR));
    const user = userEvent.setup();
    const view = render(<EsimInstallPanel esim={metadataReady('order-a')} />);
    await user.click(screen.getByRole('button', { name: 'Hiện mã cài' }));
    await waitFor(() => expect(screen.getByText(SAFE_ERROR)).toBeTruthy());
    expectFixtureAbsent(view.container);
    expect(screen.queryByTestId('fake-qr')).toBeNull();
    expect(screen.getByRole('button', { name: 'Hiện mã cài' })).toBeTruthy();
  });
});
