import { ContentAutomationConfigService } from './content-automation-config.service';

describe('ContentAutomationConfigService', () => {
  const original = process.env.CONTENT_AUTOMATION_ENABLED;

  afterEach(() => {
    if (original === undefined) {
      delete process.env.CONTENT_AUTOMATION_ENABLED;
    } else {
      process.env.CONTENT_AUTOMATION_ENABLED = original;
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

  it('exposes frozen queue name', () => {
    const service = new ContentAutomationConfigService();
    expect(service.getQueueName()).toBe('content_automation_queue');
  });
});
