import { evaluateEsimSale, esimSaleFlagsFromRuntime } from './esim-policy';

describe('evaluateEsimSale', () => {
  it('opens live sales only when env, settings, and liveArm are all true', () => {
    expect(
      evaluateEsimSale({
        envEnabled: true,
        settingsEnabled: true,
        providerMode: 'live',
        liveArm: true,
      }),
    ).toEqual({ ok: true, mode: 'live' });
  });

  it('stays closed when the settings flag is off even if env and arm are on', () => {
    expect(
      evaluateEsimSale({
        envEnabled: true,
        settingsEnabled: false,
        providerMode: 'live',
        liveArm: true,
      }),
    ).toEqual({ ok: false, reason: 'SALES_DISABLED' });
  });

  it('stays closed when ESIM_ENABLED is off even if settings are on', () => {
    expect(
      evaluateEsimSale({
        envEnabled: false,
        settingsEnabled: true,
        providerMode: 'live',
        liveArm: true,
      }),
    ).toEqual({ ok: false, reason: 'SALES_DISABLED' });
  });

  it('rejects live HTTP when the arm is down', () => {
    expect(
      evaluateEsimSale({
        envEnabled: true,
        settingsEnabled: true,
        providerMode: 'live',
        liveArm: false,
      }),
    ).toEqual({ ok: false, reason: 'LIVE_HTTP_DISABLED' });
  });

  it('maps runtime getters with a strict true check', () => {
    const flags = esimSaleFlagsFromRuntime(
      (key) =>
        ({
          'esim.enabled': true,
          'esim.providerMode': 'live',
          'esim.liveArm': true,
        })[key],
      true,
    );
    expect(flags).toEqual({
      envEnabled: true,
      settingsEnabled: true,
      providerMode: 'live',
      liveArm: true,
    });
    expect(esimSaleFlagsFromRuntime(() => 'true', true).envEnabled).toBe(false);
  });
});
