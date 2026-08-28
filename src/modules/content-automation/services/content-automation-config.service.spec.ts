import { ContentAutomationConfigService } from './content-automation-config.service';

describe('ContentAutomationConfigService', () => {
  const originalEnabled = process.env.CONTENT_AUTOMATION_ENABLED;
  const originalHeuristic = process.env.CONTENT_AUTOMATION_ALLOW_HEURISTIC_FALLBACK;

  afterEach(() => {
    if (originalEnabled === undefined) {
      delete process.env.CONTENT_AUTOMATION_ENABLED;
    } else {
      process.env.CONTENT_AUTOMATION_ENABLED = originalEnabled;
    }
    if (originalHeuristic === undefined) {
      delete process.env.CONTENT_AUTOMATION_ALLOW_HEURISTIC_FALLBACK;
    } else {
      process.env.CONTENT_AUTOMATION_ALLOW_HEURISTIC_FALLBACK = originalHeuristic;
    }
  });

  it('is disabled by default', () => {
    delete process.env.CONTENT_AUTOMATION_ENABLED;
    const service = new ContentAutomationConfigService();
    expect(service.isEnabled()).toBe(false);
  });

  it('is enabled only when env is true', () => {
    process.env.CONTENT_AUTOMATION_ENABLED = 'true';
    const service = new ContentAutomationConfigService();
    expect(service.isEnabled()).toBe(true);
  });

  it('disallows heuristic fallback by default', () => {
    delete process.env.CONTENT_AUTOMATION_ALLOW_HEURISTIC_FALLBACK;
    const service = new ContentAutomationConfigService();
    expect(service.isHeuristicFallbackAllowed()).toBe(false);
  });

  it('allows heuristic fallback only when env is true', () => {
    process.env.CONTENT_AUTOMATION_ALLOW_HEURISTIC_FALLBACK = 'true';
    const service = new ContentAutomationConfigService();
    expect(service.isHeuristicFallbackAllowed()).toBe(true);
  });

  it('exposes frozen queue name', () => {
    const service = new ContentAutomationConfigService();
    expect(service.getQueueName()).toBe('content_automation_queue');
  });
});
