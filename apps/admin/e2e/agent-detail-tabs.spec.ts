import { expect, test, type Page } from '@playwright/test';

const email = process.env.ADMIN_E2E_EMAIL;
const password = process.env.ADMIN_E2E_PASSWORD;
const agentId = process.env.ADMIN_E2E_AGENT_ID;
const secondAgentId = process.env.ADMIN_E2E_SECOND_AGENT_ID;

test.skip(
  !email || !password || !agentId,
  'Set ADMIN_E2E_EMAIL, ADMIN_E2E_PASSWORD and ADMIN_E2E_AGENT_ID',
);

async function login(page: Page) {
  await page.goto('/login');
  await page.getByLabel(/email/i).fill(email!);
  await page.getByLabel(/mật khẩu|password/i).fill(password!);
  await page.getByRole('button', { name: /đăng nhập/i }).click();
  await expect(page).not.toHaveURL(/\/login/);
}

async function expectNoBrokenValues(page: Page) {
  await expect(page.locator('body')).not.toContainText(/\bundefined\b|NaN\s*₫|Invalid Date/i);
}

test.beforeEach(async ({ page }) => {
  await login(page);
});

test('isolates payload, loading and error while tabs are clicked quickly', async ({ page }) => {
  await page.route('**/admin/agent-center/agents/*/pricing', async (route) => {
    await new Promise((resolve) => setTimeout(resolve, 900));
    await route.continue();
  });
  await page.route('**/admin/agent-center/agents/*/api', async (route) => {
    await new Promise((resolve) => setTimeout(resolve, 150));
    await route.continue();
  });

  await page.goto(`/agents/${agentId}`);
  await page.getByRole('tab', { name: 'Bảng giá', exact: true }).click();
  await page.getByRole('tab', { name: 'API', exact: true }).click();
  await expect(page.getByText('IP whitelist')).toBeVisible();
  await page.getByRole('tab', { name: 'Bảng giá', exact: true }).click();

  await expect(page.getByRole('columnheader', { name: 'Giá bán đại lý' })).toBeVisible();
  await expect(page.getByText('IP whitelist')).not.toBeVisible();
  await expectNoBrokenValues(page);
});

test('all visible agent tabs render without invalid values', async ({ page }) => {
  await page.goto(`/agents/${agentId}`);

  const tabs = [
    'Tổng quan',
    'Thông tin',
    'Số dư',
    'API',
    'Webhook',
    'Thành viên',
    'Vai trò',
    'Đơn hàng',
    'Hoạt động',
    'Lịch sử đăng nhập',
    'Bảng giá',
    'Sao kê',
    'Hóa đơn',
  ];

  for (const label of tabs) {
    const tab = page.getByRole('tab', { name: label, exact: true });
    if (await tab.isVisible().catch(() => false)) {
      await tab.click();
      await expect(page).toHaveURL(new RegExp('tab='));
      await expectNoBrokenValues(page);
    }
  }
});

test('does not retain the previous agent state on dynamic route navigation', async ({ page }) => {
  test.skip(!secondAgentId, 'Set ADMIN_E2E_SECOND_AGENT_ID for cross-agent isolation');

  await page.goto(`/agents/${agentId}?tab=pricing`);
  await expect(page.getByText(agentId!.replace(/-/g, '').slice(0, 8).toUpperCase())).toBeVisible();
  await page.goto(`/agents/${secondAgentId}?tab=pricing`);

  const secondCode = secondAgentId!.replace(/-/g, '').slice(0, 8).toUpperCase();
  await expect(page.getByText(secondCode)).toBeVisible();
  await expect(page.getByText(agentId!.replace(/-/g, '').slice(0, 8).toUpperCase())).not.toBeVisible();
  await expectNoBrokenValues(page);
});
