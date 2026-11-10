'use client';

import { usePathname, useRouter, useSearchParams } from 'next/navigation';
import { useCallback, useEffect, useMemo, useState } from 'react';
import { RequirePermission } from '@/components/layout/AdminShell';
import { CustomerDetailPanel, type CustomerDetailTab } from '@/components/customers/CustomerDetailPanel';
import { CustomersListPanel } from '@/components/customers/CustomersListPanel';
import { Dialog } from '@/components/ui/Dialog';
import { Card, ErrorMessage } from '@/components/ui/Display';
import { Button, Input, Label, Select } from '@/components/ui/Form';
import { PageHeader } from '@/components/ui/PageHeader';
import { useToast } from '@/components/ui/Toast';
import { useAuth } from '@/hooks/useAuth';
import { vi } from '@/lib/i18n/vi';
import { cn } from '@/lib/utils';
import { adminApi, ApiClientError } from '@/services/api-client';
import type { AdminCustomer, AdminCustomerDetail } from '@/types/api';

type ResetResult =
  | { mode: 'link'; email: string; resetLink: string; message: string }
  | { mode: 'temp'; email: string; tempPassword: string; message: string };

const STATUS_OPTIONS = [
  { value: '', label: vi.customers.allStatuses },
  { value: 'ACTIVE', label: 'ACTIVE' },
  { value: 'SUSPENDED', label: 'SUSPENDED' },
  { value: 'BANNED', label: 'BANNED' },
];

