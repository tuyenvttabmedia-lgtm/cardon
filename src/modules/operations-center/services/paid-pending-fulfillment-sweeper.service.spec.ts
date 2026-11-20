import { PaidPendingFulfillmentSweeperService } from './paid-pending-fulfillment-sweeper.service';

describe('PaidPendingFulfillmentSweeperService', () => {
  function build(overrides?: {
    enabled?: boolean;
    orders?: Array<{ id: string; orderCode: string }>;
    dispatch?: jest.Mock;
  }) {
    const config = {
      get: jest.fn((key: string) => {
        if (key === 'fulfillmentSweeper.enabled') {
          return overrides?.enabled ?? false;
        }
        if (key === 'fulfillmentSweeper.graceMs') return 120_000;
        if (key === 'fulfillmentSweeper.batchSize') return 20;
        return undefined;
      }),
    };
    const repository = {
      findPaidPendingForSweep: jest
        .fn()
        .mockResolvedValue(overrides?.orders ?? []),
    };
    const fulfillmentDispatch = {
      dispatchOrderFulfillment:
        overrides?.dispatch ?? jest.fn().mockResolvedValue(['job-1']),
    };
    const service = new PaidPendingFulfillmentSweeperService(
      config as never,
      repository as never,
      fulfillmentDispatch as never,
    );
    return { service, repository, fulfillmentDispatch };
  }

  it('no-ops when flag is off', async () => {
    const { service, repository, fulfillmentDispatch } = build({
      enabled: false,
    });
    const result = await service.sweep();
    expect(result.enabled).toBe(false);
    expect(repository.findPaidPendingForSweep).not.toHaveBeenCalled();
    expect(fulfillmentDispatch.dispatchOrderFulfillment).not.toHaveBeenCalled();
  });

  it('dispatches PENDING paid orders via fulfillment dispatch when enabled', async () => {
    const dispatch = jest.fn().mockResolvedValue(['fulfill-1']);
    const { service, fulfillmentDispatch } = build({
      enabled: true,
      orders: [{ id: 'o1', orderCode: 'ORD-1' }],
      dispatch,
    });
    const result = await service.sweep();
    expect(result).toMatchObject({
      enabled: true,
      scanned: 1,
      dispatched: 1,
      skipped: 0,
      failed: 0,
    });
    expect(fulfillmentDispatch.dispatchOrderFulfillment).toHaveBeenCalledWith(
      'o1',
      'sweeper',
    );
  });

  it('counts skip when dispatch returns no jobs', async () => {
    const { service } = build({
      enabled: true,
      orders: [{ id: 'o2', orderCode: 'ORD-2' }],
      dispatch: jest.fn().mockResolvedValue([]),
    });
    const result = await service.sweep();
    expect(result.skipped).toBe(1);
    expect(result.dispatched).toBe(0);
  });
});
