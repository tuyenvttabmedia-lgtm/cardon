'use client';



import { useEffect, useState } from 'react';

import { RequirePermission } from '@/components/layout/AdminShell';

import { Badge, Card, ErrorMessage, statusTone } from '@/components/ui/Display';

import { Button, Input, Select } from '@/components/ui/Form';

import { useToast } from '@/components/ui/Toast';

import { useAuth } from '@/hooks/useAuth';

import { vi } from '@/lib/i18n/vi';

import { adminApi, ApiClientError } from '@/services/api-client';

import { formatDateTime, formatVnd } from '@/lib/utils';

import type { AdminPayment, ManualReviewPayment, WebhookLog } from '@/types/api';



const GATEWAYS = ['MEGAPAY', 'SEPAY'] as const;

const PAYMENT_STATUSES = ['PENDING', 'SUCCESS', 'FAILED', 'EXPIRED'] as const;



export default function PaymentsPage() {

  const { can } = useAuth();

  const toast = useToast();

  const canReview = can('payments.review');

  const [payments, setPayments] = useState<ManualReviewPayment[]>([]);

  const [webhooks, setWebhooks] = useState<WebhookLog[]>([]);

  const [allPayments, setAllPayments] = useState<AdminPayment[]>([]);

  const [total, setTotal] = useState(0);

  const [skip, setSkip] = useState(0);

  const [loading, setLoading] = useState(false);

  const [filters, setFilters] = useState({

    gateway: '',

    status: '',

    dateFrom: '',

    dateTo: '',

    amount: '',

  });

  const [error, setError] = useState<string | null>(null);

  const take = 20;



  async function loadReview() {

    const data = await adminApi.getManualReviewPayments();

    setPayments(data.payments);

    setWebhooks(data.unknownWebhooks);

  }



  async function loadAll() {

    const data = await adminApi.listPayments({

      skip,

      take,

      gateway: filters.gateway || undefined,

      status: filters.status || undefined,

      dateFrom: filters.dateFrom || undefined,

      dateTo: filters.dateTo || undefined,

      amount: filters.amount || undefined,

    });

    setAllPayments(data.items);

    setTotal(data.total);

  }



  async function load(showToast = false) {

    setLoading(true);

    setError(null);

    try {

      if (canReview) {

        await Promise.all([loadReview(), loadAll()]);

      } else {

        await loadAll();

      }

      if (showToast) toast.success(vi.payments.refreshed);

    } catch (err) {

      const message = err instanceof ApiClientError ? err.message : vi.payments.loadError;

      setError(message);

      if (showToast) toast.error(vi.payments.refreshFailed);

    } finally {

      setLoading(false);

    }

  }



  useEffect(() => {

    void load();

  }, [skip]);



  async function resolve(id: string, action: 'approve' | 'reject') {

    try {

      await adminApi.resolvePayment(id, action);

      await load();

    } catch (err) {

      setError(err instanceof ApiClientError ? err.message : vi.payments.actionFailed);

    }

  }



  return (

    <div className="space-y-6">

      <h1 className="text-2xl font-bold">{vi.payments.title}</h1>

      {error && <ErrorMessage message={error} />}



      <RequirePermission permission="payments.view">

        <Card>

          <h2 className="font-semibold">{vi.payments.listTitle}</h2>

          <div className="mt-4 grid gap-2 md:grid-cols-5">

            <Select value={filters.gateway} onChange={(e) => setFilters({ ...filters, gateway: e.target.value })}>

              <option value="">{vi.payments.gateway}</option>

              {GATEWAYS.map((g) => (

                <option key={g} value={g}>

                  {vi.status[g]}

                </option>

              ))}

            </Select>

            <Select value={filters.status} onChange={(e) => setFilters({ ...filters, status: e.target.value })}>

              <option value="">{vi.payments.status}</option>

              {PAYMENT_STATUSES.map((s) => (

                <option key={s} value={s}>

                  {vi.status[s]}

                </option>

              ))}

            </Select>

            <Input type="date" value={filters.dateFrom} onChange={(e) => setFilters({ ...filters, dateFrom: e.target.value })} />

            <Input type="date" value={filters.dateTo} onChange={(e) => setFilters({ ...filters, dateTo: e.target.value })} />

            <Input placeholder={vi.payments.amount} value={filters.amount} onChange={(e) => setFilters({ ...filters, amount: e.target.value })} />

          </div>

          <div className="mt-3 flex gap-2">

            <Button size="sm" disabled={loading} onClick={() => { setSkip(0); void load(); }}>

              {vi.app.filter}

            </Button>

            <Button size="sm" variant="secondary" disabled={loading} onClick={() => void load(true)}>

              {loading ? vi.app.loading : vi.app.refresh}

            </Button>

          </div>

          {allPayments.length === 0 ? (

            <p className="mt-4 text-sm text-zinc-500">{vi.payments.noPayments}</p>

          ) : (

            <div className="mt-4 overflow-x-auto">

              <table className="w-full text-sm">

                <thead>

                  <tr className="border-b text-left text-zinc-500">

                    <th className="py-2">{vi.payments.reference}</th>

                    <th>{vi.payments.gateway}</th>

                    <th>{vi.payments.amount}</th>

                    <th>Gateway ref</th>

                    <th>Bank ref</th>

                    <th>Settlement</th>

                    <th>Reconciliation</th>

                    <th>{vi.payments.status}</th>

                    <th>{vi.common.created}</th>

                  </tr>

                </thead>

                <tbody>

                  {allPayments.map((p) => (

                    <tr key={p.id} className="border-b border-zinc-50">

                      <td className="py-2 font-mono">{p.paymentReference}</td>

                      <td>

                        <Badge status={p.gateway} />

                      </td>

                      <td>{formatVnd(p.amount)}</td>

                      <td className="font-mono text-xs">{p.gatewayTransactionId ?? '—'}</td>

                      <td className="font-mono text-xs">{p.bankReference ?? p.bankTransactionId ?? '—'}</td>

                      <td>{p.settlementDate ? formatDateTime(p.settlementDate) : '—'}</td>

                      <td>

                        <Badge
                          tone={
                            p.reconciliationStatus === 'MATCHED'
                              ? 'success'
                              : p.reconciliationStatus === 'MANUAL_REVIEW' || p.reconciliationStatus === 'DIFFERENCE'
                                ? 'warning'
                                : 'default'
                          }
                        >
                          {p.reconciliationStatus}
                        </Badge>

                      </td>

                      <td>

                        <Badge tone={statusTone(p.status)} status={p.status} />

                      </td>

                      <td>{formatDateTime(p.createdAt)}</td>

                    </tr>

                  ))}

                </tbody>

              </table>

            </div>

          )}

          <div className="mt-4 flex items-center justify-between text-sm">

            <span>

              {total} {vi.common.results} · {vi.common.page} {Math.floor(skip / take) + 1}

            </span>

            <div className="flex gap-2">

              <Button size="sm" variant="secondary" disabled={skip === 0} onClick={() => setSkip(Math.max(0, skip - take))}>

                {vi.common.prev}

              </Button>

              <Button size="sm" variant="secondary" disabled={skip + take >= total} onClick={() => setSkip(skip + take)}>

                {vi.common.next}

              </Button>

            </div>

          </div>

        </Card>

      </RequirePermission>



      {canReview && (

        <RequirePermission permission="payments.review">

          <Card>

            <h2 className="font-semibold">{vi.payments.manualReview}</h2>

            {payments.length === 0 ? (

              <p className="mt-4 text-sm text-zinc-500">{vi.payments.noReview}</p>

            ) : (

              <div className="mt-4 space-y-4">

                {payments.map((p) => (

                  <div key={p.id} className="rounded-xl border border-zinc-100 p-4">

                    <div className="flex flex-wrap items-start justify-between gap-4">

                      <div>

                        <p className="font-mono text-sm">{p.paymentReference}</p>

                        <p className="text-sm text-zinc-500">

                          {vi.status[p.gateway as keyof typeof vi.status] ?? p.gateway} · {formatVnd(p.amount)} ·{' '}

                          {p.order.orderCode}

                        </p>

                        <p className="text-xs text-zinc-400">{formatDateTime(p.updatedAt)}</p>

                      </div>

                      <Badge tone={statusTone(p.status)} status={p.status} />

                    </div>

                    <div className="mt-3 flex gap-2">

                      <Button size="sm" onClick={() => void resolve(p.id, 'approve')}>

                        {vi.payments.approve}

                      </Button>

                      <Button size="sm" variant="danger" onClick={() => void resolve(p.id, 'reject')}>

                        {vi.payments.reject}

                      </Button>

                    </div>

                  </div>

                ))}

              </div>

            )}

          </Card>

          <Card>

            <h2 className="font-semibold">{vi.payments.unknownWebhooks}</h2>

            {webhooks.length === 0 ? (

              <p className="mt-4 text-sm text-zinc-500">{vi.payments.noWebhooks}</p>

            ) : (

              <ul className="mt-4 space-y-2 text-sm">

                {webhooks.map((w) => (

                  <li key={w.id} className="rounded-lg bg-zinc-50 p-3">

                    {w.source} · {w.paymentReference ?? '—'} · {formatDateTime(w.createdAt)}

                  </li>

                ))}

              </ul>

            )}

          </Card>

        </RequirePermission>

      )}

    </div>

  );

}

