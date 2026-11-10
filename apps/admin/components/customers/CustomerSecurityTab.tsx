'use client';

import { Button } from '@/components/ui/Form';
import { Table, TBody, TD, TH, THead, TR, TableEmpty } from '@/components/ui/Table';
import { vi } from '@/lib/i18n/vi';
import { formatDateTime } from '@/lib/utils';
import type { AdminCustomerDetail } from '@/types/api';

export function CustomerSecurityTab({
  detail,
  onLoginPageChange,
  onLoginTakeChange,
}: {
  detail: AdminCustomerDetail;
  onLoginPageChange: (nextSkip: number) => void;
  onLoginTakeChange: (take: number) => void;
}) {
  const { profile, loginEvents } = detail;
  const page = Math.floor(loginEvents.skip / loginEvents.take) + 1;
  const pages = Math.max(1, Math.ceil(loginEvents.total / loginEvents.take));

  return (
    <div className="space-y-4">
      <dl className="grid gap-2 text-sm sm:grid-cols-2">
        <div>
          <dt className="text-xs text-slate-500">{vi.customers.emailVerified}</dt>
          <dd className="mt-0.5 text-slate-800">
            {profile.emailVerifiedAt
              ? `${vi.customers.verified} · ${formatDateTime(profile.emailVerifiedAt)}`
              : vi.customers.notVerified}
          </dd>
        </div>
        <div>
          <dt className="text-xs text-slate-500">{vi.customers.lastLogin}</dt>
          <dd className="mt-0.5 text-slate-800">
            {profile.lastLoginAt ? formatDateTime(profile.lastLoginAt) : '—'}
          </dd>
        </div>
        <div>
          <dt className="text-xs text-slate-500">{vi.customers.registrationIp}</dt>
          <dd className="mt-0.5 text-slate-500">{vi.customers.noData}</dd>
        </div>
      </dl>

      <div>
        <h3 className="text-sm font-semibold text-slate-800">{vi.customers.loginEventsTitle}</h3>
        <p className="mt-1 text-[11px] leading-relaxed text-slate-400">
          {vi.customers.loginEventsNote}
        </p>
        <p className="mt-1 text-[11px] text-slate-400">
          Nguồn: <code className="rounded bg-slate-100 px-1">{loginEvents.source}</code>
        </p>

        <div className="mt-3">
          <Table>
            <THead>
              <TR>
                <TH>{vi.customers.loginAction}</TH>
                <TH>{vi.customers.loginIp}</TH>
                <TH>{vi.customers.loginTime}</TH>
              </TR>
            </THead>
            <TBody>
              {loginEvents.items.length === 0 ? (
                <TableEmpty colSpan={3} message={vi.customers.noData} />
              ) : (
                loginEvents.items.map((row) => (
                  <TR key={row.id}>
                    <TD className="font-medium">{row.action}</TD>
                    <TD className="font-mono text-xs">{row.ipAddress ?? '—'}</TD>
                    <TD className="whitespace-nowrap text-slate-600">
                      {formatDateTime(row.createdAt)}
                    </TD>
                  </TR>
                ))
              )}
            </TBody>
          </Table>
        </div>

        {loginEvents.total > 0 ? (
          <div className="mt-3 flex flex-wrap items-center justify-between gap-2 text-sm">
            <label className="inline-flex items-center gap-2 text-slate-600">
              <span>{vi.customers.ordersPerPage}</span>
              <select
                value={loginEvents.take}
                onChange={(e) => onLoginTakeChange(Number(e.target.value))}
                className="rounded border border-slate-200 px-2 py-1"
              >
                {[10, 25, 50].map((size) => (
                  <option key={size} value={size}>
                    {size}
                  </option>
                ))}
              </select>
            </label>
            <div className="flex items-center gap-2">
              <Button
                size="sm"
                variant="ghost"
                disabled={loginEvents.skip === 0}
                onClick={() =>
                  onLoginPageChange(Math.max(0, loginEvents.skip - loginEvents.take))
                }
              >
                {vi.customers.prevPage}
              </Button>
              <span className="text-slate-600">
                {vi.customers.pageOf} {page}/{pages} ({loginEvents.total})
              </span>
              <Button
                size="sm"
                variant="ghost"
                disabled={loginEvents.skip + loginEvents.take >= loginEvents.total}
                onClick={() => onLoginPageChange(loginEvents.skip + loginEvents.take)}
              >
                {vi.customers.nextPage}
              </Button>
            </div>
          </div>
        ) : null}
      </div>
    </div>
  );
}
