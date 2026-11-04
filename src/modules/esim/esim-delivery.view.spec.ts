import { FulfillmentStatus, OrderPaymentStatus } from '@prisma/client';
import { ESIM_TEST_MARKER } from './esim.constants';
import {
  appleEsimSetupUrl,
  buildEsimDelivery,
  destinationFromNames,
  esimDeliveryNotice,
  isEsimTestSecret,
  isInstallableLpa,
  lpaForDisplay,
  resolveEsimDeliveryKind,
} from './esim-delivery.view';
import { renderLpaQrSvg } from './esim-lpa-qr';

describe('esim delivery view', () => {
  it('marks sandbox FAQ LPA as test data and still installable for display', () => {
    expect(isEsimTestSecret('LPA:1$lpa.airalo.com$TEST')).toBe(true);
    expect(isInstallableLpa('LPA:1$lpa.airalo.com$TEST')).toBe(true);
    expect(isEsimTestSecret(`${ESIM_TEST_MARKER}:LPA:1$test.invalid$MOCK`)).toBe(true);
    expect(isInstallableLpa('not-an-install-string')).toBe(false);
  });

  it('strips the internal test marker before QR / Apple URL', () => {
    const raw = `${ESIM_TEST_MARKER}:LPA:1$lpa.airalo.com$TEST`;
    expect(lpaForDisplay(raw)).toBe('LPA:1$lpa.airalo.com$TEST');
    expect(appleEsimSetupUrl(raw)).toContain('carddata=LPA');
  });

  it('reads destination from product or variant name', () => {
    expect(destinationFromNames('eSIM Nhật Bản', '1GB / 7 ngày')).toBe('Nhật Bản');
    expect(destinationFromNames(null, 'eSIM Hàn Quốc 2GB')).toBe('Hàn Quốc');
    expect(destinationFromNames(null, null)).toBe('điểm đến');
  });

  it('maps paid + profile to ready, paid + review to stuck', () => {
    expect(
      resolveEsimDeliveryKind({
        isEsim: true,
        paymentStatus: OrderPaymentStatus.PAID,
        fulfillmentStatus: FulfillmentStatus.PROCESSING,
        hasValidSecret: false,
      }),
    ).toBe('waiting');
    expect(
      resolveEsimDeliveryKind({
        isEsim: true,
        paymentStatus: OrderPaymentStatus.PAID,
        fulfillmentStatus: FulfillmentStatus.NEED_MANUAL_REVIEW,
        hasValidSecret: false,
      }),
    ).toBe('stuck');
    expect(
      resolveEsimDeliveryKind({
        isEsim: true,
        paymentStatus: OrderPaymentStatus.PAID,
        fulfillmentStatus: FulfillmentStatus.COMPLETED,
        hasValidSecret: true,
      }),
    ).toBe('ready');
    expect(
      resolveEsimDeliveryKind({
        isEsim: true,
        paymentStatus: OrderPaymentStatus.PAID,
        fulfillmentStatus: FulfillmentStatus.COMPLETED,
        hasValidSecret: false,
      }),
    ).toBe('stuck');
    expect(
      resolveEsimDeliveryKind({
        isEsim: false,
        paymentStatus: OrderPaymentStatus.PAID,
        fulfillmentStatus: FulfillmentStatus.COMPLETED,
        hasValidSecret: false,
      }),
    ).toBe('none');
    expect(
      resolveEsimDeliveryKind({
        isEsim: true,
        paymentStatus: OrderPaymentStatus.WAITING_PAYMENT,
        fulfillmentStatus: FulfillmentStatus.PENDING,
        hasValidSecret: false,
      }),
    ).toBe('none');
  });

  it('never puts LPA into waiting/stuck notices', () => {
    expect(esimDeliveryNotice('waiting', false)).not.toMatch(/LPA/i);
    expect(esimDeliveryNotice('stuck', false)).not.toMatch(/LPA/i);
  });

  it('treats unique Airalo matching IDs as the same Production-shaped profile', () => {
    const unique = 'LPA:1$lpa.airalo.com$ABCDEFGHIJKLMNOPQRSTUVWX0123';
    expect(isEsimTestSecret(unique)).toBe(false);
    expect(isEsimTestSecret('LPA:1$lpa.airalo.com$12345')).toBe(true);
    const view = buildEsimDelivery({
      kind: 'ready',
      destination: 'Hàn Quốc',
      secret: unique,
      sandboxAccount: true,
    });
    expect(view.testData).toBe(false);
    expect(view.sandboxAccount).toBe(true);
    expect(view.appleSetupUrl).toContain('carddata=LPA');
    expect(view.notice).toMatch(/thử nghiệm/i);
    expect(view.notice).toMatch(/không cài/i);
    expect(view.notice).not.toMatch(/airalo/i);
    expect(view.notice).not.toMatch(unique);
    const live = buildEsimDelivery({
      kind: 'ready',
      destination: 'Hàn Quốc',
      secret: unique,
      sandboxAccount: false,
    });
    expect(live.notice).toMatch(/thiết bị của bạn/i);
    expect(live.appleSetupUrl).toContain('carddata=LPA');
  });

  it('can build metadata without returning install secrets', () => {
    const view = buildEsimDelivery({
      kind: 'ready',
      destination: 'Hàn Quốc',
      secret: 'LPA:1$lpa.airalo.com$ABCDEFGHIJKLMNOPQRSTUVWX0123',
      qrSvg: '<svg></svg>',
      includeSecrets: false,
    });
    expect(view.kind).toBe('ready');
    expect(view.canRevealInstallSecret).toBe(true);
    expect(view.installSecret).toBeNull();
    expect(view.qrSvg).toBeNull();
    expect(view.appleSetupUrl).toBeNull();
  });

  it('renders an SVG QR that does not embed a second copy of the secret as text', () => {
    const svg = renderLpaQrSvg('LPA:1$lpa.airalo.com$TEST');
    expect(svg).toContain('<svg');
    expect(svg).not.toContain('lpa.airalo.com');
  });
});
