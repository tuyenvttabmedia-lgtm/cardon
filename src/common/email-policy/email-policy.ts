import {
  EMAIL_POLICY_DISPOSABLE_DOMAINS,
  EMAIL_POLICY_REJECT_MESSAGE,
  EMAIL_POLICY_RESERVED_DOMAINS,
  type EmailPolicyRuleId,
} from './email-policy.constants';

export { EMAIL_POLICY_REJECT_MESSAGE };
export type { EmailPolicyRuleId };

export type EmailPolicyDecision =
  | { allowed: true }
  | { allowed: false; ruleId: EmailPolicyRuleId };

export type EmailPolicyOptions = {
  /** When false, every syntactically present email is allowed. Default: true. */
  enabled?: boolean;
  /**
   * Bypass for curated **disposable** domains only (approved exceptions).
   * Never bypasses RFC reserved domains (`example.com`, `localhost`, …).
   */
  allowlist?: readonly string[] | Set<string>;
};

/** `EMAIL_POLICY_ENABLED`: unset/empty → ON; false/0/off/no → OFF; otherwise ON. */
export function isEmailPolicyEnabled(raw: string | undefined | null): boolean {
  if (raw == null) return true;
  const value = String(raw).trim().toLowerCase();
  if (value === '') return true;
  if (value === 'false' || value === '0' || value === 'off' || value === 'no') {
    return false;
  }
  return true;
}

export function parseEmailDomainAllowlist(
  raw: string | undefined | null,
): string[] {
  if (raw == null || !String(raw).trim()) return [];
  return String(raw)
    .split(',')
    .map((part) => part.trim().toLowerCase())
    .filter(Boolean);
}

export function normalizeEmailAddress(email: string): string {
  return email.trim().toLowerCase();
}

/** Domain part after the last `@`; null if missing/invalid shape. */
export function extractEmailDomain(email: string): string | null {
  const normalized = normalizeEmailAddress(email);
  const at = normalized.lastIndexOf('@');
  if (at <= 0 || at === normalized.length - 1) return null;
  const domain = normalized.slice(at + 1).replace(/\.$/, '');
  if (!domain || domain.includes('@') || domain.includes(' ')) return null;
  return domain;
}

/**
 * Label-boundary match: exact domain, or subdomain of a multi-label denied entry.
 * Single-label denied entries (`test`) never match via suffix (avoids `contest.com`).
 */
export function domainMatchesListed(domain: string, listed: string): boolean {
  const candidate = domain.toLowerCase();
  const entry = listed.toLowerCase();
  if (!candidate || !entry) return false;
  if (candidate === entry) return true;
  if (!entry.includes('.')) return false;
  return candidate.endsWith(`.${entry}`);
}

function matchesAny(domain: string, list: readonly string[]): boolean {
  return list.some((entry) => domainMatchesListed(domain, entry));
}

export function evaluateEmailDomain(
  email: string,
  options: EmailPolicyOptions = {},
): EmailPolicyDecision {
  const enabled = options.enabled !== false;
  if (!enabled) return { allowed: true };

  const domain = extractEmailDomain(email);
  if (!domain) {
    // Let @IsEmail / upstream validation own malformed addresses.
    return { allowed: true };
  }

  // Reserved / RFC documentation domains are never allowlist-bypassable.
  if (matchesAny(domain, EMAIL_POLICY_RESERVED_DOMAINS)) {
    return { allowed: false, ruleId: 'reserved' };
  }

  if (matchesAny(domain, EMAIL_POLICY_DISPOSABLE_DOMAINS)) {
    const allowlist = options.allowlist
      ? Array.from(options.allowlist).map((d) => d.toLowerCase())
      : [];
    if (allowlist.length > 0 && matchesAny(domain, allowlist)) {
      return { allowed: true };
    }
    return { allowed: false, ruleId: 'disposable' };
  }

  return { allowed: true };
}
