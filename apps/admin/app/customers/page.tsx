'use client';



import { useSearchParams } from 'next/navigation';

import { Suspense, useEffect, useState } from 'react';

import Link from 'next/link';

import { RequirePermission } from '@/components/layout/AdminShell';

import { Badge, Card, ErrorMessage, statusTone } from '@/components/ui/Display';

import { Button, Input } from '@/components/ui/Form';

import { useToast } from '@/components/ui/Toast';

import { useAuth } from '@/hooks/useAuth';

import { vi } from '@/lib/i18n/vi';

import { formatDateTime, formatVnd } from '@/lib/utils';

import { adminApi, ApiClientError } from '@/services/api-client';

import type { AdminCustomer, AdminCustomerDetail } from '@/types/api';



type ResetResult =

  | { mode: 'link'; email: string; resetLink: string; message: string }

  | { mode: 'temp'; email: string; tempPassword: string; message: string };



function CustomersPageInner() {

  const searchParams = useSearchParams();

  const selectedId = searchParams.get('id');

  const { can } = useAuth();

  const toast = useToast();

  const [customers, setCustomers] = useState<AdminCustomer[]>([]);

  const [detail, setDetail] = useState<AdminCustomerDetail | null>(null);

  const [orderSkip, setOrderSkip] = useState(0);

  const [orderTake, setOrderTake] = useState(10);

  const [q, setQ] = useState('');

  const [error, setError] = useState<string | null>(null);

  const [resetResult, setResetResult] = useState<ResetResult | null>(null);



  async function loadList() {

    try {

      setCustomers(await adminApi.listCustomers({ q: q || undefined, take: 50 }));

    } catch (err) {

      setError(err instanceof ApiClientError ? err.message : vi.customers.loadError);

    }

  }



  async function loadDetail(id: string, skip = orderSkip, take = orderTake) {

    try {

      setDetail(await adminApi.getCustomer(id, { orderSkip: skip, orderTake: take }));

    } catch (err) {

      setError(err instanceof ApiClientError ? err.message : vi.customers.loadError);

    }

  }



  useEffect(() => {

    void loadList();

  }, []);



  useEffect(() => {
    setOrderSkip(0);
  }, [selectedId]);

  useEffect(() => {
    if (!selectedId) return;
    void loadDetail(selectedId, orderSkip, orderTake);
  }, [selectedId, orderSkip, orderTake]);



  async function toggleLock() {

    if (!detail) return;

    const isActive = detail.profile.status === 'ACTIVE';

    if (!window.confirm(isActive ? vi.customers.lockConfirm : vi.customers.unlockConfirm)) return;

    try {

      if (isActive) {

        await adminApi.lockCustomer(detail.profile.id);

        toast.success(vi.customers.locked);

      } else {

        await adminApi.unlockCustomer(detail.profile.id);

        toast.success(vi.customers.unlocked);

      }

      await loadDetail(detail.profile.id);

      await loadList();

    } catch (err) {

      toast.error(err instanceof ApiClientError ? err.message : vi.app.requestFailed);

    }

  }



  async function resetPassword(mode: 'link' | 'temp' = 'link') {

    if (!detail) return;

    try {

      const result = await adminApi.resetCustomerPassword(detail.profile.id, mode);

      setResetResult(result);

      toast.success(vi.customers.resetSuccess);

    } catch (err) {

      toast.error(err instanceof ApiClientError ? err.message : vi.customers.resetFailed);

    }

  }



  function copyResetLink(link: string) {

    void navigator.clipboard.writeText(link);

    toast.success(vi.customers.copyLink);

  }



  return (

    <RequirePermission permission="customers.read">

      <div className="space-y-6">

        <h1 className="text-2xl font-bold">{vi.customers.title}</h1>

        {error && <ErrorMessage message={error} />}

        <Card className="flex gap-2 p-4">

          <Input

            placeholder={vi.customers.searchPlaceholder}

            value={q}

            onChange={(e) => setQ(e.target.value)}

          />

          <Button onClick={() => void loadList()}>{vi.customers.search}</Button>

        </Card>

        <div className="grid gap-6 lg:grid-cols-2">

          <Card className="overflow-x-auto p-4">

            <table className="w-full text-sm">

              <thead>

                <tr className="border-b">

                  <th className="py-2 text-left">{vi.customers.email}</th>

                  <th>{vi.customers.status}</th>

                </tr>

              </thead>

              <tbody>

                {customers.map((c) => (

                  <tr key={c.id} className="border-b">

                    <td className="py-2">

                      <Link href={`/customers?id=${c.id}`} className="text-admin-600 hover:underline">

                        {c.email}

                      </Link>

                    </td>

                    <td>

                      <Badge tone={statusTone(c.status)} status={c.status} />

                    </td>

                  </tr>

                ))}

              </tbody>

            </table>

          </Card>

          {detail && (

            <Card className="space-y-3 p-4">

              <h2 className="font-semibold">{detail.profile.fullName ?? detail.profile.email}</h2>

              <p>

                {vi.customers.username}: {detail.profile.username ?? '—'}

              </p>

              <p>

                {vi.customers.phone}: {detail.profile.phone ?? '—'}

              </p>

              <p>

                {vi.customers.status}:{' '}

                <Badge tone={statusTone(detail.profile.status)} status={detail.profile.status} />

              </p>

              <p>

                {vi.customers.totalSpending}: {formatVnd(detail.totalSpending)}

              </p>

              <p>

                {vi.customers.lastLogin}:{' '}

                {detail.profile.lastLoginAt ? formatDateTime(detail.profile.lastLoginAt) : '—'}

              </p>

              {can('customers.manage') && (

                <div className="flex flex-wrap gap-2">

                  <Button size="sm" onClick={() => void toggleLock()}>

                    {detail.profile.status === 'ACTIVE' ? vi.customers.lock : vi.customers.unlock}

                  </Button>

                  <Button size="sm" variant="secondary" onClick={() => void resetPassword('link')}>

                    {vi.customers.resetPassword}

                  </Button>

                </div>

              )}

              <h3 className="pt-2 font-medium">{vi.customers.recentOrders}</h3>

              <div className="max-h-72 space-y-2 overflow-y-auto pr-1">

                {detail.orders.map((o) => (

                  <div key={o.id} className="text-sm">

                    <Link href={`/orders/${o.id}`} className="text-admin-600 hover:underline">

                      {o.orderCode}

                    </Link>{' '}

                    — {formatVnd(String(o.totalAmount))}

                  </div>

                ))}

                {detail.orders.length === 0 && (

                  <p className="text-sm text-zinc-500">Chưa có đơn hàng.</p>

                )}

              </div>

              {detail.ordersTotal > 0 && (

                <div className="flex flex-wrap items-center justify-between gap-2 border-t pt-3 text-sm">

                  <label className="inline-flex items-center gap-2 text-zinc-600">

                    <span>{vi.customers.ordersPerPage}</span>

                    <select

                      value={orderTake}

                      onChange={(e) => {

                        setOrderTake(Number(e.target.value));

                        setOrderSkip(0);

                      }}

                      className="rounded border border-zinc-200 px-2 py-1"

                    >

                      {[10, 20, 50].map((size) => (

                        <option key={size} value={size}>

                          {size}

                        </option>

                      ))}

                    </select>

                  </label>

                  {detail.ordersTotal > orderTake && (

                    <div className="flex items-center gap-2">

                      <Button

                        size="sm"

                        variant="ghost"

                        disabled={orderSkip === 0}

                        onClick={() => setOrderSkip(Math.max(0, orderSkip - orderTake))}

                      >

                        {vi.customers.prevPage}

                      </Button>

                      <span className="text-zinc-600">

                        {Math.floor(orderSkip / orderTake) + 1}/

                        {Math.max(1, Math.ceil(detail.ordersTotal / orderTake))} ({detail.ordersTotal})

                      </span>

                      <Button

                        size="sm"

                        variant="ghost"

                        disabled={orderSkip + orderTake >= detail.ordersTotal}

                        onClick={() => setOrderSkip(orderSkip + orderTake)}

                      >

                        {vi.customers.nextPage}

                      </Button>

                    </div>

                  )}

                </div>

              )}

              {detail.profile.email && (

                <Link

                  href={`/orders?q=${encodeURIComponent(detail.profile.email)}`}

                  className="inline-block text-sm text-admin-600 hover:underline"

                >

                  {vi.customers.viewAllOrders}

                </Link>

              )}

            </Card>

          )}

        </div>



        {resetResult && (

          <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4">

            <Card className="w-full max-w-md space-y-4">

              <h2 className="font-semibold">{vi.customers.resetPassword}</h2>

              <p className="text-sm text-zinc-600">{resetResult.email}</p>

              {resetResult.mode === 'link' ? (

                <div className="space-y-2">

                  <p className="text-sm font-medium">{vi.customers.resetLink}</p>

                  <Input readOnly value={resetResult.resetLink} className="font-mono text-xs" />

                  <Button size="sm" onClick={() => copyResetLink(resetResult.resetLink)}>

                    {vi.customers.copyLink}

                  </Button>

                </div>

              ) : (

                <div className="space-y-2">

                  <p className="text-sm font-medium">{vi.customers.tempPassword}</p>

                  <Input readOnly value={resetResult.tempPassword} className="font-mono" />

                </div>

              )}

              <Button variant="secondary" onClick={() => setResetResult(null)}>

                {vi.customers.close}

              </Button>

            </Card>

          </div>

        )}

      </div>

    </RequirePermission>

  );

}



export default function CustomersPage() {

  return (

    <Suspense>

      <CustomersPageInner />

    </Suspense>

  );

}

