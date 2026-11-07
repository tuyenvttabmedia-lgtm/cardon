import { readFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';

const adminRoot = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const catalogPage = readFileSync(resolve(adminRoot, 'app/products/esim/page.tsx'), 'utf8');
const adminTestDialog = readFileSync(resolve(adminRoot, 'components/esim/AdminTestOrderDialog.tsx'), 'utf8');
const adminTestCheckout = readFileSync(resolve(adminRoot, 'lib/esim-admin-test-checkout.ts'), 'utf8');
const opsDetail = readFileSync(resolve(adminRoot, 'app/esim-ops/[id]/page.tsx'), 'utf8');
const orderDetail = readFileSync(resolve(adminRoot, 'app/orders/[id]/page.tsx'), 'utf8');
const opsList = readFileSync(resolve(adminRoot, 'app/esim-ops/page.tsx'), 'utf8');
const apiClient = readFileSync(resolve(adminRoot, 'services/api-client.ts'), 'utf8');
const permissions = readFileSync(resolve(adminRoot, 'lib/permissions.ts'), 'utf8');
const catalogFilter = readFileSync(resolve(adminRoot, 'types/esim-catalog-filter.test.ts'), 'utf8');

describe('catalog test-order UI', () => {
  it('is SUPER_ADMIN + orders.manage only and uses admin create wrapper', () => {
    expect(catalogPage).toContain('canUseAdminTest(user?.role, can)');
    expect(adminTestCheckout).toContain("role === 'SUPER_ADMIN' && can('orders.manage')");
    expect(catalogPage).toContain('AdminTestOrderDialog');
    expect(catalogPage).toContain('settingsAdminApi.getAiraloCatalogue');
    expect(adminTestCheckout).toContain("paymentMethodCode: 'VIETQR'");
    expect(adminTestCheckout).toContain("market: 'VN'");
    expect(adminTestDialog).toContain('inflight.current');
    expect(catalogPage).toContain('setPendingTestVariant');
    expect(adminTestDialog).not.toMatch(/createEsimTestOrder[\s\S]{0,200}\/orders['"]/);
    expect(catalogPage).not.toContain("'/orders'");
    expect(catalogPage).not.toContain('localStorage');
    expect(catalogPage).not.toContain('sessionStorage');
    expect(catalogPage).not.toContain('console.log');
    expect(adminTestDialog).not.toContain('clientSecret');
    expect(adminTestDialog).not.toContain('client_id');
    expect(adminTestDialog).not.toContain('webhook');
    expect(adminTestDialog).not.toContain('paypal.com/checkout');
  });

  it('does not retry create on timeout and reconciles before another order', () => {
    const handler = adminTestDialog.slice(
      adminTestDialog.indexOf('async function submit'),
      adminTestDialog.indexOf('const statusLine'),
    );
    expect(handler).toContain('inflight.current = true');
    expect(handler).toContain('lookupWaitingOrder');
    expect(handler).not.toContain('for (');
    expect(handler).not.toContain('while (');
    expect(handler).not.toContain('.retry');
    expect(handler).toContain('không tạo đơn mới');
  });
});

describe('ops checkout UI', () => {
  it('creates payment only after confirm, never on mount, and only Sandbox form', () => {
    expect(opsDetail).toContain('createSepayCheckout');
    expect(opsDetail).toContain('setConfirmPay(true)');
    expect(opsDetail).toContain('sandboxCheckoutForm');
    expect(opsDetail).toContain('sepaySandboxCheckoutAction');
    expect(opsDetail).not.toMatch(/useEffect\([\s\S]{0,400}createSandboxPayment/);
    expect(opsDetail).not.toContain('localStorage');
    expect(opsDetail).not.toContain('sessionStorage');
    expect(opsDetail).not.toContain('console.log');
    expect(opsDetail).not.toContain('/payments/orders');
    expect(opsDetail).not.toContain('markPaid');
    expect(opsDetail).not.toContain('syncPayment');
  });

  it('locks double-click and does not retry POST /payments', () => {
    const handler = opsDetail.slice(
      opsDetail.indexOf('async function createSandboxPayment'),
      opsDetail.indexOf('return ('),
    );
    expect(handler).toContain('creatingPayRef.current');
    expect(handler).toContain('if (!detail || creatingPayRef.current || !allowTestPayment) return');
    expect(handler).not.toContain('for (');
    expect(handler).not.toContain('while (');
    expect(handler).toContain('Không bấm tạo lại ngay');
  });

  it('resets reveal state and ignores stale load when the ops order id changes', () => {
    expect(opsDetail).toContain('revealStateForOrder(boundOrderId, params.id, revealed, null)');
    expect(opsDetail).toContain("invalidate('ops-detail')");
    expect(opsDetail).toContain('if (!loadRequestsRef.current.isLatest(token)) return');
    expect(opsDetail).toContain('aligned.value');
    expect(opsDetail).not.toContain('localStorage');
    expect(opsDetail).not.toContain('sessionStorage');
  });

  it('reveals LPA through the same admin POST on both detail UIs', () => {
    expect(apiClient).toContain("apiRequest<EsimInstallReveal>(`/admin/esim-ops/orders/${id}/reveal`");
    expect(opsDetail).toContain('revealEsimInstallSecret');
    expect(opsDetail).toContain('revealStateForOrder');
    expect(opsDetail).toContain('LatestRequestTracker');
    expect(opsDetail).toContain("invalidate('ops-detail')");
    expect(opsDetail).toContain('isLatest(token)');
    expect(orderDetail).toContain('revealEsimInstallSecret');
    expect(opsDetail).not.toContain('localStorage');
    expect(opsDetail).not.toContain('sessionStorage');
    expect(opsDetail).not.toContain('console.log');
  });

  it('admin recover is read-only and does not offer a CREATE button', () => {
    expect(opsDetail).toContain('recoverEsimOrder');
    expect(opsDetail).toContain('Đọc lại đơn nhà cung cấp');
    expect(opsDetail).toContain('Chỉ đọc — không tạo eSIM mới');
    expect(opsDetail).not.toContain('Gọi Airalo tạo eSIM');
  });

  it('does not treat EMAIL_SENT as delivered and does not show LPA on the list', () => {
    expect(opsDetail).toContain('Xác nhận thanh toán dựa trên đồng bộ cổng hoặc webhook');
    expect(opsList).not.toContain('installSecret');
    expect(opsList).not.toContain('LPA:1');
  });

  it('ops dashboard uses live aggregates, splits sandbox, and does not invent profit', () => {
    expect(apiClient).toContain('getEsimOpsDashboard');
    expect(apiClient).toContain('/admin/esim-ops/dashboard');
    expect(opsList).toContain('getEsimOpsDashboard');
    expect(opsList).toContain('Doanh thu thương mại (payment SUCCESS)');
    expect(opsList).toContain('Đã thu, chưa cấp eSIM');
    expect(opsList).toContain('Quản lý đơn hàng, thanh toán và quá trình cung cấp eSIM.');
    expect(opsList).toContain('EsimOpsShell');
    expect(opsList).not.toContain('fakeRevenue');
    expect(opsList).not.toContain('LPA:1$');
    expect(opsDetail).toContain('Lịch sử thao tác quản trị');
    expect(opsDetail).toContain('Đã thu tiền nhưng chưa cấp được eSIM');
  });
});

describe('authorization was not loosened', () => {
  it('keeps SUPER_ADMIN short-circuit and does not grant orders.manage to everyone', () => {
    expect(permissions).toContain("if (role === 'SUPER_ADMIN') return true");
    expect(permissions).not.toContain("canCreateTestOrder = true");
  });

  it('catalog filter still isolates eSIM from GAME_CARD / PHONE_CARD / TOPUP / DATA', () => {
    expect(catalogFilter).toContain('GAME_CARD');
    expect(catalogFilter).toContain('PHONE_CARD');
    expect(catalogFilter).toContain('TOPUP');
    expect(catalogFilter).toContain('DATA');
    expect(catalogFilter).toContain('filterStandardCatalogProducts');
  });
});
