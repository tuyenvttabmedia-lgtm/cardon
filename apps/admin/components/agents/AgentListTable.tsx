'use client';

import Link from 'next/link';
import { useCallback, useEffect, useState } from 'react';
import { Badge, Card, ErrorMessage, statusTone } from '@/components/ui/Display';
import { Button, Input, Label, Select } from '@/components/ui/Form';
import { Table, THead, TBody, TR, TH, TD, TableEmpty, TableSkeleton } from '@/components/ui/Table';
import { vi } from '@/lib/i18n/vi';
import { cn, formatDateTime, formatVnd } from '@/lib/utils';
import { agentCenterApi, ApiClientError, type AgentCenterListItem } from '@/services/api-client';

const PAGE_SIZE = 25;

export function AgentListTable({
  mode = 'all',
}: {
  mode?: 'all' | 'kyc';
}) {
  const [items, setItems] = useState<AgentCenterListItem[]>([]);
  const [total, setTotal] = useState(0);
  const [skip, setSkip] = useState(0);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [q, setQ] = useState('');
  const [status, setStatus] = useState('');
  const [kycStatus, setKycStatus] = useState(mode === 'kyc' ? 'SUBMITTED' : '');
  const [apiEnabled, setApiEnabled] = useState('');
  const [webhookEnabled, setWebhookEnabled] = useState('');

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const params: Record<string, string | number | boolean | undefined> = {
        skip,
        take: PAGE_SIZE,
        q: q.trim() || undefined,
        status: status || undefined,
        kycStatus: kycStatus || undefined,
        apiEnabled: apiEnabled === '' ? undefined : apiEnabled === 'true',
        webhookEnabled: webhookEnabled === '' ? undefined : webhookEnabled === 'true',
        sort: 'createdAt',
        order: 'desc',
      };
      const res =
        mode === 'kyc'
          ? await agentCenterApi.kycQueue({ skip, take: PAGE_SIZE })
          : await agentCenterApi.listAgents(params);
      setItems(res.items);
      setTotal(res.total);
    } catch (e) {
      setError(e instanceof ApiClientError ? e.message : vi.agentCenter.loadError);
    } finally {
      setLoading(false);
    }
  }, [skip, q, status, kycStatus, apiEnabled, webhookEnabled, mode]);

  useEffect(() => {
    void load();
  }, [load]);

  const page = Math.floor(skip / PAGE_SIZE) + 1;
  const totalPages = Math.max(1, Math.ceil(total / PAGE_SIZE));

  return (
    <div className="space-y-4">
      {error && <ErrorMessage message={error} />}
      <Card className="space-y-4">
        <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-4">
          <div className="xl:col-span-2">
            <Label className="text-xs">{vi.app.search}</Label>
            <Input
              className="mt-1"
              placeholder={vi.agentCenter.searchPlaceholder}
              value={q}
              onChange={(e) => setQ(e.target.value)}
              onKeyDown={(e) => e.key === 'Enter' && (setSkip(0), void load())}
            />
          </div>
          {mode === 'all' && (
            <>
              <div>
                <Label className="text-xs">{vi.agentCenter.filterStatus}</Label>
                <Select className="mt-1" value={status} onChange={(e) => { setStatus(e.target.value); setSkip(0); }}>
                  <option value="">—</option>
                  {['ACTIVE', 'PENDING_KYC', 'SUSPENDED', 'REJECTED'].map((s) => (
                    <option key={s} value={s}>{s}</option>
                  ))}
                </Select>
              </div>
              <div>
                <Label className="text-xs">{vi.agentCenter.filterKyc}</Label>
                <Select className="mt-1" value={kycStatus} onChange={(e) => { setKycStatus(e.target.value); setSkip(0); }}>
                  <option value="">—</option>
                  {['PENDING', 'SUBMITTED', 'NEED_MORE_INFO', 'APPROVED', 'REJECTED'].map((s) => (
                    <option key={s} value={s}>{s}</option>
                  ))}
                </Select>
              </div>
              <div>
                <Label className="text-xs">{vi.agentCenter.filterApi}</Label>
                <Select className="mt-1" value={apiEnabled} onChange={(e) => { setApiEnabled(e.target.value); setSkip(0); }}>
                  <option value="">—</option>
                  <option value="true">{vi.app.yes}</option>
                  <option value="false">{vi.app.no}</option>
                </Select>
              </div>
              <div>
                <Label className="text-xs">{vi.agentCenter.filterWebhook}</Label>
                <Select className="mt-1" value={webhookEnabled} onChange={(e) => { setWebhookEnabled(e.target.value); setSkip(0); }}>
                  <option value="">—</option>
                  <option value="true">{vi.app.yes}</option>
                  <option value="false">{vi.app.no}</option>
                </Select>
              </div>
            </>
          )}
        </div>
        <div className="flex gap-2">
          <Button size="sm" onClick={() => { setSkip(0); void load(); }}>{vi.app.search}</Button>
          <Button size="sm" variant="secondary" onClick={() => void load()}>{vi.app.refresh}</Button>
        </div>
      </Card>

      <Card className="p-0">
        <Table className="min-w-full">
          <THead>
            <TR>
              <TH>{vi.agentCenter.colAgentCode}</TH>
              <TH>{vi.agentCenter.colCompany}</TH>
              <TH>{vi.agentCenter.colStatus}</TH>
              <TH>{vi.agents.kyc}</TH>
              <TH>{vi.agentCenter.colWallet}</TH>
              <TH>{vi.agentCenter.colTodayOrders}</TH>
              <TH>{vi.agentCenter.colApiStatus}</TH>
              <TH>{vi.agentCenter.colWebhookStatus}</TH>
              <TH>{vi.agentCenter.colMembers}</TH>
              <TH>{vi.agentCenter.colLastActivity}</TH>
              <TH />
            </TR>
          </THead>
          <TBody>
            {loading ? (
              <TableSkeleton colSpan={11} />
            ) : items.length === 0 ? (
              <TableEmpty colSpan={11} message={vi.agentCenter.empty} />
            ) : (
              items.map((a) => (
                <TR key={a.id}>
                  <TD className="font-mono text-xs">{a.agentCode}</TD>
                  <TD className="font-medium">{a.companyName}</TD>
                  <TD>
                    <Badge tone={statusTone(a.status)} status={a.status} />
                  </TD>
                  <TD>
                    {a.kycStatus ? <Badge tone={statusTone(a.kycStatus)} status={a.kycStatus} /> : '—'}
                  </TD>
                  <TD>{formatVnd(a.walletBalance)}</TD>
                  <TD>{a.todayOrders}</TD>
                  <TD>{a.apiStatus}</TD>
                  <TD>{a.webhookStatus}</TD>
                  <TD>{a.memberCount}</TD>
                  <TD className="text-xs text-slate-500">
                    {a.lastActivityAt ? formatDateTime(a.lastActivityAt) : '—'}
                  </TD>
                  <TD>
                    <Link href={`/agents/${a.id}?tab=overview`} className="text-admin-600 hover:underline">
                      {vi.common.detail}
                    </Link>
                  </TD>
                </TR>
              ))
            )}
          </TBody>
        </Table>
      </Card>

      <div className="flex items-center justify-between text-sm text-slate-600">
        <span>
          {total.toLocaleString('vi-VN')} bản ghi · Trang {page}/{totalPages}
        </span>
        <div className="flex gap-2">
          <Button size="sm" variant="secondary" disabled={skip <= 0} onClick={() => setSkip(Math.max(0, skip - PAGE_SIZE))}>
            ←
          </Button>
          <Button
            size="sm"
            variant="secondary"
            disabled={skip + PAGE_SIZE >= total}
            onClick={() => setSkip(skip + PAGE_SIZE)}
          >
            →
          </Button>
        </div>
      </div>
    </div>
  );
}
