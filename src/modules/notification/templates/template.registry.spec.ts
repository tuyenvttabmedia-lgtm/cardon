import { esimDeliveryNotice } from '../../esim/esim-delivery.view';
import { renderEmailTemplate } from './template.registry';

const FIXTURE_ORDER = 'ORD-TEST-SANDBOX';
const FIXTURE_ACCOUNT = 'https://cardon.vn/tai-khoan/esim';
const SANDBOX_NOTICE = esimDeliveryNotice('ready', false, true) ?? '';

describe('transactional email locale', () => {
  it('keeps Vietnamese password reset copy by default and switches when locale is en', () => {
    const vi = renderEmailTemplate('PASSWORD_RESET', { resetUrl: 'https://cardon.vn/reset' });
    const en = renderEmailTemplate('PASSWORD_RESET', { resetUrl: 'https://cardon.vn/reset', locale: 'en' });
    expect(vi.subject).toContain('Đặt lại mật khẩu');
    expect(en.subject).toContain('Reset your CardOn.vn password');
    expect(en.text).toContain('https://cardon.vn/reset');
    expect(en.text).not.toContain('LPA:');
  });

  it('uses English for order, top-up and eSIM test mail only when locale is en', () => {
    const viTopup = renderEmailTemplate('TOPUP_SUCCESS', { orderCode: 'ORD-1' });
    const enTopup = renderEmailTemplate('TOPUP_SUCCESS', { orderCode: 'ORD-1', locale: 'en' });
    const enOrder = renderEmailTemplate('ORDER_SUCCESS', { orderCode: 'ORD-1', totalAmount: '10000', locale: 'en' });
    const enEsim = renderEmailTemplate('ESIM_SANDBOX_READY', { orderCode: 'ORD-1', locale: 'en' });
    expect(viTopup.subject).toContain('Nạp cước');
    expect(enTopup.subject).toContain('Top-up completed');
    expect(enOrder.subject).toContain('ORD-1');
    expect(enEsim.subject).toContain('[TEST]');
    expect(enEsim.text).not.toMatch(/LPA:1/);
  });
});

describe('eSIM email templates', () => {
  it('ESIM_SANDBOX_READY uses CardOn trial copy and never embeds LPA, QR, or Airalo', () => {
    const rendered = renderEmailTemplate('ESIM_SANDBOX_READY', {
      orderCode: FIXTURE_ORDER,
      customerName: 'An',
      accountUrl: FIXTURE_ACCOUNT,
      installSecret: 'LPA:1$lpa.airalo.com$TEST',
    });

    expect(SANDBOX_NOTICE).toContain('Đây là mã thử nghiệm, không phải eSIM thật');
    expect(rendered.subject).toContain('[TEST]');
    expect(rendered.subject).toContain(FIXTURE_ORDER);
    expect(rendered.subject).not.toMatch(/Airalo|LPA:1|lpa\.airalo/i);
    for (const part of [rendered.html, rendered.text]) {
      expect(part).toContain(FIXTURE_ORDER);
      expect(part).toContain('CardOn');
      expect(part).toContain(SANDBOX_NOTICE);
      expect(part).not.toMatch(/Airalo/i);
      expect(part).not.toMatch(/LPA:1/i);
      expect(part).not.toMatch(/lpa\.airalo\.com/i);
      expect(part).not.toMatch(/<svg/i);
      expect(part).not.toMatch(/qr/i);
      expect(part).toMatch(/không chứa mã cài đặt|Không có mã cài đặt/i);
    }
    expect(rendered.html).toContain(FIXTURE_ACCOUNT);
    expect(rendered.text).toContain(FIXTURE_ACCOUNT);
  });

  it('ESIM_READY and ESIM_TEST_READY also omit install secrets', () => {
    const ready = renderEmailTemplate('ESIM_READY', {
      orderCode: FIXTURE_ORDER,
      installSecret: 'LPA:1$lpa.airalo.com$TEST',
    });
    const test = renderEmailTemplate('ESIM_TEST_READY', {
      orderCode: FIXTURE_ORDER,
      installSecret: 'LPA:1$lpa.airalo.com$TEST',
    });
    for (const part of [ready.html, ready.text, test.html, test.text]) {
      expect(part).not.toMatch(/LPA:1/i);
      expect(part).toMatch(/không chứa mã cài đặt|Không có mã cài đặt/i);
    }
  });
});
