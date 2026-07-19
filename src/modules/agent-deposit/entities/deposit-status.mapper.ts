import { AgentDepositStatus } from '@prisma/client';

export const DEPOSIT_STATUS_LABELS: Record<AgentDepositStatus, string> = {
  INIT: 'Khởi tạo',
  AWAITING_PAYMENT: 'Đang chờ thanh toán',
  PAID: 'Đã thanh toán',
  RECORDED: 'Đã ghi nhận',
  CREDITED: 'Đã cộng ví',
  EXPIRED: 'Hết hạn',
  FAILED: 'Thất bại',
  CANCELLED: 'Đã hủy',
};

export const DEPOSIT_TIMELINE_ORDER: AgentDepositStatus[] = [
  AgentDepositStatus.INIT,
  AgentDepositStatus.AWAITING_PAYMENT,
  AgentDepositStatus.PAID,
  AgentDepositStatus.RECORDED,
  AgentDepositStatus.CREDITED,
];

export function depositStatusTone(status: AgentDepositStatus): string {
  switch (status) {
    case AgentDepositStatus.CREDITED:
      return 'success';
    case AgentDepositStatus.AWAITING_PAYMENT:
    case AgentDepositStatus.PAID:
    case AgentDepositStatus.RECORDED:
      return 'warning';
    case AgentDepositStatus.EXPIRED:
    case AgentDepositStatus.FAILED:
    case AgentDepositStatus.CANCELLED:
      return 'error';
    default:
      return 'neutral';
  }
}

export function buildDepositTimeline(deposit: {
  status: AgentDepositStatus;
  createdAt: Date;
  paidAt?: Date | null;
  creditedAt?: Date | null;
  expiresAt?: Date | null;
}) {
  const terminalNegative: AgentDepositStatus[] = [
    AgentDepositStatus.EXPIRED,
    AgentDepositStatus.FAILED,
    AgentDepositStatus.CANCELLED,
  ];
  const isTerminalNegative = terminalNegative.includes(deposit.status);

  const steps = DEPOSIT_TIMELINE_ORDER.map((step) => {
    let at: string | null = null;
    let reached = false;

    if (step === AgentDepositStatus.INIT) {
      at = deposit.createdAt.toISOString();
      reached = true;
    }
    if (step === AgentDepositStatus.AWAITING_PAYMENT) {
      at = deposit.createdAt.toISOString();
      reached = deposit.status !== AgentDepositStatus.INIT;
    }
    if (step === AgentDepositStatus.PAID && deposit.paidAt) {
      at = deposit.paidAt.toISOString();
      reached = true;
    }
    if (step === AgentDepositStatus.RECORDED && deposit.paidAt) {
      at = deposit.paidAt.toISOString();
      const recordedOrCredited: AgentDepositStatus[] = [
        AgentDepositStatus.RECORDED,
        AgentDepositStatus.CREDITED,
      ];
      reached = recordedOrCredited.includes(deposit.status);
    }
    if (step === AgentDepositStatus.CREDITED && deposit.creditedAt) {
      at = deposit.creditedAt.toISOString();
      reached = deposit.status === AgentDepositStatus.CREDITED;
    }

    if (!reached && !isTerminalNegative) {
      const statusIndex = DEPOSIT_TIMELINE_ORDER.indexOf(deposit.status);
      const stepIndex = DEPOSIT_TIMELINE_ORDER.indexOf(step);
      reached = statusIndex >= stepIndex && deposit.status !== AgentDepositStatus.INIT;
    }

    return {
      status: step,
      label: DEPOSIT_STATUS_LABELS[step],
      at,
      reached,
    };
  });

  if (isTerminalNegative) {
    steps.push({
      status: deposit.status,
      label: DEPOSIT_STATUS_LABELS[deposit.status],
      at: deposit.expiresAt?.toISOString() ?? deposit.createdAt.toISOString(),
      reached: true,
    });
  }

  return steps;
}
