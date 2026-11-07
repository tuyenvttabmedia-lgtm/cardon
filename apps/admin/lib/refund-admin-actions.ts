export const REFUND_READ_PERMISSIONS = [
  'refund.request',
  'refund.approve',
  'refund.execute',
  'refund.reconcile',
] as const;

export type RefundAdminAction =
  | 'request'
  | 'approve'
  | 'cancel'
  | 'clearEsimReview'
  | 'execute'
  | 'complete'
  | 'fail'
  | 'unconfirm'
  | 'reconcileVerified'
  | 'reconcileRejected';

export type RefundActionContext = {
  status: string;
  esimGate: string;
  requiresManualReview: boolean;
  remainingOnRequest: string;
  latestAttempt?: {
    id: string;
    status: string;
    reconStatus: string;
    isOpen: boolean;
  } | null;
};

const CONSECUTIVE_DIGITS = /\d{9,}/;

export function visibleRefundActions(
  permissions: string[],
  role: string | null | undefined,
  ctx: RefundActionContext,
): RefundAdminAction[] {
  const can = (permission: string) =>
    role === 'SUPER_ADMIN' || permissions.includes(permission);
  const actions: RefundAdminAction[] = [];
  const remaining = Number(ctx.remainingOnRequest);

  if (can('refund.request')) {
    actions.push('request');
  }
  if (ctx.status === 'REQUESTED' && can('refund.approve')) {
    actions.push('approve');
  }
  if (ctx.status === 'REQUESTED' && can('refund.request')) {
    actions.push('cancel');
  }
  if (ctx.status === 'APPROVED' && can('refund.approve')) {
    actions.push('cancel');
  }
  if (
    ctx.esimGate !== 'NONE' &&
    ctx.requiresManualReview &&
    ctx.status !== 'CANCELLED' &&
    ctx.status !== 'SUCCEEDED' &&
    can('refund.approve')
  ) {
    actions.push('clearEsimReview');
  }
  if (
    (ctx.status === 'APPROVED' || ctx.status === 'PROCESSING') &&
    !ctx.latestAttempt?.isOpen &&
    remaining > 0 &&
    !ctx.requiresManualReview &&
    can('refund.execute')
  ) {
    actions.push('execute');
  }
  if (ctx.latestAttempt?.isOpen && can('refund.execute')) {
    actions.push('complete');
    actions.push('fail');
  }
  if (ctx.latestAttempt?.status === 'SENT' && can('refund.execute')) {
    actions.push('unconfirm');
  }
  if (
    ctx.latestAttempt?.status === 'SUCCEEDED' &&
    ctx.latestAttempt.reconStatus === 'PENDING_VERIFY' &&
    can('refund.reconcile')
  ) {
    actions.push('reconcileVerified');
    actions.push('reconcileRejected');
  }
  return actions;
}

export function validateCompleteRefundForm(input: {
  bankTransactionReference: string;
  amount: string;
  currency: string;
  transferredAt: string;
  destinationHint: string;
}): string | null {
  if (!input.bankTransactionReference.trim()) {
    return 'Cần mã giao dịch ngân hàng đã chuyển.';
  }
  if (!input.amount.trim() || Number(input.amount) <= 0) {
    return 'Số tiền hoàn không hợp lệ.';
  }
  if (!input.currency) {
    return 'Cần chọn loại tiền.';
  }
  if (!input.transferredAt) {
    return 'Cần thời điểm đã chuyển khoản.';
  }
  const hint = input.destinationHint.trim();
  if (hint.length < 3) {
    return 'destinationHint phải được che, ví dụ VCB ****1234.';
  }
  if (CONSECUTIVE_DIGITS.test(hint)) {
    return 'Không nhập số tài khoản đầy đủ.';
  }
  if (!hint.includes('*')) {
    return 'destinationHint phải có dấu * để che số tài khoản.';
  }
  return null;
}

export function validateFailRefundForm(errorCode: string): string | null {
  if (!errorCode) {
    return 'Cần chọn mã lý do fail.';
  }
  return null;
}

export function validateReconcileForm(statementEvidenceRef: string): string | null {
  if (!statementEvidenceRef.trim()) {
    return 'Cần mã tham chiếu sao kê, không dán raw statement.';
  }
  if (CONSECUTIVE_DIGITS.test(statementEvidenceRef)) {
    return 'Không dán số tài khoản hoặc nội dung sao kê đầy đủ.';
  }
  return null;
}
