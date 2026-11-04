/** Airalo Partner `code`, e.g. `20241018-124189`. Not the numeric `id`. */
export const DATED_AIRALO_CODE = /^(\d{8})-(\d+)$/;
export const NUMERIC_AIRALO_ID = /^\d+$/;

export function toAiraloOrderCode(reference: string, createdAt?: Date): string {
  const ref = reference.trim();
  if (DATED_AIRALO_CODE.test(ref) || !NUMERIC_AIRALO_ID.test(ref) || !createdAt) {
    return ref;
  }
  return `${utcYmd(createdAt)}-${ref}`;
}

export function isNumericAiraloId(value: string): boolean {
  return NUMERIC_AIRALO_ID.test(value.trim());
}

export function isDatedAiraloCode(value: string): boolean {
  return DATED_AIRALO_CODE.test(value.trim());
}

/** Numeric Partner id. Dated `YYYYMMDD-id` yields the id suffix. */
export function airaloNumericId(value: string): string | undefined {
  const ref = value.trim();
  if (NUMERIC_AIRALO_ID.test(ref)) return ref;
  const dated = DATED_AIRALO_CODE.exec(ref);
  return dated?.[2];
}

/** Dated Partner code only. Does not invent a code from a bare numeric id. */
export function airaloOrderCode(value: string): string | undefined {
  const ref = value.trim();
  return DATED_AIRALO_CODE.test(ref) ? ref : undefined;
}

/**
 * GET paths confirmed by Airalo Partner support 2026-10-26:
 * numeric id on GET /v2/orders/{order_id}; dated code only via list filter[code].
 * GET 422 is a malformed GET, not proof CREATE never happened.
 */
export function airaloGetPaths(reference: string): string[] {
  const ref = reference.trim();
  if (!ref) return [];
  if (isNumericAiraloId(ref)) {
    const id = encodeURIComponent(ref);
    return [`/v2/orders/${id}?include=sims`, `/v2/orders/${id}`];
  }
  return [`/v2/orders?filter[code]=${encodeURIComponent(ref)}&include=sims`];
}

function utcYmd(value: Date): string {
  return value.toISOString().slice(0, 10).replace(/-/g, '');
}
