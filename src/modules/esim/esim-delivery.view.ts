import { FulfillmentStatus, OrderPaymentStatus, ProductVariantType } from '@prisma/client';
import { ESIM_TEST_MARKER } from './esim.constants';
import { type EsimPackageSpec } from './esim-package-spec';

export type EsimDeliveryKind = 'none' | 'waiting' | 'ready' | 'stuck';

export interface EsimDeliveryView {
  kind: EsimDeliveryKind;
  destination: string;
  packageName: string | null;
  testData: boolean;
  sandboxAccount: boolean;
  notice: string | null;
  installSecret: string | null;
  qrSvg: string | null;
  appleSetupUrl: string | null;
  canRevealInstallSecret: boolean;
  packageSpec: EsimPackageSpec | null;
  orderId?: string;
  orderCode?: string;
}

export function isEsimTestSecret(secret: string): boolean {
  const trimmed = secret.trim();
  return (
    trimmed.includes(ESIM_TEST_MARKER) ||
    /^LPA:1\$lpa\.airalo\.com\$(TEST|12345)$/i.test(trimmed)
  );
}

export function isInstallableLpa(secret: string): boolean {
  const trimmed = secret.trim();
  if (trimmed.includes(ESIM_TEST_MARKER)) return true;
  if (!trimmed.startsWith('LPA:1$')) return false;
  const parts = trimmed.split('$');
  return parts.length === 3 && parts.every((part) => part.trim() !== '');
}

export function lpaForDisplay(secret: string): string {
  const marker = `${ESIM_TEST_MARKER}:`;
  return secret.startsWith(marker) ? secret.slice(marker.length) : secret;
}

export function appleEsimSetupUrl(secret: string): string | null {
  const lpa = lpaForDisplay(secret);
  if (!lpa.startsWith('LPA:1$')) return null;
  return `https://esimsetup.apple.com/esim_qrcode_provisioning?carddata=${encodeURIComponent(lpa)}`;
}

export function destinationFromNames(
  productName?: string | null,
  variantName?: string | null,
): string {
  const raw = (productName || variantName || '').replace(/^eSIM\s+/i, '').trim();
  if (!raw) return 'điểm đến';
  const cut = raw.split(/\s+\d/)[0]?.trim();
  return cut || raw;
}

export function resolveEsimDeliveryKind(input: {
  isEsim: boolean;
  paymentStatus: OrderPaymentStatus | string;
  fulfillmentStatus: FulfillmentStatus | string;
  hasValidSecret: boolean;
}): EsimDeliveryKind {
  if (!input.isEsim) return 'none';
  if (input.hasValidSecret) return 'ready';
  if (input.paymentStatus !== OrderPaymentStatus.PAID) return 'none';
  if (
    input.fulfillmentStatus === FulfillmentStatus.NEED_MANUAL_REVIEW ||
    input.fulfillmentStatus === FulfillmentStatus.FAILED ||
    input.fulfillmentStatus === FulfillmentStatus.COMPLETED
  ) {
    return 'stuck';
  }
  return 'waiting';
}

export function esimDeliveryNotice(
  kind: EsimDeliveryKind,
  testData: boolean,
  sandboxAccount = false,
): string | null {
  if (kind === 'ready') {
    if (testData) {
      return 'Đơn mô phỏng nội bộ — chuỗi LPA chỉ để kiểm tra giao diện, không cài lên máy thật.';
    }
    if (sandboxAccount) {
      return 'Đây là mã thử nghiệm, không phải eSIM thật. Không cài hoặc kích hoạt trên máy.';
    }
    return 'Mã cài eSIM của bạn. Chỉ dùng trên thiết bị của bạn.';
  }
  if (kind === 'waiting') {
    return 'Đã nhận thanh toán. Hệ thống đang lấy mã cài — trang sẽ tự cập nhật.';
  }
  if (kind === 'stuck') {
    return 'Chưa lấy được mã cài. Giữ mã đơn và liên hệ hỗ trợ — không đặt lại đơn nếu đã trừ tiền.';
  }
  return null;
}

export function emptyEsimDelivery(): EsimDeliveryView {
  return {
    kind: 'none',
    destination: 'điểm đến',
    packageName: null,
    testData: false,
    sandboxAccount: false,
    notice: null,
    installSecret: null,
    qrSvg: null,
    appleSetupUrl: null,
    canRevealInstallSecret: false,
    packageSpec: null,
  };
}

export function buildEsimDelivery(input: {
  kind: EsimDeliveryKind;
  destination?: string | null;
  packageName?: string | null;
  secret?: string | null;
  qrSvg?: string | null;
  sandboxAccount?: boolean;
  includeSecrets?: boolean;
  packageSpec?: EsimPackageSpec | null;
  orderId?: string;
  orderCode?: string;
}): EsimDeliveryView {
  const secret = input.secret && isInstallableLpa(input.secret) ? input.secret : null;
  const testData = secret ? isEsimTestSecret(secret) : false;
  const sandboxAccount = input.sandboxAccount === true;
  const display = secret ? lpaForDisplay(secret) : null;
  const kind = secret ? 'ready' : input.kind;
  const includeSecrets = input.includeSecrets !== false;
  return {
    kind,
    destination: input.destination?.trim() || 'điểm đến',
    packageName: input.packageName?.trim() || null,
    testData,
    sandboxAccount,
    notice: esimDeliveryNotice(kind, testData, sandboxAccount),
    installSecret: includeSecrets && kind === 'ready' ? display : null,
    qrSvg: includeSecrets && kind === 'ready' ? input.qrSvg ?? null : null,
    appleSetupUrl:
      includeSecrets && kind === 'ready' && display && !testData ? appleEsimSetupUrl(display) : null,
    canRevealInstallSecret: kind === 'ready' && Boolean(secret),
    packageSpec: input.packageSpec ?? null,
    orderId: input.orderId,
    orderCode: input.orderCode,
  };
}

export function isEsimVariantType(type?: ProductVariantType | string | null): boolean {
  return type === ProductVariantType.ESIM || type === 'ESIM';
}
