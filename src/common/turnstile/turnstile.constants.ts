export const TURNSTILE_SITEVERIFY_URL =
  'https://challenges.cloudflare.com/turnstile/v0/siteverify';

/** Redis key prefix for used captcha tokens (SHA-256 hex). Separate from abuse. */
export const CAPTCHA_USED_KEY_PREFIX = 'cardon:captcha:used:';

export const TURNSTILE_ACTION_REGISTER = 'register';
export const TURNSTILE_ACTION_AGENT_REGISTER = 'agent-register';
export const TURNSTILE_ACTION_SUPPORT_TICKET = 'support-ticket';
export const TURNSTILE_ACTION_GUEST_ORDER = 'guest-order';

export const TURNSTILE_DEFAULT_TIMEOUT_MS = 4000;
export const TURNSTILE_DEFAULT_MAX_AGE_SEC = 300;

/** Client-facing messages — no Cloudflare internal detail. */
export const TURNSTILE_MSG_FAILED = 'Captcha verification failed';
export const TURNSTILE_MSG_UNAVAILABLE = 'Captcha service unavailable';
export const TURNSTILE_MSG_MISCONFIGURED = 'Captcha misconfigured';
