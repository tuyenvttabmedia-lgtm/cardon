import { BadRequestException } from '@nestjs/common';
import { PaymentRecordStatus } from '@prisma/client';
import { Decimal } from '@prisma/client/runtime/library';

export function assertPaymentRecordTransition(
  current: PaymentRecordStatus,
  next: PaymentRecordStatus,
): void {
  const allowed: Partial<Record<PaymentRecordStatus, PaymentRecordStatus[]>> = {
    [PaymentRecordStatus.PENDING]: [
      PaymentRecordStatus.SUCCESS,
      PaymentRecordStatus.FAILED,
      PaymentRecordStatus.EXPIRED,
    ],
    [PaymentRecordStatus.EXPIRED]: [],
    [PaymentRecordStatus.FAILED]: [],
    [PaymentRecordStatus.SUCCESS]: [],
  };

  const transitions = allowed[current] ?? [];
  if (!transitions.includes(next)) {
    throw new BadRequestException(
      `Invalid payment record transition: ${current} → ${next}`,
    );
  }
}

export function mapWebhookStatusToPaymentStatus(
  status: 'SUCCESS' | 'FAILED',
): PaymentRecordStatus {
  return status === 'SUCCESS'
    ? PaymentRecordStatus.SUCCESS
    : PaymentRecordStatus.FAILED;
}

export function assertWebhookAmountMatches(
  paymentAmount: Decimal | number | string,
  webhookAmount: string | undefined,
): void {
  if (webhookAmount == null || webhookAmount === '') {
    throw new BadRequestException('Webhook amount is required for SUCCESS');
  }

  const expected = new Decimal(paymentAmount).toFixed(2);
  const received = new Decimal(webhookAmount).toFixed(2);

  if (expected !== received) {
    throw new BadRequestException(
      `Payment amount mismatch: expected ${expected}, received ${received}`,
    );
  }
}

export function isWebhookPaymentExpired(params: {
  paymentStatus: PaymentRecordStatus;
  orderPaymentStatus: string;
  expiresAt: Date | null;
  now?: Date;
}): boolean {
  if (params.paymentStatus === PaymentRecordStatus.EXPIRED) {
    return true;
  }
  if (params.orderPaymentStatus === 'EXPIRED') {
    return true;
  }
  if (!params.expiresAt) {
    return false;
  }
  const now = params.now ?? new Date();
  return params.expiresAt.getTime() < now.getTime();
}
