const SENSITIVE_GATEWAY_KEY =
  /secret|token|key|signature|password|credential|auth/i;

export const GATEWAY_MASKED_VALUE = '********';

export function sanitizeGatewayPayload(payload: unknown): unknown {
  if (payload === null || payload === undefined) {
    return payload;
  }
  if (Array.isArray(payload)) {
    return payload.map(sanitizeGatewayPayload);
  }
  if (typeof payload === 'object') {
    const out: Record<string, unknown> = {};
    for (const [key, value] of Object.entries(payload as Record<string, unknown>)) {
      out[key] = SENSITIVE_GATEWAY_KEY.test(key)
        ? GATEWAY_MASKED_VALUE
        : sanitizeGatewayPayload(value);
    }
    return out;
  }
  return payload;
}
