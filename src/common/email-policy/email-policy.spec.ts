import { BadRequestException, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import {
  EMAIL_POLICY_REJECT_MESSAGE,
  domainMatchesListed,
  evaluateEmailDomain,
  extractEmailDomain,
  isEmailPolicyEnabled,
  normalizeEmailAddress,
  parseEmailDomainAllowlist,
} from './email-policy';
import { EmailPolicyService } from './email-policy.service';

describe('email-policy helpers', () => {
  describe('isEmailPolicyEnabled', () => {
    it('defaults ON when unset or empty', () => {
      expect(isEmailPolicyEnabled(undefined)).toBe(true);
      expect(isEmailPolicyEnabled(null)).toBe(true);
      expect(isEmailPolicyEnabled('')).toBe(true);
      expect(isEmailPolicyEnabled('   ')).toBe(true);
    });

    it('treats false/0/off/no as OFF', () => {
      expect(isEmailPolicyEnabled('false')).toBe(false);
      expect(isEmailPolicyEnabled('FALSE')).toBe(false);
      expect(isEmailPolicyEnabled('0')).toBe(false);
      expect(isEmailPolicyEnabled('off')).toBe(false);
      expect(isEmailPolicyEnabled('no')).toBe(false);
    });

    it('treats true/1/other as ON', () => {
      expect(isEmailPolicyEnabled('true')).toBe(true);
      expect(isEmailPolicyEnabled('1')).toBe(true);
      expect(isEmailPolicyEnabled('yes')).toBe(true);
    });
  });

  describe('parseEmailDomainAllowlist', () => {
    it('parses comma-separated domains', () => {
      expect(parseEmailDomainAllowlist('Example.COM, foo.org ')).toEqual([
        'example.com',
        'foo.org',
      ]);
    });

    it('returns empty for blank', () => {
      expect(parseEmailDomainAllowlist(undefined)).toEqual([]);
      expect(parseEmailDomainAllowlist('')).toEqual([]);
    });
  });

  describe('domain boundary matching', () => {
    it('matches exact and subdomain for multi-label entries', () => {
      expect(domainMatchesListed('example.com', 'example.com')).toBe(true);
      expect(domainMatchesListed('foo.example.com', 'example.com')).toBe(true);
      expect(domainMatchesListed('a.b.example.com', 'example.com')).toBe(true);
    });

    it('rejects near-miss / lookalike domains', () => {
      expect(domainMatchesListed('myexample.com', 'example.com')).toBe(false);
      expect(domainMatchesListed('example.com.evil.com', 'example.com')).toBe(
        false,
      );
      expect(domainMatchesListed('example.comx', 'example.com')).toBe(false);
      expect(domainMatchesListed('notexample.com', 'example.com')).toBe(false);
    });

    it('matches single-label reserved only as full domain', () => {
      expect(domainMatchesListed('test', 'test')).toBe(true);
      expect(domainMatchesListed('contest.com', 'test')).toBe(false);
      expect(domainMatchesListed('foo.test', 'test')).toBe(false);
      expect(domainMatchesListed('localhost', 'localhost')).toBe(true);
      expect(domainMatchesListed('dev.localhost', 'localhost')).toBe(false);
    });
  });

  describe('evaluateEmailDomain', () => {
    it('allows Gmail and corporate mail when enabled', () => {
      expect(evaluateEmailDomain('user@gmail.com').allowed).toBe(true);
      expect(evaluateEmailDomain('a@cardon.vn').allowed).toBe(true);
      expect(evaluateEmailDomain('User@Outlook.com').allowed).toBe(true);
    });

    it('rejects reserved root and subdomain', () => {
      expect(evaluateEmailDomain('a@example.com')).toEqual({
        allowed: false,
        ruleId: 'reserved',
      });
      expect(evaluateEmailDomain('a@mail.example.org')).toEqual({
        allowed: false,
        ruleId: 'reserved',
      });
      expect(evaluateEmailDomain('a@example.net').allowed).toBe(false);
    });

    it('rejects curated disposable domains', () => {
      expect(evaluateEmailDomain('x@mailinator.com')).toEqual({
        allowed: false,
        ruleId: 'disposable',
      });
      expect(evaluateEmailDomain('x@guerrillamail.com').allowed).toBe(false);
      expect(evaluateEmailDomain('x@yopmail.com').allowed).toBe(false);
    });

    it('does not allowlist-bypass RFC reserved root domain', () => {
      expect(
        evaluateEmailDomain('ops@example.com', {
          allowlist: ['example.com'],
        }),
      ).toEqual({ allowed: false, ruleId: 'reserved' });
    });

    it('does not allowlist-bypass reserved subdomain when parent is allowlisted', () => {
      expect(
        evaluateEmailDomain('ops@foo.example.com', {
          allowlist: ['example.com'],
        }),
      ).toEqual({ allowed: false, ruleId: 'reserved' });
    });

    it('allowlist bypasses disposable domains only', () => {
      expect(
        evaluateEmailDomain('qa@mailinator.com', {
          allowlist: ['mailinator.com'],
        }).allowed,
      ).toBe(true);
      expect(
        evaluateEmailDomain('qa@mail.mailinator.com', {
          allowlist: ['mailinator.com'],
        }).allowed,
      ).toBe(true);
      expect(
        evaluateEmailDomain('qa@yopmail.com', {
          allowlist: ['mailinator.com'],
        }).allowed,
      ).toBe(false);
    });

    it('still allows Gmail with or without unrelated allowlist', () => {
      expect(evaluateEmailDomain('user@gmail.com').allowed).toBe(true);
      expect(
        evaluateEmailDomain('user@gmail.com', {
          allowlist: ['mailinator.com'],
        }).allowed,
      ).toBe(true);
    });

    it('does not block lookalike domains near reserved entries', () => {
      expect(evaluateEmailDomain('a@myexample.com').allowed).toBe(true);
      expect(evaluateEmailDomain('a@example.com.evil.com').allowed).toBe(true);
      expect(evaluateEmailDomain('a@notexample.com').allowed).toBe(true);
      expect(evaluateEmailDomain('a@contest.com').allowed).toBe(true);
    });

    it('disabled policy allows denied domains', () => {
      expect(
        evaluateEmailDomain('a@example.com', { enabled: false }).allowed,
      ).toBe(true);
    });

    it('normalizes before extract', () => {
      expect(normalizeEmailAddress('  A@Example.COM ')).toBe('a@example.com');
      expect(extractEmailDomain('  A@Foo.Example.COM ')).toBe('foo.example.com');
    });
  });
});

describe('EmailPolicyService', () => {
  function buildService(getImpl: (key: string) => unknown) {
    const config = {
      get: jest.fn((key: string) => getImpl(key)),
    } as unknown as ConfigService;
    return new EmailPolicyService(config);
  }

  it('throws unified message and logs hash + ruleId', () => {
    const service = buildService((key) => {
      if (key === 'emailPolicy.enabled') return true;
      if (key === 'emailPolicy.allowlist') return [];
      return undefined;
    });
    const warn = jest.spyOn(Logger.prototype, 'warn').mockImplementation();

    expect(() => service.assertRegistrationEmailAllowed('bot@example.com')).toThrow(
      BadRequestException,
    );
    expect(() => service.assertRegistrationEmailAllowed('bot@example.com')).toThrow(
      EMAIL_POLICY_REJECT_MESSAGE,
    );

    expect(warn).toHaveBeenCalledWith(
      expect.stringMatching(/^email_policy_reject ruleId=reserved emailHash=[a-f0-9]{16}$/),
    );
    warn.mockRestore();
  });

  it('no-ops when policy disabled via config', () => {
    const service = buildService((key) => {
      if (key === 'emailPolicy.enabled') return false;
      if (key === 'emailPolicy.allowlist') return [];
      return undefined;
    });
    expect(() =>
      service.assertRegistrationEmailAllowed('bot@example.com'),
    ).not.toThrow();
  });

  it('allows gmail when enabled', () => {
    const service = buildService((key) => {
      if (key === 'emailPolicy.enabled') return true;
      if (key === 'emailPolicy.allowlist') return [];
      return undefined;
    });
    expect(() =>
      service.assertRegistrationEmailAllowed('user@gmail.com'),
    ).not.toThrow();
  });
});
