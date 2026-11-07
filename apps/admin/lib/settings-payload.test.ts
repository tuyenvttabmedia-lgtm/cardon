import { describe, expect, it } from 'vitest';
import { stripSettingsReadonly } from './settings-payload';

describe('stripSettingsReadonly', () => {
  it('drops MegaPay GET-only readiness flags before PUT', () => {
    const body = stripSettingsReadonly({
      merchantId: 'CARDON0001',
      pgEncodeKey: 'new-key',
      source: 'database',
      configured: true,
      depositCodeReady: true,
      pgLayerReady: true,
      pgRefundReady: false,
    });
    expect(body).toEqual({
      merchantId: 'CARDON0001',
      pgEncodeKey: 'new-key',
    });
  });
});
