'use client';

import Link from 'next/link';
import { useCallback, useEffect, useMemo, useState } from 'react';
import { RequireAnyPermission } from '@/components/layout/AdminShell';
import { Badge, Card, ErrorMessage, statusTone } from '@/components/ui/Display';
import { Dialog } from '@/components/ui/Dialog';
import { Button, Input, Select } from '@/components/ui/Form';
import { PageHeader } from '@/components/ui/PageHeader';
import { Table, TableEmpty, TableSkeleton, TBody, TD, TH, THead, TR } from '@/components/ui/Table';
import { useAuth } from '@/hooks/useAuth';
import { REFUND_READ_PERMISSIONS } from '@/lib/refund-admin-actions';
import { vi } from '@/lib/i18n/vi';
import { formatDateTime, formatVnd } from '@/lib/utils';
import { adminApi, ApiClientError } from '@/services/api-client';
import type { AdminRefundListItem, AdminRefundListResponse } from '@/types/api';

const REQUEST_STATUSES = [
  '',
  'REQUESTED',
  'APPROVED',
  'PROCESSING',
  'SUCCEEDED',
  'MANUAL_REVIEW',
  'CANCELLED',
];
const ATTEMPT_STATUSES = ['', 'SENT', 'SUCCEEDED', 'FAILED', 'UNCONFIRMED'];
const ESIM_GATES = ['', 'NONE', 'CREATE_UNCLEAR', 'HAS_REFERENCE', 'ISSUED'];
const PAGE_SIZE = 20;

function money(amount: string, currency: string): string {
  if (currency === 'USD') {
    const value = Number(amount);
    return Number.isFinite(value)
      ? new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD' }).format(value)
      : amount;
  }
  return formatVnd(amount);
}

function reconLabel(item: AdminRefundListItem): string {
  if (!item.latestReconStatus) return '—';
  if (item.payoutRecorded && !item.reconVerified) {
    return vi.refunds.payoutNotReconciled;
  }
  if (item.reconVerified) return vi.refunds.reconVerified;
  return item.latestReconStatus;
}

export default function RefundsListPage() {
  return (
    <RequireAnyPermission permissions={[...REFUND_READ_PERMISSIONS]}>
      <RefundsListClient />
    </RequireAnyPermission>
  );
}

