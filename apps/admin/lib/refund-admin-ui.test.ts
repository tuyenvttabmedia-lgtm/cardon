import { readFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';

const adminRoot = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const listPage = readFileSync(resolve(adminRoot, 'app/refunds/page.tsx'), 'utf8');
const detailPage = readFileSync(resolve(adminRoot, 'app/refunds/[id]/page.tsx'), 'utf8');
const apiClient = readFileSync(resolve(adminRoot, 'services/api-client.ts'), 'utf8');
const permissions = readFileSync(resolve(adminRoot, 'lib/permissions.ts'), 'utf8');
const actions = readFileSync(resolve(adminRoot, 'lib/refund-admin-actions.ts'), 'utf8');

describe('REFUND-04D admin UI', () => {
  it('gates list/detail on existing refund permissions', () => {
    expect(listPage).toContain('RequireAnyPermission');
    expect(listPage).toContain('REFUND_READ_PERMISSIONS');
    expect(detailPage).toContain('RequireAnyPermission');
    expect(permissions).toContain("href: '/refunds'");
    expect(permissions).toContain("'refund.request'");
    expect(permissions).not.toContain('refund.read');
  });

  it('keeps server pagination and filters together', () => {
    expect(listPage).toContain('listRefundRequests');
    expect(listPage).toContain('setApplied(draft)');
    expect(listPage).toContain('setSkip(skip + PAGE_SIZE)');
    expect(listPage).toContain('needsAction');
  });

  it('shows actions by permission and confirm dialogs', () => {
    expect(detailPage).toContain('visibleRefundActions');
    expect(detailPage).toContain('Dialog');
    expect(detailPage).toContain('vi.refunds.executeHint');
    expect(detailPage).toContain('vi.refunds.completeHint');
    expect(detailPage).toContain('vi.refunds.unconfirmHint');
    expect(detailPage).toContain('validateCompleteRefundForm');
    expect(actions).toContain("can('refund.execute')");
    expect(actions).toContain("can('refund.reconcile')");
  });

  it('distinguishes payout recorded from recon verified', () => {
    expect(listPage).toContain('payoutNotReconciled');
    expect(detailPage).toContain('payoutNotReconciled');
    expect(detailPage).toContain('attempt.reconVerified');
  });

  it('does not call providers or expose secrets in the client', () => {
    const refundClient = apiClient.slice(
      apiClient.indexOf('listRefundRequests'),
      apiClient.indexOf('reconcileRefundAttempt') + 400,
    );
    expect(refundClient).toContain('/admin/refund-requests');
    expect(refundClient).not.toMatch(/airalo|paypal|sepay\.vn/i);
    expect(listPage).not.toContain('gatewayResponse');
    expect(detailPage).not.toContain('safeRequestMeta');
    expect(detailPage).not.toContain('evidence');
    expect(detailPage).toContain('destinationHint');
  });
});
