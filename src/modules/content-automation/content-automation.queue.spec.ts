import { QUEUE_NAMES } from '../../queue/queue.constants';

describe('content automation queue registration', () => {
  it('registers content_automation_queue without altering existing queue names', () => {
    expect(QUEUE_NAMES).toContain('content_automation_queue');
    expect(QUEUE_NAMES).toContain('notification_queue');
    expect(QUEUE_NAMES).toContain('payment_queue');
    expect(QUEUE_NAMES.indexOf('content_automation_queue')).toBe(QUEUE_NAMES.length - 1);
  });
});
