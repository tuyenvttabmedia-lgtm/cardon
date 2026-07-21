import {
  generateDepositReference,
  isAgentDepositReference,
} from './deposit-reference.generator';

describe('deposit-reference.generator', () => {
  it('generates SePay DH payment codes', () => {
    const ref = generateDepositReference();
    expect(ref).toMatch(/^DH[0-9]{8}$/);
  });

  it('recognizes legacy DEP and DH references', () => {
    expect(isAgentDepositReference('DEP-ABC123')).toBe(true);
    expect(isAgentDepositReference('DH12345678')).toBe(true);
    expect(isAgentDepositReference('PAY-ABC')).toBe(false);
  });
});