function RefundsListClient() {
  const { can } = useAuth();
  const [data, setData] = useState<AdminRefundListResponse | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [skip, setSkip] = useState(0);
  const [draft, setDraft] = useState({
    q: '',
    orderId: '',
    paymentId: '',
    requestStatus: '',
    attemptStatus: '',
    esimGate: '',
    dateFrom: '',
    dateTo: '',
    needsAction: false,
  });
  const [applied, setApplied] = useState(draft);
  const [createOpen, setCreateOpen] = useState(false);
  const [createForm, setCreateForm] = useState({
    orderId: '',
    paymentId: '',
    amount: '',
    reason: '',
  });
  const [createError, setCreateError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  const query = useMemo(
    () => ({
      skip,
      take: PAGE_SIZE,
      q: applied.q.trim() || undefined,
      orderId: applied.orderId.trim() || undefined,
      paymentId: applied.paymentId.trim() || undefined,
      requestStatus: applied.requestStatus || undefined,
      attemptStatus: applied.attemptStatus || undefined,
      esimGate: applied.esimGate || undefined,
      dateFrom: applied.dateFrom || undefined,
      dateTo: applied.dateTo || undefined,
      needsAction: applied.needsAction || undefined,
    }),
    [skip, applied],
  );

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      setData(await adminApi.listRefundRequests(query));
    } catch (err) {
      setError(err instanceof ApiClientError ? err.message : vi.refunds.loadError);
    } finally {
      setLoading(false);
    }
  }, [query]);

  useEffect(() => {
    void load();
  }, [load]);

  function applyFilters() {
    setSkip(0);
    setApplied(draft);
  }

  async function createRequest() {
    setCreateError(null);
    if (!createForm.orderId.trim() || !createForm.paymentId.trim() || !createForm.amount.trim()) {
      setCreateError('Cần Order ID, Payment ID và số tiền.');
      return;
    }
    if (!window.confirm(vi.refunds.createHint)) return;
    setSaving(true);
    try {
      await adminApi.createRefundRequest(createForm.orderId.trim(), {
        paymentId: createForm.paymentId.trim(),
        amount: createForm.amount.trim(),
        reason: createForm.reason.trim() || 'Admin requested refund',
      });
      setCreateOpen(false);
      await load();
    } catch (err) {
      setCreateError(err instanceof ApiClientError ? err.message : vi.app.requestFailed);
    } finally {
      setSaving(false);
    }
  }

  const total = data?.total ?? 0;
  const page = Math.floor(skip / PAGE_SIZE) + 1;
  const pageCount = Math.max(1, Math.ceil(total / PAGE_SIZE));

  return (
    <div className="space-y-5">
      <PageHeader
        title={vi.refunds.title}
        subtitle={vi.refunds.subtitle}
        actions={
          can('refund.request') ? (
            <Button type="button" onClick={() => setCreateOpen(true)}>
              {vi.refunds.createTitle}
            </Button>
          ) : null
        }
      />
      {error ? <ErrorMessage message={error} /> : null}
      <Card>
        <div className="grid gap-3 md:grid-cols-3 xl:grid-cols-4">
          <Input
            placeholder="ID (UUID chính xác)"
            value={draft.q}
            onChange={(e) => setDraft({ ...draft, q: e.target.value })}
          />
          <Input
            placeholder="Order ID"
            value={draft.orderId}
            onChange={(e) => setDraft({ ...draft, orderId: e.target.value })}
          />
          <Input
            placeholder="Payment ID"
            value={draft.paymentId}
            onChange={(e) => setDraft({ ...draft, paymentId: e.target.value })}
          />
          <Select
            value={draft.requestStatus}
            onChange={(e) => setDraft({ ...draft, requestStatus: e.target.value })}
          >
            {REQUEST_STATUSES.map((value) => (
              <option key={value || 'all'} value={value}>
                {value ? value : vi.refunds.requestStatus}
              </option>
            ))}
          </Select>
          <Select
            value={draft.attemptStatus}
            onChange={(e) => setDraft({ ...draft, attemptStatus: e.target.value })}
          >
            {ATTEMPT_STATUSES.map((value) => (
              <option key={value || 'all'} value={value}>
                {value ? value : vi.refunds.attemptStatus}
              </option>
            ))}
          </Select>
          <Select
            value={draft.esimGate}
            onChange={(e) => setDraft({ ...draft, esimGate: e.target.value })}
          >
            {ESIM_GATES.map((value) => (
              <option key={value || 'all'} value={value}>
                {value ? value : vi.refunds.esimGate}
              </option>
            ))}
          </Select>
          <Input
            type="date"
            value={draft.dateFrom}
            onChange={(e) => setDraft({ ...draft, dateFrom: e.target.value })}
          />
          <Input
            type="date"
            value={draft.dateTo}
            onChange={(e) => setDraft({ ...draft, dateTo: e.target.value })}
          />
        </div>
        <div className="mt-3 flex flex-wrap items-center gap-3">
          <label className="flex items-center gap-2 text-sm text-slate-700">
            <input
              type="checkbox"
              checked={draft.needsAction}
              onChange={(e) => setDraft({ ...draft, needsAction: e.target.checked })}
            />
            {vi.refunds.needsAction}
          </label>
          <Button type="button" variant="secondary" onClick={applyFilters}>
            {vi.app.filter}
          </Button>
        </div>
      </Card>
      <Card>
        {loading ? (
          <Table>
            <TBody>
              <TableSkeleton colSpan={8} rows={6} />
            </TBody>
          </Table>
        ) : !data?.items.length ? (
          <TableEmpty colSpan={8} message={vi.common.noData} />
        ) : (
          <Table>
            <THead>
              <TR>
                <TH>Request</TH>
                <TH>Order / Payment</TH>
                <TH>Số tiền</TH>
                <TH>Request</TH>
                <TH>Attempt / đối soát</TH>
                <TH>eSIM</TH>
                <TH>Người</TH>
                <TH />
              </TR>
            </THead>
            <TBody>
              {data.items.map((item) => (
                <TR key={item.id}>
                  <TD>
                    <Link className="font-medium text-admin-700" href={`/refunds/${item.id}`}>
                      {item.id.slice(0, 8)}
                    </Link>
                    <p className="text-xs text-slate-500">
                      {item.requestedAt ? formatDateTime(item.requestedAt) : '—'}
                    </p>
                  </TD>
                  <TD>
                    <p>{item.orderCode ?? item.orderId.slice(0, 8)}</p>
                    <p className="text-xs text-slate-500">{item.paymentId.slice(0, 8)}</p>
                  </TD>
                  <TD>
                    {money(item.amount, item.currency)}
                    <p className="text-xs text-slate-500">{item.intendedMethod}</p>
                  </TD>
                  <TD>
                    <Badge tone={statusTone(item.status)} status={item.status} />
                  </TD>
                  <TD>
                    {item.latestAttemptStatus ? (
                      <Badge
                        tone={item.reconVerified ? 'success' : item.payoutRecorded ? 'warning' : statusTone(item.latestAttemptStatus)}
                        status={item.latestAttemptStatus}
                      />
                    ) : (
                      '—'
                    )}
                    <p className="mt-1 text-xs text-slate-500">{reconLabel(item)}</p>
                  </TD>
                  <TD>
                    {item.requiresManualReview ? (
                      <Badge tone="warning">{item.esimGate}</Badge>
                    ) : (
                      item.esimGate
                    )}
                  </TD>
                  <TD>
                    <p className="text-xs">{item.approvedBy?.email ?? item.requestedBy?.email ?? '—'}</p>
                    <p className="text-xs text-slate-500">{item.executedBy?.email ?? ''}</p>
                  </TD>
                  <TD>
                    <Link className="text-sm font-medium text-admin-700" href={`/refunds/${item.id}`}>
                      {vi.common.detail}
                    </Link>
                  </TD>
                </TR>
              ))}
            </TBody>
          </Table>
        )}
        <div className="mt-4 flex items-center justify-between text-sm text-slate-600">
          <span>
            {total} {vi.common.results} · {vi.common.page} {page}/{pageCount}
          </span>
          <div className="flex gap-2">
            <Button
              type="button"
              variant="secondary"
              size="sm"
              disabled={skip === 0}
              onClick={() => setSkip(Math.max(0, skip - PAGE_SIZE))}
            >
              {vi.common.prev}
            </Button>
            <Button
              type="button"
              variant="secondary"
              size="sm"
              disabled={skip + PAGE_SIZE >= total}
              onClick={() => setSkip(skip + PAGE_SIZE)}
            >
              {vi.common.next}
            </Button>
          </div>
        </div>
      </Card>
      <Dialog
        open={createOpen}
        onClose={() => setCreateOpen(false)}
        title={vi.refunds.createTitle}
        description={vi.refunds.createHint}
        footer={
          <>
            <Button type="button" variant="secondary" onClick={() => setCreateOpen(false)}>
              {vi.app.cancel}
            </Button>
            <Button type="button" disabled={saving} onClick={() => void createRequest()}>
              {vi.refunds.createTitle}
            </Button>
          </>
        }
      >
        <div className="space-y-3">
          {createError ? <ErrorMessage message={createError} /> : null}
          <Input
            placeholder="Order ID"
            value={createForm.orderId}
            onChange={(e) => setCreateForm({ ...createForm, orderId: e.target.value })}
          />
          <Input
            placeholder="Payment ID"
            value={createForm.paymentId}
            onChange={(e) => setCreateForm({ ...createForm, paymentId: e.target.value })}
          />
          <Input
            placeholder="Amount"
            value={createForm.amount}
            onChange={(e) => setCreateForm({ ...createForm, amount: e.target.value })}
          />
          <Input
            placeholder="Reason"
            value={createForm.reason}
            onChange={(e) => setCreateForm({ ...createForm, reason: e.target.value })}
          />
        </div>
      </Dialog>
    </div>
  );
}