export function CustomersPageClient() {
  const searchParams = useSearchParams();
  const router = useRouter();
  const pathname = usePathname();
  const selectedId = searchParams.get('id');
  const { can } = useAuth();
  const toast = useToast();

  const [qDraft, setQDraft] = useState('');
  const [q, setQ] = useState('');
  const [status, setStatus] = useState('');
  const [createdFrom, setCreatedFrom] = useState('');
  const [createdTo, setCreatedTo] = useState('');
  const [skip, setSkip] = useState(0);
  const [take, setTake] = useState(25);

  const [items, setItems] = useState<AdminCustomer[]>([]);
  const [total, setTotal] = useState(0);
  const [listLoading, setListLoading] = useState(false);

  const [detail, setDetail] = useState<AdminCustomerDetail | null>(null);
  const [detailLoading, setDetailLoading] = useState(false);
  const [orderSkip, setOrderSkip] = useState(0);
  const [orderTake, setOrderTake] = useState(10);
  const [loginEventSkip, setLoginEventSkip] = useState(0);
  const [loginEventTake, setLoginEventTake] = useState(10);
  const [tab, setTab] = useState<CustomerDetailTab>('overview');

  const [error, setError] = useState<string | null>(null);
  const [resetResult, setResetResult] = useState<ResetResult | null>(null);
  const [isMobileDetail, setIsMobileDetail] = useState(false);

  const filtersActive = Boolean(q || status || createdFrom || createdTo);

  const setSelectedId = useCallback(
    (id: string | null) => {
      const next = new URLSearchParams(searchParams.toString());
      if (id) next.set('id', id);
      else next.delete('id');
      const qs = next.toString();
      router.replace(qs ? `${pathname}?${qs}` : pathname, { scroll: false });
    },
    [pathname, router, searchParams],
  );

  const loadList = useCallback(async () => {
    setListLoading(true);
    setError(null);
    try {
      const res = await adminApi.listCustomers({
        q: q || undefined,
        status: status || undefined,
        createdFrom: createdFrom || undefined,
        createdTo: createdTo || undefined,
        skip,
        take,
      });
      setItems(res.items);
      setTotal(res.total);
    } catch (err) {
      setError(err instanceof ApiClientError ? err.message : vi.customers.loadError);
    } finally {
      setListLoading(false);
    }
  }, [q, status, createdFrom, createdTo, skip, take]);

  const loadDetail = useCallback(
    async (id: string) => {
      setDetailLoading(true);
      setError(null);
      try {
        setDetail(
          await adminApi.getCustomer(id, {
            orderSkip,
            orderTake,
            loginEventSkip,
            loginEventTake,
          }),
        );
      } catch (err) {
        setDetail(null);
        setError(err instanceof ApiClientError ? err.message : vi.customers.loadError);
      } finally {
        setDetailLoading(false);
      }
    },
    [orderSkip, orderTake, loginEventSkip, loginEventTake],
  );

  useEffect(() => {
    void loadList();
  }, [loadList]);

  useEffect(() => {
    setOrderSkip(0);
    setLoginEventSkip(0);
    setTab('overview');
  }, [selectedId]);

  useEffect(() => {
    if (!selectedId) {
      setDetail(null);
      return;
    }
    void loadDetail(selectedId);
  }, [selectedId, loadDetail]);

  useEffect(() => {
    const mq = window.matchMedia('(max-width: 1023px)');
    const apply = () => setIsMobileDetail(mq.matches);
    apply();
    mq.addEventListener('change', apply);
    return () => mq.removeEventListener('change', apply);
  }, []);

  function clearFilters() {
    setQDraft('');
    setQ('');
    setStatus('');
    setCreatedFrom('');
    setCreatedTo('');
    setSkip(0);
  }

  function applySearch() {
    setQ(qDraft.trim());
    setSkip(0);
  }

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

  async function resetPassword() {
    if (!detail) return;
    try {
      const result = await adminApi.resetCustomerPassword(detail.profile.id, 'link');
      setResetResult(result);
      toast.success(vi.customers.resetSuccess);
    } catch (err) {
      toast.error(err instanceof ApiClientError ? err.message : vi.customers.resetFailed);
    }
  }

  const showList = !isMobileDetail || !selectedId;
  const showDetail = !isMobileDetail || Boolean(selectedId);

  const activeFilterChips = useMemo(() => {
    const chips: string[] = [];
    if (q) chips.push(`q: ${q}`);
    if (status) chips.push(`status: ${status}`);
    if (createdFrom) chips.push(`from: ${createdFrom}`);
    if (createdTo) chips.push(`to: ${createdTo}`);
    return chips;
  }, [q, status, createdFrom, createdTo]);

  return (
    <RequirePermission permission="customers.read">
      <div className="flex min-h-[calc(100vh-7rem)] flex-col gap-4">
        <PageHeader title={vi.customers.title} subtitle={vi.customers.subtitle} />
        {error ? <ErrorMessage message={error} /> : null}

        <Card className="space-y-3 p-3 sm:p-4">
          <div className="grid gap-2 lg:grid-cols-[1fr_auto_auto_auto_auto]">
            <div>
              <Label>{vi.customers.search}</Label>
              <Input
                className="mt-1"
                placeholder={vi.customers.searchPlaceholder}
                value={qDraft}
                onChange={(e) => setQDraft(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === 'Enter') applySearch();
                }}
              />
            </div>
            <div>
              <Label>{vi.customers.status}</Label>
              <Select
                className="mt-1"
                value={status}
                onChange={(e) => {
                  setStatus(e.target.value);
                  setSkip(0);
                }}
              >
                {STATUS_OPTIONS.map((opt) => (
                  <option key={opt.value || 'all'} value={opt.value}>
                    {opt.label}
                  </option>
                ))}
              </Select>
            </div>
            <div>
              <Label>{vi.customers.registeredFrom}</Label>
              <Input
                className="mt-1"
                type="date"
                value={createdFrom}
                onChange={(e) => {
                  setCreatedFrom(e.target.value);
                  setSkip(0);
                }}
              />
            </div>
            <div>
              <Label>{vi.customers.registeredTo}</Label>
              <Input
                className="mt-1"
                type="date"
                value={createdTo}
                onChange={(e) => {
                  setCreatedTo(e.target.value);
                  setSkip(0);
                }}
              />
            </div>
            <div className="flex items-end gap-2">
              <Button onClick={applySearch}>{vi.customers.search}</Button>
              <Button
                variant="ghost"
                disabled={!filtersActive}
                onClick={clearFilters}
              >
                {vi.customers.clearFilters}
              </Button>
            </div>
          </div>
          {activeFilterChips.length > 0 ? (
            <div className="flex flex-wrap gap-1.5">
              {activeFilterChips.map((chip) => (
                <span
                  key={chip}
                  className="rounded-full border border-slate-200 bg-slate-50 px-2.5 py-0.5 text-[11px] text-slate-600"
                >
                  {chip}
                </span>
              ))}
            </div>
          ) : null}
        </Card>

        <div
          className={cn(
            'grid min-h-0 flex-1 gap-4',
            isMobileDetail ? 'grid-cols-1' : 'lg:grid-cols-[minmax(0,2fr)_minmax(0,3fr)]',
          )}
        >
          {showList ? (
            <Card className="flex min-h-[24rem] flex-col p-3 sm:p-4 lg:max-h-[calc(100vh-14rem)]">
              <CustomersListPanel
                items={items}
                total={total}
                skip={skip}
                take={take}
                selectedId={selectedId}
                loading={listLoading}
                onSelect={setSelectedId}
                onPageChange={setSkip}
                onTakeChange={(next) => {
                  setTake(next);
                  setSkip(0);
                }}
              />
            </Card>
          ) : null}

          {showDetail ? (
            <div className="min-h-[24rem] lg:max-h-[calc(100vh-14rem)]">
              <CustomerDetailPanel
                detail={detail}
                loading={detailLoading}
                tab={tab}
                canManage={can('customers.manage')}
                showBack={isMobileDetail && Boolean(selectedId)}
                onTabChange={setTab}
                onBack={() => setSelectedId(null)}
                onToggleLock={() => void toggleLock()}
                onResetPassword={() => void resetPassword()}
                onOrderPageChange={setOrderSkip}
                onOrderTakeChange={(next) => {
                  setOrderTake(next);
                  setOrderSkip(0);
                }}
                onLoginPageChange={setLoginEventSkip}
                onLoginTakeChange={(next) => {
                  setLoginEventTake(next);
                  setLoginEventSkip(0);
                }}
              />
            </div>
          ) : null}
        </div>

        <Dialog
          open={Boolean(resetResult)}
          onClose={() => setResetResult(null)}
          title={vi.customers.resetPassword}
          description={resetResult?.email}
          size="sm"
          footer={
            <Button variant="secondary" onClick={() => setResetResult(null)}>
              {vi.customers.close}
            </Button>
          }
        >
          {resetResult?.mode === 'link' ? (
            <div className="space-y-2">
              <p className="text-sm font-medium">{vi.customers.resetLink}</p>
              <Input readOnly value={resetResult.resetLink} className="font-mono text-xs" />
              <Button
                size="sm"
                onClick={() => {
                  void navigator.clipboard.writeText(resetResult.resetLink);
                  toast.success(vi.customers.copyLink);
                }}
              >
                {vi.customers.copyLink}
              </Button>
            </div>
          ) : (
            <div className="space-y-2">
              <p className="text-sm font-medium">{vi.customers.tempPassword}</p>
              <Input readOnly value={resetResult?.tempPassword ?? ''} className="font-mono" />
            </div>
          )}
        </Dialog>
      </div>
    </RequirePermission>
  );
}
