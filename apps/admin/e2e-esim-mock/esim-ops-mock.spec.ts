import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { expect, test } from '@playwright/test';
import {
  countRequests,
  createIsolationState,
  ESIM_K8_MASK,
  ESIM_K8_SAFE_ERROR,
  expectFixtureInUi,
  expectMockOnlyTraffic,
  expectNoFixturePersistence,
  holdReveal,
  installMockIsolation,
  openOps,
  releaseReveal,
  type IsolationState,
} from './isolation';

const opsDetailSrc = readFileSync(resolve(__dirname, '../app/esim-ops/[id]/page.tsx'), 'utf8');

test('real ops page still uses read-only recover labels', () => {
  expect(opsDetailSrc).toContain('Đọc lại đơn Airalo');
  expect(opsDetailSrc).toContain('Chỉ đọc — không tạo eSIM mới');
  expect(opsDetailSrc).not.toContain('Gọi Airalo tạo eSIM');
  expect(opsDetailSrc).toContain('recoverEsimOrder');
});

test.describe('mock-isolated browser', () => {
  let state: IsolationState;

  test.beforeEach(async ({ page }) => {
    state = createIsolationState();
    await installMockIsolation(page, state);
  });

  test.afterEach(() => {
    if (state) expectMockOnlyTraffic(state);
  });

test('1. recover button uses the read-only label', async ({ page }) => {
  await openOps(page, 'order-read-only');
  await expect(page.getByRole('button', { name: 'Chỉ đọc — không tạo eSIM mới' })).toBeVisible();
  await expect(page.getByRole('button', { name: 'Gọi Airalo tạo eSIM' })).toHaveCount(0);
  expect(countRequests(state, 'POST', '/recover')).toBe(0);
  expect(countRequests(state, 'POST', '/reveal')).toBe(0);
});

test('2. detail metadata loads and does not auto-reveal', async ({ page }) => {
  await openOps(page, 'order-a');
  await expect(page.locator('#title')).toHaveText('ORD-order-a');
  await expect(page.getByText(ESIM_K8_MASK, { exact: true })).toBeVisible();
  await expect(page.getByRole('button', { name: 'Hiện mã cài' })).toBeVisible();
  await expectFixtureInUi(page, false);
  expect(countRequests(state, 'GET', '/admin/esim-ops/orders/order-a')).toBe(1);
  expect(countRequests(state, 'POST', '/reveal')).toBe(0);
});

test('3. only an explicit click calls mock reveal', async ({ page }) => {
  await openOps(page, 'order-a');
  await expect(page.getByRole('button', { name: 'Hiện mã cài' })).toBeVisible();
  expect(countRequests(state, 'POST', '/reveal')).toBe(0);
  await page.getByRole('button', { name: 'Hiện mã cài' }).click();
  await expect(page.getByRole('button', { name: 'Ẩn mã' })).toBeVisible();
  await expectFixtureInUi(page, true);
  expect(countRequests(state, 'POST', '/reveal')).toBe(1);
});

test('4. hiding reveal removes the mock secret from the UI', async ({ page }) => {
  await openOps(page, 'order-a');
  await page.getByRole('button', { name: 'Hiện mã cài' }).click();
  await expect(page.getByRole('button', { name: 'Ẩn mã' })).toBeVisible();
  await expectFixtureInUi(page, true);
  await page.getByRole('button', { name: 'Ẩn mã' }).click();
  await expectFixtureInUi(page, false);
  await expect(page.getByText(ESIM_K8_MASK, { exact: true })).toBeVisible();
  await expect(page.getByRole('button', { name: 'Hiện mã cài' })).toBeVisible();
  expect(countRequests(state, 'POST', '/reveal')).toBe(1);
});

test('5. switching order A to B does not keep A secret', async ({ page }) => {
  await openOps(page, 'order-a');
  await page.getByRole('button', { name: 'Hiện mã cài' }).click();
  await expect(page.getByRole('button', { name: 'Ẩn mã' })).toBeVisible();
  await expectFixtureInUi(page, true);
  await page.getByRole('link', { name: 'Order B' }).click();
  await expect(page.locator('#title')).toHaveText('ORD-order-b');
  await expectFixtureInUi(page, false);
  await expect(page.getByRole('button', { name: 'Hiện mã cài' })).toBeVisible();
  expect(countRequests(state, 'POST', '/reveal')).toBe(1);
});

test('6. late reveal for A does not overwrite B', async ({ page }) => {
  holdReveal(state, 'order-a');
  await openOps(page, 'order-a');
  await page.getByRole('button', { name: 'Hiện mã cài' }).click();
  await expect.poll(() => countRequests(state, 'POST', '/reveal')).toBe(1);
  await page.getByRole('link', { name: 'Order B' }).click();
  await expect(page.locator('#title')).toHaveText('ORD-order-b');
  releaseReveal(state, 'order-a');
  await page.waitForFunction(() => document.getElementById('title')?.textContent === 'ORD-order-b');
  await expectFixtureInUi(page, false);
});

test('7. refresh/poll does not reveal or restore a hidden secret', async ({ page }) => {
  await openOps(page, 'order-a');
  await page.getByRole('button', { name: 'Hiện mã cài' }).click();
  await expect(page.getByRole('button', { name: 'Ẩn mã' })).toBeVisible();
  await expectFixtureInUi(page, true);
  await page.getByRole('button', { name: 'Ẩn mã' }).click();
  await expectFixtureInUi(page, false);
  await page.getByRole('button', { name: 'Làm mới' }).click();
  await expect(page.getByText(/Đã tải lại lúc/)).toBeVisible();
  await expectFixtureInUi(page, false);
  expect(countRequests(state, 'POST', '/reveal')).toBe(1);
  expect(countRequests(state, 'GET', '/admin/esim-ops/orders/order-a')).toBeGreaterThanOrEqual(2);
});

test('8. mock reveal error stays generic and does not show the response body', async ({ page }) => {
  state.revealErrors.add('order-a');
  await openOps(page, 'order-a');
  await page.getByRole('button', { name: 'Hiện mã cài' }).click();
  await expect(page.locator('#error')).toHaveText(ESIM_K8_SAFE_ERROR);
  await expectFixtureInUi(page, false);
  await expect(page.getByRole('button', { name: 'Hiện mã cài' })).toBeVisible();
});

test('9. recover calls mock query only and never CREATE', async ({ page }) => {
  await openOps(page, 'order-recover');
  await expect(page.getByRole('button', { name: 'Đọc lại đơn Airalo' })).toBeVisible();
  await page.getByRole('button', { name: 'Đọc lại đơn Airalo' }).click();
  await expect(page.getByText(/Đã đọc lại Airalo — NEED_MANUAL_REVIEW/)).toBeVisible();
  expect(countRequests(state, 'POST', '/recover')).toBe(1);
  expect(countRequests(state, 'POST', '/reveal')).toBe(0);
  expect(
    state.requests.some((item) => item.path.includes('/v2/orders') || item.path === '/api/v1/admin/esim-ops/orders'),
  ).toBe(false);
});

test('10. fixture is not stored in URL, localStorage, sessionStorage, or console', async ({ page }) => {
  await openOps(page, 'order-a');
  await page.getByRole('button', { name: 'Hiện mã cài' }).click();
  await expect(page.getByRole('button', { name: 'Ẩn mã' })).toBeVisible();
  await expectFixtureInUi(page, true);
  await expectNoFixturePersistence(page);
  expect(state.blocked.includes('console-fixture')).toBe(false);
});
});
