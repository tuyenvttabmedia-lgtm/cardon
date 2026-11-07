import { expect, type Page, type Route } from '@playwright/test';
import { renderHarnessHtml } from './harness';

/** Uninstallable mock only. Never log, assert, or screenshot this string. */
export const ESIM_K8_FIXTURE = 'TEST-ESIM-NOT-REAL:invalid$K8';
export const ESIM_K8_MASK = '••••-masked';
export const ESIM_K8_ORIGIN = 'http://127.0.0.1:4310';
export const ESIM_K8_SAFE_ERROR = 'eSIM reveal failed';

const ALLOWED_ORDERS = new Set(['order-a', 'order-b', 'order-recover', 'order-read-only']);

export type RecordedRequest = { method: string; path: string };

export type IsolationState = {
  requests: RecordedRequest[];
  blocked: string[];
  revealGates: Map<string, { promise: Promise<void>; resolve: () => void }>;
  revealErrors: Set<string>;
};

export function createIsolationState(): IsolationState {
  return {
    requests: [],
    blocked: [],
    revealGates: new Map(),
    revealErrors: new Set(),
  };
}

function sanitizeUrl(raw: string): string {
  try {
    const url = new URL(raw);
    return `${url.origin}${url.pathname}`;
  } catch {
    return 'invalid-url';
  }
}

function orderFromPath(pathname: string, suffix: string): string | null {
  const match = pathname.match(new RegExp(`^/api/v1/admin/esim-ops/orders/([^/]+)${suffix}$`));
  if (!match) return null;
  return ALLOWED_ORDERS.has(match[1]) ? match[1] : null;
}

function detailFor(orderId: string) {
  if (orderId === 'order-recover') {
    return {
      id: orderId,
      orderCode: 'ORD-order-recover',
      paymentStatus: 'PAID',
      fulfillmentStatus: 'NEED_MANUAL_REVIEW',
      profilePresent: false,
      airaloOrderId: 'AL-MOCK-1',
      installSecretMasked: null,
      installSecret: null,
      canRevealInstallSecret: false,
    };
  }
  if (orderId === 'order-read-only') {
    return {
      id: orderId,
      orderCode: 'ORD-order-read-only',
      paymentStatus: 'PAID',
      fulfillmentStatus: 'PENDING',
      profilePresent: false,
      airaloOrderId: null,
      installSecretMasked: null,
      installSecret: null,
      canRevealInstallSecret: false,
    };
  }
  return {
    id: orderId,
    orderCode: `ORD-${orderId}`,
    paymentStatus: 'PAID',
    fulfillmentStatus: 'COMPLETED',
    profilePresent: true,
    airaloOrderId: 'AL-MOCK-1',
    installSecretMasked: ESIM_K8_MASK,
    installSecret: null,
    canRevealInstallSecret: true,
  };
}

function json(route: Route, status: number, data: unknown) {
  return route.fulfill({
    status,
    contentType: 'application/json',
    body: JSON.stringify(data),
  });
}

function isCreateAttempt(method: string, pathname: string): boolean {
  if (method === 'POST' && pathname === '/api/v1/admin/esim-ops/orders') return true;
  if (pathname.includes('/v2/orders')) return true;
  if (pathname.includes('airalo.com')) return true;
  return false;
}

async function fulfillApi(route: Route, state: IsolationState, method: string, pathname: string) {
  const detailId = orderFromPath(pathname, '');
  if (method === 'GET' && detailId) {
    return json(route, 200, { success: true, data: detailFor(detailId) });
  }

  const recoverId = orderFromPath(pathname, '/recover');
  if (method === 'POST' && recoverId) {
    return json(route, 200, {
      success: true,
      data: {
        orderId: recoverId,
        fulfillmentStatus: 'NEED_MANUAL_REVIEW',
        created: false,
        queried: true,
        hasOpenCreate: true,
        hasReference: true,
      },
    });
  }

  const revealId = orderFromPath(pathname, '/reveal');
  if (method === 'POST' && revealId) {
    if (state.revealErrors.has(revealId)) {
      return json(route, 500, {
        success: false,
        error: { message: ESIM_K8_SAFE_ERROR, code: 'ESIM_REVEAL_FAILED' },
        debug: ESIM_K8_FIXTURE,
      });
    }
    const gate = state.revealGates.get(revealId);
    if (gate) {
      await gate.promise;
    }
    return json(route, 200, {
      success: true,
      data: { installSecret: ESIM_K8_FIXTURE, qrSvg: null, appleSetupUrl: null },
    });
  }

  state.blocked.push(`${method} ${pathname}`);
  await route.abort('blockedbyclient');
}

