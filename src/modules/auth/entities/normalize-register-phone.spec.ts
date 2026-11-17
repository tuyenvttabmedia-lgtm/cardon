import {
  normalizeIdentityNumber,
  normalizeRegisterPhone,
} from './normalize-register-phone';

describe('normalizeRegisterPhone', () => {
  it('strips spaces and dots', () => {
    expect(normalizeRegisterPhone('0912 345 678')).toBe('0912345678');
    expect(normalizeRegisterPhone('0912.345.678')).toBe('0912345678');
  });

  it('converts +84 and 84 to leading 0', () => {
    expect(normalizeRegisterPhone('+84912345678')).toBe('0912345678');
    expect(normalizeRegisterPhone('84912345678')).toBe('0912345678');
  });
});

describe('normalizeIdentityNumber', () => {
  it('keeps digits only and drops blanks', () => {
    expect(normalizeIdentityNumber('012 345 678 901')).toBe('012345678901');
    expect(normalizeIdentityNumber('   ')).toBeUndefined();
  });
});
