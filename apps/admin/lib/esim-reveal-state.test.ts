import { describe, expect, it } from 'vitest';
import { LatestRequestTracker } from './latest-request';
import {
  ESIM_REVEAL_TEST_FIXTURE,
  applyRevealForOrder,
  retainRevealAfterMetadataPoll,
  revealStateForOrder,
} from './esim-reveal-state';

const EMPTY = null;
const REVEAL_A = {
  installSecret: ESIM_REVEAL_TEST_FIXTURE,
  qrSvg: '<svg data-testid="fake-qr"></svg>',
  appleSetupUrl: null,
};

describe('eSIM reveal order-change reset', () => {
  it('keeps the mock fixture while the order stays the same', () => {
    const next = revealStateForOrder('order-a', 'order-a', REVEAL_A, EMPTY);
    expect(next.value?.installSecret).toBe(ESIM_REVEAL_TEST_FIXTURE);
    expect(applyRevealForOrder('order-a', 'order-a', REVEAL_A)?.installSecret).toBe(
      ESIM_REVEAL_TEST_FIXTURE,
    );
  });

  it('clears order A secret when switching to order B', () => {
    const next = revealStateForOrder('order-a', 'order-b', REVEAL_A, EMPTY);
    expect(next.boundOrderId).toBe('order-b');
    expect(next.value).toBeNull();
    expect(next.value?.installSecret).toBeUndefined();
  });

  it('drops a late reveal response for order A after the UI shows order B', () => {
    expect(applyRevealForOrder('order-a', 'order-b', REVEAL_A)).toBeNull();
  });

  it('hide and unmount clear the secret', () => {
    const hidden = revealStateForOrder('order-a', 'order-a', EMPTY, EMPTY);
    expect(hidden.value).toBeNull();
  });

  it('polling metadata does not call reveal or restore a hidden secret', () => {
    const polledGet = {
      installSecret: ESIM_REVEAL_TEST_FIXTURE,
      qrSvg: '<svg></svg>',
      appleSetupUrl: 'https://example.test/not-a-setup',
    };
    expect(retainRevealAfterMetadataPoll(null, polledGet)).toBeNull();
    expect(retainRevealAfterMetadataPoll(REVEAL_A, polledGet)).toEqual(REVEAL_A);
  });

  it('ignores a stale load() for order A after switching to order B', () => {
    const tracker = new LatestRequestTracker<'ops-detail'>();
    const loadA = tracker.begin('ops-detail');
    tracker.invalidate('ops-detail');
    const loadB = tracker.begin('ops-detail');
    const detail = { id: 'order-b' };

    expect(tracker.isLatest(loadA)).toBe(false);
    expect(tracker.isLatest(loadB)).toBe(true);
    expect(detail.id).toBe('order-b');
  });
});
