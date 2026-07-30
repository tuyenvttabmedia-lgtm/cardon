import { describe, expect, it } from 'vitest';
import { LatestRequestTracker } from './latest-request';

describe('LatestRequestTracker', () => {
  it('rejects an older response for the same tab', () => {
    const tracker = new LatestRequestTracker<string>();
    const first = tracker.begin('pricing');
    const second = tracker.begin('pricing');

    expect(tracker.isLatest(first)).toBe(false);
    expect(tracker.isLatest(second)).toBe(true);
  });

  it('keeps concurrent tab requests isolated', () => {
    const tracker = new LatestRequestTracker<string>();
    const api = tracker.begin('api');
    const pricing = tracker.begin('pricing');

    expect(tracker.isLatest(api)).toBe(true);
    expect(tracker.isLatest(pricing)).toBe(true);
  });

  it('invalidates in-flight responses after refresh or agent change', () => {
    const tracker = new LatestRequestTracker<string>();
    const request = tracker.begin('orders');

    tracker.invalidateAll();

    expect(tracker.isLatest(request)).toBe(false);
  });

  it('invalidates only the selected detail request', () => {
    const tracker = new LatestRequestTracker<string>();
    const detail = tracker.begin('detail');
    const list = tracker.begin('list');

    tracker.invalidate('detail');

    expect(tracker.isLatest(detail)).toBe(false);
    expect(tracker.isLatest(list)).toBe(true);
  });
});
