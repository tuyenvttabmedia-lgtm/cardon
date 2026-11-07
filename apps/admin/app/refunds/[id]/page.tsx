'use client';

import Link from 'next/link';
import { useParams } from 'next/navigation';
import { useCallback, useEffect, useMemo, useState, type ReactNode } from 'react';
import { RequireAnyPermission } from '@/components/layout/AdminShell';
import { Badge, Card, ErrorMessage, statusTone } from '@/components/ui/Display';
import { Dialog } from '@/components/ui/Dialog';
import { Button, Input, Select } from '@/components/ui/Form';
import { PageHeader } from '@/components/ui/PageHeader';
import { useAuth } from '@/hooks/useAuth';
import {
  REFUND_READ_PERMISSIONS,
  validateCompleteRefundForm,
  validateFailRefundForm,
  validateReconcileForm,
  visibleRefundActions,
  type RefundAdminAction,
} from '@/lib/refund-admin-actions';
import { vi } from '@/lib/i18n/vi';
import { formatDateTime, formatVnd } from '@/lib/utils';
import { adminApi, ApiClientError } from '@/services/api-client';
import type { AdminRefundDetail } from '@/types/api';

const FAIL_CODES = ['TRANSFER_NOT_SENT', 'TRANSFER_CANCELLED', 'OPERATOR_CONFIRMED_NOT_SENT'];
const UNCONFIRM_CODES = [
  'CONNECTION_LOST',
  'STATEMENT_NOT_FOUND',
  'OPERATOR_MARKED_UNCONFIRMED',
];

function money(amount: string, currency: string): string {
  if (currency === 'USD') {
    const value = Number(amount);
    return Number.isFinite(value)
      ? new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD' }).format(value)
      : amount;
  }
  return formatVnd(amount);
}

export default function RefundDetailPage() {
  return (
    <RequireAnyPermission permissions={[...REFUND_READ_PERMISSIONS]}>
      <RefundDetailClient />
    </RequireAnyPermission>
  );
}

