const DEFAULT_TTL_MS = 900_000;

function parsePositiveInt(value: string | undefined, fallback: number): number {
  if (!value) return fallback;
  const parsed = parseInt(value, 10);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : fallback;
}

/** Production default: 5 attempts / 15 min — override via AUTH_LOGIN_THROTTLE_LIMIT for local/staging. */
export const AUTH_LOGIN_THROTTLE = {
  limit: parsePositiveInt(process.env.AUTH_LOGIN_THROTTLE_LIMIT, 5),
  ttl: parsePositiveInt(process.env.AUTH_LOGIN_THROTTLE_TTL_MS, DEFAULT_TTL_MS),
};

export const AUTH_REFRESH_THROTTLE = {
  limit: parsePositiveInt(process.env.AUTH_REFRESH_THROTTLE_LIMIT, 20),
  ttl: parsePositiveInt(process.env.AUTH_REFRESH_THROTTLE_TTL_MS, DEFAULT_TTL_MS),
};

export const AUTH_FORGOT_PASSWORD_THROTTLE = {
  limit: parsePositiveInt(process.env.AUTH_FORGOT_PASSWORD_THROTTLE_LIMIT, 5),
  ttl: parsePositiveInt(process.env.AUTH_FORGOT_PASSWORD_THROTTLE_TTL_MS, DEFAULT_TTL_MS),
};