export async function installMockIsolation(page: Page, state: IsolationState): Promise<void> {
  page.on('console', (msg) => {
    if (msg.text().includes(ESIM_K8_FIXTURE)) {
      state.blocked.push('console-fixture');
    }
  });

  await page.route('**/*', async (route) => {
    const request = route.request();
    const method = request.method();
    let url: URL;
    try {
      url = new URL(request.url());
    } catch {
      state.blocked.push('invalid-url');
      await route.abort('blockedbyclient');
      return;
    }

    if (url.origin !== ESIM_K8_ORIGIN) {
      state.blocked.push(`host:${sanitizeUrl(request.url())}`);
      await route.abort('blockedbyclient');
      return;
    }

    if (url.pathname === '/favicon.ico') {
      await route.fulfill({ status: 204, body: '' });
      return;
    }

    if (request.resourceType() === 'document' && /^\/esim-ops\/[a-z0-9-]+$/.test(url.pathname)) {
      await route.fulfill({
        status: 200,
        contentType: 'text/html; charset=utf-8',
        body: renderHarnessHtml(),
      });
      return;
    }

    if (url.pathname.startsWith('/api/v1/')) {
      state.requests.push({ method, path: url.pathname });
      if (isCreateAttempt(method, url.pathname)) {
        state.blocked.push(`create:${method} ${url.pathname}`);
        await route.abort('blockedbyclient');
        return;
      }
      await fulfillApi(route, state, method, url.pathname);
      return;
    }

    state.blocked.push(`${method} ${url.pathname}`);
    await route.abort('blockedbyclient');
  });
}

export async function openOps(page: Page, orderId: string) {
  await page.goto(`${ESIM_K8_ORIGIN}/esim-ops/${orderId}`, { waitUntil: 'domcontentloaded' });
}

export function holdReveal(state: IsolationState, orderId: string) {
  let resolve: () => void = () => undefined;
  const promise = new Promise<void>((next) => {
    resolve = next;
  });
  state.revealGates.set(orderId, { promise, resolve });
}

export function releaseReveal(state: IsolationState, orderId: string) {
  const gate = state.revealGates.get(orderId);
  state.revealGates.delete(orderId);
  gate?.resolve();
}

export async function expectFixtureInUi(page: Page, present: boolean) {
  const found = await page.evaluate((needle) => {
    const root = document.documentElement;
    return Boolean(root.textContent?.includes(needle) || root.innerHTML.includes(needle));
  }, ESIM_K8_FIXTURE);
  if (present && !found) {
    throw new Error('install fixture missing from UI');
  }
  if (!present && found) {
    throw new Error('install fixture leaked into UI');
  }
}

export async function expectNoFixturePersistence(page: Page) {
  const leaked = await page.evaluate((needle) => {
    const urlHit = location.href.includes(needle);
    const stores = [localStorage, sessionStorage];
    const storageHit = stores.some((storage) => {
      for (let i = 0; i < storage.length; i += 1) {
        const key = storage.key(i) ?? '';
        const value = storage.getItem(key) ?? '';
        if (key.includes(needle) || value.includes(needle)) return true;
      }
      return false;
    });
    return urlHit || storageHit;
  }, ESIM_K8_FIXTURE);
  if (leaked) {
    throw new Error('install fixture leaked into URL or browser storage');
  }
}

export function expectMockOnlyTraffic(state: IsolationState) {
  expect(state.blocked, 'unexpected or unmocked request was blocked').toEqual([]);
  const create = state.requests.filter((item) => isCreateAttempt(item.method, item.path));
  expect(create, 'CREATE/Airalo POST must not be issued').toEqual([]);
  for (const item of state.requests) {
    const allowed =
      /^\/api\/v1\/admin\/esim-ops\/orders\/(order-a|order-b|order-recover|order-read-only)$/.test(item.path) ||
      /^\/api\/v1\/admin\/esim-ops\/orders\/(order-a|order-b|order-recover|order-read-only)\/(reveal|recover)$/.test(
        item.path,
      );
    expect(allowed, `request outside allowlist: ${item.method} ${item.path}`).toBe(true);
  }
}

export function countRequests(state: IsolationState, method: string, suffix: string) {
  return state.requests.filter((item) => item.method === method && item.path.endsWith(suffix)).length;
}