function RefundDetailClient() {
  const params = useParams<{ id: string }>();
  const { can, permissions, user } = useAuth();
  const [detail, setDetail] = useState<AdminRefundDetail | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [action, setAction] = useState<RefundAdminAction | null>(null);
  const [formError, setFormError] = useState<string | null>(null);
  const [complete, setComplete] = useState({
    bankTransactionReference: '',
    amount: '',
    currency: 'VND',
    transferredAt: '',
    destinationHint: '',
  });
  const [failCode, setFailCode] = useState(FAIL_CODES[0]);
  const [unconfirmCode, setUnconfirmCode] = useState(UNCONFIRM_CODES[2]);
  const [statementRef, setStatementRef] = useState('');

  const load = useCallback(async () => {
    setError(null);
    try {
      const next = await adminApi.getRefundRequest(params.id);
      setDetail(next);
      setComplete((current) => ({
        ...current,
        amount: next.cover.remainingOnRequest || next.amount,
        currency: next.currency,
      }));
    } catch (err) {
      setDetail(null);
      setError(
        err instanceof ApiClientError && err.status === 404
          ? vi.refunds.notFound
          : err instanceof ApiClientError
            ? err.message
            : vi.refunds.detailError,
      );
    }
  }, [params.id]);

  useEffect(() => {
    void load();
  }, [load]);

  const latestAttempt = detail?.attempts[detail.attempts.length - 1] ?? null;
  const actions = useMemo(() => {
    if (!detail) return [];
    return visibleRefundActions(permissions, user?.role, {
      status: detail.status,
      esimGate: detail.esimGate,
      requiresManualReview: detail.requiresManualReview,
      remainingOnRequest: detail.cover.remainingOnRequest,
      latestAttempt,
    });
  }, [detail, permissions, user?.role, latestAttempt]);

  async function runAction() {
    if (!detail || !action) return;
    setFormError(null);
    setBusy(true);
    try {
      if (action === 'approve') await adminApi.approveRefundRequest(detail.id);
      if (action === 'cancel') await adminApi.cancelRefundRequest(detail.id);
      if (action === 'clearEsimReview') await adminApi.clearRefundEsimReview(detail.id);
      if (action === 'execute') await adminApi.executeRefundRequest(detail.id);
      if (action === 'complete') {
        const invalid = validateCompleteRefundForm(complete);
        if (invalid) {
          setFormError(invalid);
          setBusy(false);
          return;
        }
        if (!latestAttempt) throw new Error('missing attempt');
        await adminApi.completeRefundAttempt(latestAttempt.id, {
          ...complete,
          transferredAt: new Date(complete.transferredAt).toISOString(),
        });
      }
      if (action === 'fail') {
        const invalid = validateFailRefundForm(failCode);
        if (invalid) {
          setFormError(invalid);
          setBusy(false);
          return;
        }
        if (!latestAttempt) throw new Error('missing attempt');
        await adminApi.failRefundAttempt(latestAttempt.id, { errorCode: failCode });
      }
      if (action === 'unconfirm') {
        if (!latestAttempt) throw new Error('missing attempt');
        await adminApi.unconfirmRefundAttempt(latestAttempt.id, { errorCode: unconfirmCode });
      }
      if (action === 'reconcileVerified' || action === 'reconcileRejected') {
        const invalid = validateReconcileForm(statementRef);
        if (invalid) {
          setFormError(invalid);
          setBusy(false);
          return;
        }
        if (!latestAttempt) throw new Error('missing attempt');
        await adminApi.reconcileRefundAttempt(latestAttempt.id, {
          decision: action === 'reconcileVerified' ? 'VERIFIED' : 'REJECTED',
          statementEvidenceRef: statementRef.trim(),
        });
      }
      setAction(null);
      await load();
    } catch (err) {
      setFormError(err instanceof ApiClientError ? err.message : vi.app.requestFailed);
    } finally {
      setBusy(false);
    }
  }

  const dialogCopy: Record<Exclude<RefundAdminAction, 'request'>, { title: string; hint: string }> = {
    approve: { title: vi.refunds.approveTitle, hint: 'Duyệt request. Chưa chuyển tiền.' },
    cancel: { title: vi.refunds.cancelTitle, hint: 'Hủy request đang mở.' },
    clearEsimReview: { title: vi.refunds.clearEsimTitle, hint: vi.refunds.clearEsimHint },
    execute: { title: vi.refunds.executeTitle, hint: vi.refunds.executeHint },
    complete: { title: vi.refunds.completeTitle, hint: vi.refunds.completeHint },
    fail: { title: vi.refunds.failTitle, hint: vi.refunds.failHint },
    unconfirm: { title: vi.refunds.unconfirmTitle, hint: vi.refunds.unconfirmHint },
    reconcileVerified: {
      title: vi.refunds.reconcileVerifiedTitle,
      hint: vi.refunds.reconcileHint,
    },
    reconcileRejected: {
      title: vi.refunds.reconcileRejectedTitle,
      hint: vi.refunds.reconcileHint,
    },
  };

  return (
    <div className="space-y-5">
      <PageHeader
        title="Chi tiết hoàn tiền"
        breadcrumbs={[
          { label: vi.refunds.title, href: '/refunds' },
          { label: params.id.slice(0, 8) },
        ]}
      />
      {error ? <ErrorMessage message={error} /> : null}
      {!detail && !error ? <p className="text-slate-500">{vi.app.loading}</p> : null}
      {detail ? (
        <>
          <div className="flex flex-wrap gap-2">
            {actions
              .filter((item) => item !== 'request')
              .map((item) => (
                <Button
                  key={item}
                  type="button"
                  variant={item.startsWith('reconcile') || item === 'fail' ? 'secondary' : 'primary'}
                  onClick={() => {
                    setFormError(null);
                    setAction(item);
                  }}
                >
                  {dialogCopy[item].title}
                </Button>
              ))}
          </div>
          {detail.warnings.length > 0 ? (
            <Card className="border-amber-200 bg-amber-50">
              <ul className="space-y-1 text-sm text-amber-950">
                {detail.warnings.map((code) => (
                  <li key={code}>{vi.refunds.warnings[code]}</li>
                ))}
              </ul>
            </Card>
          ) : null}
          <div className="grid gap-4 lg:grid-cols-2">
            <Card>
              <h2 className="mb-3 font-semibold">Request</h2>
              <dl className="space-y-2 text-sm">
                <Row label="ID" value={detail.id} />
                <Row
                  label="Order"
                  value={
                    <Link className="text-admin-700" href={`/orders/${detail.orderId}`}>
                      {detail.order.orderCode}
                    </Link>
                  }
                />
                <Row label="Payment" value={detail.paymentId} />
                <Row label="Số tiền" value={money(detail.amount, detail.currency)} />
                <Row
                  label="Trạng thái"
                  value={<Badge tone={statusTone(detail.status)} status={detail.status} />}
                />
                <Row
                  label={vi.refunds.intendedMethod}
                  value={
                    vi.refunds.methods[detail.intendedMethod as keyof typeof vi.refunds.methods] ??
                    detail.intendedMethod
                  }
                />
                <Row label="eSIM gate" value={detail.esimGate} />
                <Row label="Lý do" value={detail.reason} />
                <Row label={vi.refunds.approver} value={detail.approvedBy?.email ?? '—'} />
                <Row label="Người tạo" value={detail.requestedBy?.email ?? '—'} />
              </dl>
            </Card>
            <Card>
              <h2 className="mb-3 font-semibold">Payment đã thu</h2>
              <dl className="space-y-2 text-sm">
                <Row label="Gateway" value={detail.payment.gateway} />
                <Row label="Tham chiếu" value={detail.payment.paymentReference} />
                <Row
                  label="Đã thu"
                  value={money(detail.payment.amount, detail.currency)}
                />
                <Row
                  label="Order payment"
                  value={
                    <Badge
                      tone={statusTone(detail.order.paymentStatus)}
                      status={detail.order.paymentStatus}
                    />
                  }
                />
                <Row label={vi.refunds.coverSucceeded} value={money(detail.cover.succeeded, detail.currency)} />
                <Row label={vi.refunds.coverReserved} value={money(detail.cover.reserved, detail.currency)} />
                <Row
                  label={vi.refunds.coverRemaining}
                  value={money(detail.cover.remainingRefundable, detail.currency)}
                />
                <Row
                  label={vi.refunds.remainingOnRequest}
                  value={money(detail.cover.remainingOnRequest, detail.currency)}
                />
              </dl>
            </Card>
          </div>
          <Card>
            <h2 className="mb-3 font-semibold">Attempts</h2>
            <div className="space-y-3">
              {detail.attempts.length === 0 ? (
                <p className="text-sm text-slate-500">{vi.common.noData}</p>
              ) : (
                detail.attempts.map((attempt) => (
                  <div key={attempt.id} className="rounded-lg border border-slate-200 p-3 text-sm">
                    <div className="flex flex-wrap items-center gap-2">
                      <Badge tone={statusTone(attempt.status)} status={attempt.status} />
                      <Badge
                        tone={attempt.reconVerified ? 'success' : 'warning'}
                        status={attempt.reconStatus}
                      />
                      {attempt.payoutRecorded && !attempt.reconVerified ? (
                        <span className="text-xs text-amber-800">
                          {vi.refunds.payoutNotReconciled}
                        </span>
                      ) : null}
                    </div>
                    <p className="mt-2">{money(attempt.amount, attempt.currency)}</p>
                    <p className="text-xs text-slate-500">
                      {vi.refunds.bankRef}: {attempt.bankTransactionReference ?? '—'}
                    </p>
                    <p className="text-xs text-slate-500">
                      {vi.refunds.destinationHint}: {attempt.destinationHint ?? '—'}
                    </p>
                    <p className="text-xs text-slate-500">
                      {vi.refunds.executor}: {attempt.executedBy?.email ?? '—'} ·{' '}
                      {formatDateTime(attempt.createdAt)}
                    </p>
                  </div>
                ))
              )}
            </div>
          </Card>
          <Card>
            <h2 className="mb-3 font-semibold">Audit</h2>
            <ul className="space-y-2 text-sm">
              {detail.auditEvents.map((event) => (
                <li key={event.id} className="rounded-lg bg-slate-50 p-3">
                  <p className="font-medium">{event.action}</p>
                  <p className="text-xs text-slate-500">
                    {event.createdAt ? formatDateTime(event.createdAt) : '—'}
                  </p>
                  <p className="text-xs text-slate-600">
                    {Object.entries(event.metadata)
                      .map(([key, value]) => `${key}=${String(value)}`)
                      .join(' · ')}
                  </p>
                </li>
              ))}
            </ul>
          </Card>
          <Dialog
            open={action != null && action !== 'request'}
            onClose={() => setAction(null)}
            title={action && action !== 'request' ? dialogCopy[action].title : ''}
            description={action && action !== 'request' ? dialogCopy[action].hint : undefined}
            footer={
              <>
                <Button type="button" variant="secondary" onClick={() => setAction(null)}>
                  {vi.app.cancel}
                </Button>
                <Button type="button" disabled={busy} onClick={() => void runAction()}>
                  Xác nhận
                </Button>
              </>
            }
          >
            {formError ? <ErrorMessage message={formError} /> : null}
            {action === 'complete' ? (
              <div className="space-y-3">
                <Input
                  placeholder={vi.refunds.bankRef}
                  value={complete.bankTransactionReference}
                  onChange={(e) =>
                    setComplete({ ...complete, bankTransactionReference: e.target.value })
                  }
                />
                <Input
                  placeholder="Amount"
                  value={complete.amount}
                  onChange={(e) => setComplete({ ...complete, amount: e.target.value })}
                />
                <Select
                  value={complete.currency}
                  onChange={(e) => setComplete({ ...complete, currency: e.target.value })}
                >
                  <option value="VND">VND</option>
                  <option value="USD">USD</option>
                </Select>
                <Input
                  type="datetime-local"
                  value={complete.transferredAt}
                  onChange={(e) => setComplete({ ...complete, transferredAt: e.target.value })}
                />
                <Input
                  placeholder="VCB ****1234"
                  value={complete.destinationHint}
                  onChange={(e) => setComplete({ ...complete, destinationHint: e.target.value })}
                />
              </div>
            ) : null}
            {action === 'fail' ? (
              <Select value={failCode} onChange={(e) => setFailCode(e.target.value)}>
                {FAIL_CODES.map((code) => (
                  <option key={code} value={code}>
                    {code}
                  </option>
                ))}
              </Select>
            ) : null}
            {action === 'unconfirm' ? (
              <Select value={unconfirmCode} onChange={(e) => setUnconfirmCode(e.target.value)}>
                {UNCONFIRM_CODES.map((code) => (
                  <option key={code} value={code}>
                    {code}
                  </option>
                ))}
              </Select>
            ) : null}
            {action === 'reconcileVerified' || action === 'reconcileRejected' ? (
              <Input
                placeholder={vi.refunds.statementRef}
                value={statementRef}
                onChange={(e) => setStatementRef(e.target.value)}
              />
            ) : null}
          </Dialog>
        </>
      ) : null}
      {!can('refund.execute') && !can('refund.approve') && !can('refund.reconcile') ? (
        <p className="text-xs text-slate-500">Chỉ xem. Các thao tác ghi cần quyền riêng.</p>
      ) : null}
    </div>
  );
}

function Row({ label, value }: { label: string; value: ReactNode }) {
  return (
    <div className="flex justify-between gap-4">
      <dt className="text-slate-500">{label}</dt>
      <dd className="text-right text-slate-900">{value}</dd>
    </div>
  );
}
