export type EsimRuntimeMode = 'mock' | 'live';

export interface EsimFlagInput {
  envEnabled: boolean;
  settingsEnabled: boolean;
  providerMode: EsimRuntimeMode;
  liveArm: boolean;
}

/**
 * New eSIM sales require both the env gate and the settings flag.
 * Live quotes also require the arm flag. Mock sales ignore that flag.
 * Login is not a sales gate: guests still see salesOpen; create() separately requires JWT.
 */
export function evaluateEsimSale(input: EsimFlagInput):
  | { ok: true; mode: 'mock' | 'live' }
  | { ok: false; reason: 'SALES_DISABLED' | 'LIVE_HTTP_DISABLED' } {
  if (input.envEnabled !== true || input.settingsEnabled !== true) {
    return { ok: false, reason: 'SALES_DISABLED' };
  }
  if (input.providerMode === 'live') {
    if (input.liveArm !== true) {
      return { ok: false, reason: 'LIVE_HTTP_DISABLED' };
    }
    return { ok: true, mode: 'live' };
  }
  return { ok: true, mode: 'mock' };
}

export function readEsimRuntimeMode(raw: string | undefined): EsimRuntimeMode {
  return raw === 'live' ? 'live' : 'mock';
}

export function esimSaleFlagsFromRuntime(
  get: (key: string) => unknown,
  customerEsimEnabled: boolean,
): EsimFlagInput {
  return {
    envEnabled: get('esim.enabled') === true,
    settingsEnabled: customerEsimEnabled === true,
    providerMode: readEsimRuntimeMode(typeof get('esim.providerMode') === 'string' ? String(get('esim.providerMode')) : undefined),
    liveArm: get('esim.liveArm') === true,
  };
}
