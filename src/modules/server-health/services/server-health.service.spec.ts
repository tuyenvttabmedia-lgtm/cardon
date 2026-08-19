import { ServerHealthService } from './server-health.service';

describe('ServerHealthService overall status', () => {
  it('marks DOWN when database is error', async () => {
    const service = new ServerHealthService(
      { $queryRaw: jest.fn().mockRejectedValue(new Error('db down')) } as never,
      {
        get: (key: string) => {
          if (key === 'redis.url') return undefined;
          if (key === 'app.workerHeartbeatRequired') return false;
          if (key === 'app.buildVersion') return 'test';
          return undefined;
        },
      } as never,
      { listQueues: jest.fn() } as never,
    );

    const pack = await service.getPack();
    expect(pack.overall).toBe('DOWN');
    expect(pack.ready).toBe(false);
    expect(pack.database.status).toBe('error');
    expect(pack.process.heapUsedMb).toBeGreaterThanOrEqual(0);
  });
});
