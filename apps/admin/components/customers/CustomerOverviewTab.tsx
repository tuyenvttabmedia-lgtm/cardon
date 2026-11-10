'use client';

import { Badge, statusTone } from '@/components/ui/Display';
import { Button } from '@/components/ui/Form';
import { vi } from '@/lib/i18n/vi';
import { formatDateTime, formatVnd } from '@/lib/utils';
import type { AdminCustomerDetail } from '@/types/api';

export function CustomerOverviewTab({
  detail,
  canManage,
  onToggleLock,
  onResetPassword,
}: {
  detail: AdminCustomerDetail;
  canManage: boolean;
  onToggleLock: () => void;
  onResetPassword: () => void;
}) {
  const { profile, kpis } = detail;

  return (
    <div className="space-y-4">
      <dl className="grid gap-2 text-sm sm:grid-cols-2">
        <Field label={vi.customers.customerId} value={profile.id} mono />
        <Field label={vi.customers.email} value={profile.email} />
        <Field label={vi.customers.fullName} value={profile.fullName ?? '—'} />
        <Field label={vi.customers.username} value={profile.username ?? '—'} />
        <Field label={vi.customers.phone} value={profile.phone ?? '—'} />
        <div>
          <dt className="text-xs text-slate-500">{vi.customers.status}</dt>
          <dd className="mt-0.5">
            <Badge tone={statusTone(profile.status)} status={profile.status} />
          </dd>
        </div>
        <Field
          label={vi.customers.createdAt}
          value={formatDateTime(profile.createdAt)}
        />
        <Field
          label={vi.customers.updatedAt}
          value={profile.updatedAt ? formatDateTime(profile.updatedAt) : '—'}
        />
        <Field
          label={vi.customers.lastLogin}
          value={profile.lastLoginAt ? formatDateTime(profile.lastLoginAt) : '—'}
        />
        <Field
          label={vi.customers.emailVerified}
          value={
            profile.emailVerifiedAt
              ? `${vi.customers.verified} (${formatDateTime(profile.emailVerifiedAt)})`
              : vi.customers.notVerified
          }
        />
      </dl>

      <div className="grid grid-cols-2 gap-2 sm:grid-cols-3 lg:grid-cols-5">
        <Kpi label={vi.customers.kpiTotalOrders} value={String(kpis.totalOrders)} />
        <Kpi label={vi.customers.kpiSuccessful} value={String(kpis.successfulOrders)} />
        <Kpi label={vi.customers.kpiFailed} value={String(kpis.failedOrCancelledOrders)} />
        <Kpi label={vi.customers.kpiRefunded} value={String(kpis.refundedOrders)} />
        <Kpi label={vi.customers.kpiPaidAmount} value={formatVnd(kpis.totalPaidAmount)} />
      </div>
      <p className="text-[11px] leading-relaxed text-slate-400">{vi.customers.kpiHint}</p>

      {canManage ? (
        <div className="flex flex-wrap gap-2 border-t border-slate-100 pt-3">
          <Button size="sm" onClick={onToggleLock}>
            {profile.status === 'ACTIVE' ? vi.customers.lock : vi.customers.unlock}
          </Button>
          <Button size="sm" variant="secondary" onClick={onResetPassword}>
            {vi.customers.resetPassword}
          </Button>
        </div>
      ) : null}
    </div>
  );
}

function Field({
  label,
  value,
  mono,
}: {
  label: string;
  value: string;
  mono?: boolean;
}) {
  return (
    <div>
      <dt className="text-xs text-slate-500">{label}</dt>
      <dd className={`mt-0.5 break-all text-slate-800 ${mono ? 'font-mono text-xs' : ''}`}>
        {value}
      </dd>
    </div>
  );
}

function Kpi({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-lg border border-slate-200 bg-slate-50/80 px-3 py-2">
      <p className="text-[11px] text-slate-500">{label}</p>
      <p className="mt-0.5 text-sm font-semibold text-slate-900">{value}</p>
    </div>
  );
}
