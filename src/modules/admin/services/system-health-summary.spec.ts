import { SystemHealthService } from './system-health.service';

describe('SystemHealthService.getSummary (C1 unscanned state)', () => {
  function buildService(lastReport: unknown = null) {
    const service = Object.create(SystemHealthService.prototype) as any;
    service.lastReport = lastReport;
    service.scanState = { running: false, startedAt: null, completedAt: null };
    service.systemVersion = {
      collect: jest.fn().mockResolvedValue({
        api: '1.0.0',
        worker: '1.0.0',
        versionMismatch: false,
      }),
    };
    service.maintenanceAvailability = {
      applyScheduledTransitions: jest.fn(),
      getPublicStatus: jest.fn().mockReturnValue({ enabled: false }),
    };
    return service as SystemHealthService;
  }

  it('does not invent 100% / Production Ready when never scanned', async () => {
    const service = buildService(null);
    const summary = await service.getSummary();
    expect(summary.scanAvailable).toBe(false);
    expect(summary.healthScore).toBeNull();
    expect(summary.productionLabel).toBeNull();
    expect(summary.status).toBeNull();
    expect(summary.runAt).toBeNull();
    expect(summary.categoryIntegrity.label).toBe('Chưa quét');
  });

  it('returns real score after a scan report exists', async () => {
    const service = buildService({
      runAt: '2026-03-15T01:00:00.000Z',
      healthScore: 92,
      productionLabel: 'Production Ready',
      status: 'ok',
      summary: { ok: 10, warning: 1, error: 0 },
      domains: [{ domain: 'category_integrity', status: 'ok' }],
    });
    const summary = await service.getSummary();
    expect(summary.scanAvailable).toBe(true);
    expect(summary.healthScore).toBe(92);
    expect(summary.productionLabel).toBe('Production Ready');
    expect(summary.categoryIntegrity.label).toBe('Healthy');
  });
});
