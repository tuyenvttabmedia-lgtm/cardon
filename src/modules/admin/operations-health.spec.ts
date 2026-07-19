import { productionReadinessLabel } from './entities/operations-health.types';

describe('Phase 6O31.2 — Operations health', () => {
  it('labels production ready at 90+ with no errors', () => {
    expect(productionReadinessLabel(97, 0)).toBe('Production Ready');
    expect(productionReadinessLabel(90, 0)).toBe('Production Ready');
  });

  it('labels needs attention when errors exist', () => {
    expect(productionReadinessLabel(97, 1)).toBe('Needs Attention');
  });

  it('labels degraded between 70 and 89', () => {
    expect(productionReadinessLabel(80, 0)).toBe('Degraded');
  });
});
