import {
  Payment,
  PaymentGatewayCode,
  PaymentReconciliationStatus,
  PaymentRecordStatus,
} from '@prisma/client';
import { Decimal } from '@prisma/client/runtime/library';

export interface PaymentBankInfo {
  bankCode?: string | null;
  bankName?: string | null;
  accountNumber?: string | null;
  accountName?: string | null;
}

export interface PaymentCheckoutClient {
  domain: string;
  jsUrl: string;
  cssUrl: string;
}

export interface PaymentView {
  id: string;
  orderId: string;
  gateway: PaymentGatewayCode;
  paymentReference: string;
  amount: string;
  status: PaymentRecordStatus;
  paymentUrl?: string;
  checkoutUrl?: string;
  checkoutFormFields?: Record<string, string>;
  checkoutClient?: PaymentCheckoutClient;
  /** qr_inline = show QR on CardOn. open_payment = MegaPay layer. redirect = hosted form POST. */
  displayMode?: 'qr_inline' | 'redirect' | 'open_payment';
  bankInfo?: PaymentBankInfo | null;
  expiresAt: string | null;
  paidAt: string | null;
  createdAt: string;
}

export interface AdminPaymentView extends PaymentView {
  methodCode: string | null;
  gatewayTransactionId: string | null;
  bankTransactionId: string | null;
  bankReference: string | null;
  settlementDate: string | null;
  reconciliationStatus: PaymentReconciliationStatus;
}

export function decimalToString(value: Decimal | number | string): string {
  return new Decimal(value).toFixed(2);
}

function readGatewayTransactionId(payment: Payment): string | null {
  if (payment.gatewayTransactionId) {
    return payment.gatewayTransactionId;
  }
  const response = payment.gatewayResponse;
  if (response && typeof response === 'object' && !Array.isArray(response)) {
    const value = (response as Record<string, unknown>).gatewayTransactionId;
    return typeof value === 'string' && value.trim() ? value : null;
  }
  return null;
}

export function mapPayment(
  payment: Payment,
  extras?: {
    paymentUrl?: string;
    checkoutUrl?: string;
    checkoutFormFields?: Record<string, string>;
    checkoutClient?: PaymentCheckoutClient;
    displayMode?: 'qr_inline' | 'redirect' | 'open_payment';
    bankInfo?: PaymentBankInfo | null;
  },
): PaymentView {
  return {
    id: payment.id,
    orderId: payment.orderId,
    gateway: payment.gateway,
    paymentReference: payment.paymentReference,
    amount: decimalToString(payment.amount),
    status: payment.status,
    paymentUrl: extras?.paymentUrl,
    checkoutUrl: extras?.checkoutUrl,
    checkoutFormFields: extras?.checkoutFormFields,
    checkoutClient: extras?.checkoutClient,
    displayMode: extras?.displayMode,
    bankInfo: extras?.bankInfo ?? null,
    expiresAt: payment.expiresAt?.toISOString() ?? null,
    paidAt: payment.paidAt?.toISOString() ?? null,
    createdAt: payment.createdAt.toISOString(),
  };
}

export function mapAdminPayment(payment: Payment): AdminPaymentView {
  return {
    ...mapPayment(payment),
    methodCode: payment.methodCode,
    gatewayTransactionId: readGatewayTransactionId(payment),
    bankTransactionId: payment.bankTransactionId,
    bankReference: payment.bankReference,
    settlementDate: payment.settlementDate?.toISOString() ?? null,
    reconciliationStatus: payment.reconciliationStatus,
  };
}
