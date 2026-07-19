import { versionsMatch } from '../../settings/entities/payment-gateway-priority';

const BUILD_COMMENT_RE = /<!-- CardOn(?:\s+\w+)?\s+build\s+([^>]+)\s*-->/i;

describe('SystemVersionService build comment parse', () => {
  it('parses CardOn Web build comment', () => {
    const html = '<!-- CardOn Web build 6035.2 AGENT REGISTRATION & KYC CENTER -->';
    expect(html.match(BUILD_COMMENT_RE)?.[1]?.trim()).toBe(
      '6035.2 AGENT REGISTRATION & KYC CENTER',
    );
  });

  it('parses CardOn Admin build comment', () => {
    const html = '<!-- CardOn Admin build 6035.2 AGENT REGISTRATION & KYC CENTER -->';
    expect(html.match(BUILD_COMMENT_RE)?.[1]?.trim()).toBe(
      '6035.2 AGENT REGISTRATION & KYC CENTER',
    );
  });

  it('matches versions with build label', () => {
    expect(
      versionsMatch(
        '6035.2 AGENT REGISTRATION & KYC CENTER',
        '6035.2 AGENT REGISTRATION & KYC CENTER',
      ),
    ).toBe(true);
  });
});
