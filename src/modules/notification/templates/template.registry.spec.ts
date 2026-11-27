import { ESIM_INSTALL_QR_CID } from '../../esim/esim-lpa-qr';
import { esimDeliveryNotice } from '../../esim/esim-delivery.view';
import { renderEmailTemplate } from './template.registry';

const FIXTURE_ORDER = 'ORD-TEST-SANDBOX';
const FIXTURE_ACCOUNT = 'https://cardon.vn/tai-khoan/esim';
const FIXTURE_LPA = 'LPA:1$smdp.example.com$MATCHID';
const SANDBOX_NOTICE = esimDeliveryNotice('ready', false, true) ?? '';

describe('USER_REGISTER templates', () => {
  it('retail welcome has no verify CTA', () => {
    const vi = renderEmailTemplate('USER_REGISTER', { fullName: 'An' });
    const en = renderEmailTemplate('USER_REGISTER', { fullName: 'An', locale: 'en' });
    expect(vi.html).toContain('sẵn sàng');
    expect(vi.html).not.toMatch(/xác minh/i);
    expect(vi.html).not.toContain('verify-email');
    expect(en.html).toContain('ready');
    expect(en.html).not.toMatch(/Verify your email/i);
  });

  it('agent welcome keeps verify link when verifyUrl is present', () => {
    const url = 'https://partner.cardon.vn/verify-email?token=abc';
    const vi = renderEmailTemplate('USER_REGISTER', { fullName: 'An', verifyUrl: url });
    expect(vi.html).toContain(url);
    expect(vi.html).toMatch(/Xác minh/i);
  });
});

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
      expect(part).toMatch(/không chứa mã cài đặt|Không có mã cài đặt/i);
    }
    expect(rendered.html).toContain(FIXTURE_ACCOUNT);
    expect(rendered.text).toContain(FIXTURE_ACCOUNT);
  });

  it('ESIM_READY embeds install QR, LPA, and detailed install steps', () => {
    const ready = renderEmailTemplate('ESIM_READY', {
      orderCode: FIXTURE_ORDER,
      installSecret: FIXTURE_LPA,
      hasQrImage: true,
      smdpAddress: 'smdp.example.com',
      activationCode: 'MATCHID',
      appleSetupUrl: `https://esimsetup.apple.com/esim_qrcode_provisioning?carddata=${encodeURIComponent(FIXTURE_LPA)}`,
      androidSetupUrl: `https://esimsetup.android.com/esim_qrcode_provisioning?carddata=${encodeURIComponent(FIXTURE_LPA)}`,
      destination: 'Asia',
      packageName: '500MB',
      sharingLink: 'https://esims.cloud/keyon/demo',
      sharingAccessCode: '8265',
      accountUrl: FIXTURE_ACCOUNT,
      isGuestOrder: true,
    });
    expect(ready.html).toContain('Asia');
    expect(ready.html).toContain('esims.cloud/keyon/demo');
    expect(ready.html).toContain('8265');
    expect(ready.html).toMatch(/eSIM link|Theo dõi dung lượng/i);
    expect(ready.html).toMatch(/Access code/i);
    expect(ready.html).toMatch(/tạo tài khoản CardOn|Create a free CardOn account/i);
    expect(ready.html).toContain(FIXTURE_ACCOUNT);
    expect(ready.html).toContain(FIXTURE_LPA);
    expect(ready.html).toContain(`cid:${ESIM_INSTALL_QR_CID}`);
    expect(ready.html).toContain('smdp.example.com');
    expect(ready.html).toContain('MATCHID');
    expect(ready.html).toMatch(/Cài trên iPhone|Install on iPhone/);
    expect(ready.html).toMatch(/Cài trên Android|Install on Android/);
    expect(ready.html).toContain('esimsetup.apple.com');
    expect(ready.html).toContain('esimsetup.android.com');
    expect(ready.text).toContain(FIXTURE_LPA);
    expect(ready.html).not.toMatch(/không[\s\S]{0,24}chứa mã cài đặt/i);
  });

  it('ESIM_TEST_READY still omits install secrets', () => {
    const test = renderEmailTemplate('ESIM_TEST_READY', {
      orderCode: FIXTURE_ORDER,
      installSecret: FIXTURE_LPA,
    });
    for (const part of [test.html, test.text]) {
      expect(part).not.toMatch(/LPA:1/i);
      expect(part).toMatch(/không[\s\S]{0,24}chứa mã cài đặt|Không có mã cài đặt|no install code/i);
    }
  });
});
