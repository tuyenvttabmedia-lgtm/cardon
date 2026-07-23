/** Read-only fields returned by GET /admin/settings/* — must not be sent on PUT. */
const SETTINGS_READONLY_KEYS = [
  'source',
  'configured',
  'runtimeHint',
  'effectiveCheckoutHost',
] as const;

export function stripSettingsReadonly<T extends Record<string, unknown>>(body: T): Partial<T> {
  const out = { ...body };
  for (const key of SETTINGS_READONLY_KEYS) {
    delete out[key];
  }
  return out;
}
