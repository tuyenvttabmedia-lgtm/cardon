/** Default per-transaction agent deposit limits (VND) — overridable in Admin → Hệ thống. */
export const MIN_DEPOSIT_AMOUNT = 5_000_000;
export const MAX_DEPOSIT_AMOUNT = 300_000_000;

/** Absolute DTO bounds (Admin cannot go outside this range). */
export const ABSOLUTE_MIN_DEPOSIT_AMOUNT = 10_000;
export const ABSOLUTE_MAX_DEPOSIT_AMOUNT = 500_000_000;
