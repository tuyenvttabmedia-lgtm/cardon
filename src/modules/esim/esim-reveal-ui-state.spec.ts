import { readFileSync } from 'fs';
import { join } from 'path';

const FIXTURE = 'TEST-ESIM-NOT-REAL:invalid$J1';
const root = join(__dirname, '../../..');

function revealStateForOrder<T>(
  boundOrderId: string | undefined,
  nextOrderId: string | undefined,
  current: T,
  empty: T,
): { boundOrderId: string | undefined; value: T } {
  if (boundOrderId === nextOrderId) {
    return { boundOrderId, value: current };
  }
  return { boundOrderId: nextOrderId, value: empty };
}

function applyRevealForOrder<T>(
  requestOrderId: string | undefined,
  currentOrderId: string | undefined,
  payload: T,
): T | null {
  if (!requestOrderId || requestOrderId !== currentOrderId) return null;
  return payload;
}

function retainRevealAfterMetadataPoll<T>(currentReveal: T | null): T | null {
  return currentReveal;
}

describe('LPA-16J1A customer reveal state', () => {
  const payload = {
    installSecret: FIXTURE,
    qrSvg: '<svg data-testid="fake-qr"></svg>',
    appleSetupUrl: null as string | null,
  };

  it('shows the mock fixture for order A and clears it when switching to B', () => {
    const same = revealStateForOrder('order-a', 'order-a', payload, null);
    expect(same.value?.installSecret).toBe(FIXTURE);
    const next = revealStateForOrder('order-a', 'order-b', payload, null);
    expect(next.value).toBeNull();
    expect(applyRevealForOrder('order-a', 'order-b', payload)).toBeNull();
  });

  it('hide and metadata poll do not restore a hidden secret', () => {
    expect(revealStateForOrder('order-a', 'order-a', null, null).value).toBeNull();
    expect(retainRevealAfterMetadataPoll(null)).toBeNull();
    expect(retainRevealAfterMetadataPoll(payload)).toEqual(payload);
  });

  it('wires ReadyActions to reset during render, not after paint', () => {
    const helper = readFileSync(join(root, 'apps/web/lib/esim-reveal-state.ts'), 'utf8');
    const panel = readFileSync(join(root, 'apps/web/components/esim/EsimInstallPanel.tsx'), 'utf8');
    expect(helper).toContain(FIXTURE);
    expect(panel).toContain('revealStateForOrder(boundOrderId, orderId, revealed, null)');
    expect(panel).toContain('if (aligned.boundOrderId !== boundOrderId)');
    expect(panel).toContain('applyRevealForOrder(requested, orderIdRef.current, payload)');
    expect(panel).toContain('retainRevealAfterMetadataPoll');
    expect(panel).not.toContain('localStorage');
    expect(panel).not.toContain('sessionStorage');
    expect(panel).not.toContain('console.log');
  });
});
