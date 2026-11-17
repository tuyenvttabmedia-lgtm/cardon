import { normalizeRegisterUsername } from './normalize-register-username';

describe('normalizeRegisterUsername', () => {
  it('strips Vietnamese accents and spaces', () => {
    expect(normalizeRegisterUsername('Nguyễn Văn A')).toBe('nguyen_van_a');
  });

  it('uses email local-part when email is pasted', () => {
    expect(normalizeRegisterUsername('Minh.Anh@gmail.com')).toBe('minh_anh');
  });

  it('keeps valid ascii usernames', () => {
    expect(normalizeRegisterUsername('customer_01')).toBe('customer_01');
  });

  it('collapses separators', () => {
    expect(normalizeRegisterUsername('a--b..c  d')).toBe('a_b_c_d');
  });
});
