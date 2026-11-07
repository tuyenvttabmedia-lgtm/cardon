export const ESIM_REVEAL_TEST_FIXTURE = 'TEST-ESIM-NOT-REAL:invalid$J1';

export type EsimRevealPayload = {
  installSecret: string | null;
  qrSvg: string | null;
  appleSetupUrl: string | null;
};

/** Drop reveal state when the bound order is no longer the one on screen. */
export function revealStateForOrder<T>(
  boundOrderId: string | undefined,
  nextOrderId: string | undefined,
  current: T,
  empty: T,
): { boundOrderId: string | undefined; value: T } {
  if (boundOrderId === nextOrderId) {
    return { boundOrderId, value: current };
  }
  return { boundOrderId: nextOrderId, value: empty };
}

/** Ignore a reveal response that no longer matches the visible order. */
export function applyRevealForOrder<T>(
  requestOrderId: string | undefined,
  currentOrderId: string | undefined,
  payload: T,
): T | null {
  if (!requestOrderId || requestOrderId !== currentOrderId) return null;
  return payload;
}

/** GET metadata must never restore a hidden or empty reveal. */
export function retainRevealAfterMetadataPoll<T>(
  currentReveal: T | null,
  _polledSecrets?: unknown,
): T | null {
  return currentReveal;
}
