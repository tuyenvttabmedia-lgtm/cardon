/**
 * Phase 6H.2 — SMTP provider tests
 */
import { SmtpEmailProvider } from './smtp-email.provider';

const sendMail = jest.fn();
const createTransport = jest.fn(() => ({ sendMail }));

jest.mock('nodemailer', () => ({
  __esModule: true,
  default: { createTransport: () => createTransport() },
}));

describe('Phase 6H.2 — SmtpEmailProvider', () => {
  const settingsStore = {
    resolveSmtpConfig: jest.fn(),
  };

  beforeEach(() => {
    jest.clearAllMocks();
    sendMail.mockResolvedValue({ messageId: '<real-id@test.local>' });
    createTransport.mockReturnValue({ sendMail });
    settingsStore.resolveSmtpConfig.mockReturnValue({
      host: 'smtp-relay.brevo.com',
      port: 587,
      user: 'user@cardon.vn',
      pass: 'secret-pass',
      from: 'noreply@cardon.vn',
      fromName: 'CardOn',
      secure: false,
    });
  });

  function provider() {
    return new SmtpEmailProvider(settingsStore as never);
  }

  it('sends HTML + text via nodemailer with UTF-8 Vietnamese subject', async () => {
    const result = await provider().sendEmail({
      to: 'buyer@test.local',
      subject: 'Xác nhận đơn hàng CardOn',
      html: '<p>Thanh toán thành công</p>',
      text: 'Thanh toán thành công',
      template: 'ORDER_SUCCESS',
    });

    expect(result.ok).toBe(true);
    expect(result.messageId).toBe('<real-id@test.local>');
    expect(sendMail).toHaveBeenCalledWith(
      expect.objectContaining({
        from: '"CardOn" <noreply@cardon.vn>',
        to: 'buyer@test.local',
        subject: 'Xác nhận đơn hàng CardOn',
        html: '<p>Thanh toán thành công</p>',
        text: 'Thanh toán thành công',
        encoding: 'utf-8',
      }),
    );
  });

  it('returns SMTP error without fake success', async () => {
    sendMail.mockRejectedValue(new Error('Connection refused'));
    const result = await provider().sendEmail({
      to: 'buyer@test.local',
      subject: 'Test',
      html: '<p>x</p>',
      text: 'x',
      template: 'USER_REGISTER',
    });

    expect(result.ok).toBe(false);
    expect(result.error).toContain('Connection refused');
  });

  it('supports attachments payload', async () => {
    await provider().sendEmail({
      to: 'buyer@test.local',
      subject: 'Test',
      html: '<p>x</p>',
      text: 'x',
      template: 'USER_REGISTER',
      attachments: [{ filename: 'note.txt', content: 'hello' }],
    });

    expect(sendMail).toHaveBeenCalledWith(
      expect.objectContaining({
        attachments: [{ filename: 'note.txt', content: 'hello' }],
      }),
    );
  });

  it('clears transporter cache on settings reload hook', () => {
    const p = provider();
    p.clearTransporterCache();
    expect(() => p.clearTransporterCache()).not.toThrow();
  });
});
