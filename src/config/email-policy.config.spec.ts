import {
  isEmailPolicyEnabled,
  parseEmailDomainAllowlist,
} from '../common/email-policy/email-policy';

/**
 * Mirrors `configuration.ts` emailPolicy wiring without reloading the Nest config
 * module (avoids jest.resetModules side effects on sibling suites).
 */
describe('emailPolicy configuration helpers (W1)', () => {
  it('defaults ENABLED when EMAIL_POLICY_ENABLED unset', () => {
    expect(isEmailPolicyEnabled(undefined)).toBe(true);
    expect(isEmailPolicyEnabled('')).toBe(true);
  });

  it('disables when EMAIL_POLICY_ENABLED=false', () => {
    expect(isEmailPolicyEnabled('false')).toBe(false);
  });

  it('parses EMAIL_DOMAIN_ALLOWLIST', () => {
    expect(parseEmailDomainAllowlist('example.com,Partner.VN')).toEqual([
      'example.com',
      'partner.vn',
    ]);
  });
});
