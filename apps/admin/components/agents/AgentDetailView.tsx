'use client';

import Link from 'next/link';
import { usePathname, useRouter, useSearchParams } from 'next/navigation';
import { useCallback, useEffect, useMemo, useState } from 'react';
import { Badge, Card, ErrorMessage, ForbiddenMessage, StatCard, statusTone } from '@/components/ui/Display';
import { Button, Input, Label } from '@/components/ui/Form';
import { useToast } from '@/components/ui/Toast';
import { useAuth } from '@/hooks/useAuth';
import { AGENT_DETAIL_TABS, type AgentDetailTabId } from '@/lib/agent-routes';
import { vi } from '@/lib/i18n/vi';
import { cn, formatDateTime, formatVnd } from '@/lib/utils';
import { adminApi, agentCenterApi, ApiClientError } from '@/services/api-client';
import { AgentInvoiceTabPanel } from '@/components/agents/AgentInvoiceTabPanel';
import { AgentStatementTabPanel } from '@/components/agents/AgentStatementTabPanel';
import { AgentWalletTabPanel } from '@/components/agents/AgentWalletTabPanel';
import { AgentPricingTabPanel } from '@/components/pricing/AgentPricingTabPanel';
import { AgentKycReviewPanel } from '@/components/agents/AgentKycReviewPanel';
import { ApiCredentialsReveal, type ApiCredentialsPayload } from '@/components/agents/ApiCredentialsReveal';
import type { AdminAgent } from '@/types/api';

const PARTNER_APP_URL = process.env.NEXT_PUBLIC_PARTNER_APP_URL ?? 'http://partner.localhost';
const PAGE_SIZE = 20;

function formatAgentCode(id: string) {
  return id.replace(/-/g, '').slice(0, 8).toUpperCase();
}

function isTabId(value: string | null): value is AgentDetailTabId {
  return AGENT_DETAIL_TABS.some((t) => t.id === value);
}

function LoadingBlock() {
  return <p className="text-zinc-500">{vi.agentCenter.loading}</p>;
}

function EmptyBlock() {
  return <p className="text-zinc-500">{vi.common.noData}</p>;
}

function SimpleTable({
  headers,
  rows,
}: {
  headers: string[];
  rows: Array<Array<React.ReactNode>>;
}) {
  if (rows.length === 0) return <EmptyBlock />;
  return (
    <div className="overflow-x-auto">
      <table className="min-w-full text-left text-sm">
        <thead className="border-b bg-zinc-50 text-zinc-500">
          <tr>
            {headers.map((h) => (
              <th key={h} className="px-4 py-3">
                {h}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {rows.map((row, i) => (
            <tr key={i} className="border-b border-zinc-50 hover:bg-zinc-50">
              {row.map((cell, j) => (
                <td key={j} className="px-4 py-3">
                  {cell}
                </td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

type OverviewData = {
  agent: AdminAgent;
  cards: Record<string, string | number | null>;
  latestActivity: { title: string; at: string; severity: string } | null;
  latestLogin: { at: string; ipAddress: string | null; device: string | null } | null;
  tags: string[];
  notes: Array<{ id: string; text: string; adminEmail: string; createdAt: string }>;
};

export function AgentDetailView({ agentId }: { agentId: string }) {
  const searchParams = useSearchParams();
  const router = useRouter();
  const pathname = usePathname();
  const { can, user } = useAuth();
  const toast = useToast();

  const tabParam = searchParams.get('tab');
  const walletAction = searchParams.get('action');
  const activeTab: AgentDetailTabId = isTabId(tabParam) ? tabParam : 'overview';

  const visibleTabs = useMemo(
    () =>
      AGENT_DETAIL_TABS.filter(
        (t) => !('permission' in t && t.permission) || can(t.permission as string),
      ),
    [can],
  );

  const tabAllowed = visibleTabs.some((t) => t.id === activeTab);

  const [header, setHeader] = useState<OverviewData | null>(null);
  const [headerLoading, setHeaderLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [actionBusy, setActionBusy] = useState(false);

  const [tabLoading, setTabLoading] = useState(false);
  const [tabData, setTabData] = useState<Record<string, unknown> | null>(null);
  const [loadedTabs, setLoadedTabs] = useState<Set<AgentDetailTabId>>(new Set());

  const [noteText, setNoteText] = useState('');
  const [metaSaving, setMetaSaving] = useState(false);
  const [editForm, setEditForm] = useState({ companyName: '', contactEmail: '', rateLimit: '' });
  const [editSaving, setEditSaving] = useState(false);
  const [revealedCreds, setRevealedCreds] = useState<ApiCredentialsPayload | null>(null);

  const setTab = useCallback(
    (id: AgentDetailTabId) => {
      const params = new URLSearchParams(searchParams.toString());
      params.set('tab', id);
      router.replace(`${pathname}?${params.toString()}`);
    },
    [pathname, router, searchParams],
  );

  const loadHeader = useCallback(async () => {
    setHeaderLoading(true);
    setError(null);
    try {
      const data = (await agentCenterApi.overview(agentId)) as unknown as OverviewData;
      setHeader(data);
    } catch (e) {
      setError(e instanceof ApiClientError ? e.message : vi.agentCenter.loadError);
    } finally {
      setHeaderLoading(false);
    }
  }, [agentId]);

  const loadTab = useCallback(
    async (tab: AgentDetailTabId, force = false) => {
      if (!force && loadedTabs.has(tab)) return;
      setTabLoading(true);
      setError(null);
      try {
        let data: Record<string, unknown>;
        switch (tab) {
          case 'overview':
            data = (await agentCenterApi.overview(agentId)) as Record<string, unknown>;
            setHeader(data as unknown as OverviewData);
            break;
          case 'information':
            data = (await agentCenterApi.information(agentId)) as Record<string, unknown>;
            setEditForm({
              companyName: String(data.companyName ?? ''),
              contactEmail: String(data.contactEmail ?? ''),
              rateLimit: String(header?.agent.rateLimit ?? ''),
            });
            break;
          case 'api':
            data = (await agentCenterApi.api(agentId)) as Record<string, unknown>;
            break;
          case 'webhook':
            data = (await agentCenterApi.webhooks(agentId, { skip: 0, take: PAGE_SIZE })) as Record<
              string,
              unknown
            >;
            break;
          case 'members':
            data = (await agentCenterApi.members(agentId)) as Record<string, unknown>;
            break;
          case 'roles':
            data = (await agentCenterApi.rolesMatrix()) as Record<string, unknown>;
            break;
          case 'orders':
            data = (await agentCenterApi.orders(agentId, { skip: 0, take: PAGE_SIZE })) as Record<
              string,
              unknown
            >;
            break;
          case 'activity':
            data = (await agentCenterApi.activity(agentId, { skip: 0, take: 30 })) as Record<
              string,
              unknown
            >;
            break;
          case 'login-history':
            data = (await agentCenterApi.loginHistory(agentId, { skip: 0, take: 30 })) as Record<
              string,
              unknown
            >;
            break;
          case 'pricing':
            data = (await agentCenterApi.pricing(agentId)) as Record<string, unknown>;
            break;
          case 'wallet':
          case 'statement':
          case 'invoices':
            setTabLoading(false);
            return;
          default:
            data = {};
        }
        setTabData(data);
        setLoadedTabs((prev) => new Set(prev).add(tab));
      } catch (e) {
        setError(e instanceof ApiClientError ? e.message : vi.agentCenter.loadError);
      } finally {
        setTabLoading(false);
      }
    },
    [agentId, loadedTabs],
  );

  useEffect(() => {
    void loadHeader();
  }, [loadHeader]);

  useEffect(() => {
    if (!tabAllowed) return;
    void loadTab(activeTab);
  }, [activeTab, tabAllowed, loadTab]);

  async function refreshAfterAction() {
    setLoadedTabs(new Set());
    await loadHeader();
    await loadTab(activeTab, true);
  }

  async function runAction(fn: () => Promise<unknown>, successMsg?: string) {
    setActionBusy(true);
    try {
      await fn();
      if (successMsg) toast.success(successMsg);
      await refreshAfterAction();
    } catch (e) {
      toast.error(e instanceof ApiClientError ? e.message : vi.app.requestFailed);
    } finally {
      setActionBusy(false);
    }
  }

  async function handleSuspend() {
    const reason = window.prompt(`${vi.agentCenter.actionSuspend} — lý do (tuỳ chọn):`);
    if (reason === null) return;
    await runAction(() => adminApi.suspendAgent(agentId, reason || undefined));
  }

  async function handleReactivate() {
    if (!window.confirm(vi.agents.reactivate)) return;
    await runAction(() => adminApi.reactivateAgent(agentId), vi.agents.reactivateSuccess);
  }

  async function handleToggleApi(currentEnabled?: boolean) {
    const enabled = currentEnabled ?? header?.agent.apiEnabled;
    const msg = enabled ? vi.agentCenter.apiDisableConfirm : vi.agentCenter.apiEnableConfirm;
    if (!window.confirm(msg)) return;
    await runAction(() =>
      enabled ? adminApi.disableAgentApi(agentId) : adminApi.enableAgentApi(agentId),
    );
  }

  async function handleReviewIp(entryId: string, action: 'approve' | 'reject') {
    const label = action === 'approve' ? 'duyệt' : 'từ chối';
    if (!window.confirm(`Xác nhận ${label} IP này?`)) return;
    await runAction(async () => {
      if (action === 'approve') {
        await agentCenterApi.approveIpWhitelist(agentId, entryId);
      } else {
        await agentCenterApi.rejectIpWhitelist(agentId, entryId);
      }
      await loadTab('api', true);
    });
  }

  async function handleImpersonate() {
    if (!window.confirm(vi.agentCenter.impersonateConfirm)) return;
    await runAction(async () => {
      const result = await adminApi.impersonateAgent(agentId);
      const url = result.partnerUrl || PARTNER_APP_URL;
      window.open(url, '_blank', 'noopener,noreferrer');
    });
  }

  async function handlePartnerPortal() {
    window.open(PARTNER_APP_URL, '_blank', 'noopener,noreferrer');
  }

  async function handleApproveKyc() {
    await runAction(async () => {
      const result = await adminApi.approveKyc(agentId);
      setRevealedCreds({
        apiKey: result.apiKey,
        secretKey: result.secretKey,
        title: vi.agents.credsWarning,
        hint: 'Đại lý đã được duyệt KYC. Gửi khóa cho đại lý qua kênh bảo mật.',
      });
    });
  }

  async function handleRotateApiKeys() {
    if (!window.confirm(vi.agents.rotateApiKeyConfirm)) return;
    await runAction(async () => {
      const result = await adminApi.rotateAgentApiKeys(agentId);
      setRevealedCreds({
        apiKey: result.apiKey,
        secretKey: result.secretKey,
        title: vi.agents.rotateApiKey,
        hint: result.message,
      });
      setLoadedTabs((prev) => {
        const next = new Set(prev);
        next.delete('api');
        return next;
      });
      if (activeTab === 'api') {
        await loadTab('api', true);
      }
    });
  }

  async function handleRejectKyc() {
    const reason = window.prompt(`${vi.agents.rejectKyc} — lý do:`);
    if (!reason?.trim()) return;
    await runAction(() => adminApi.rejectKyc(agentId, reason.trim()));
  }

  async function handleRequestMoreInfoKyc() {
    const reason = window.prompt(`${vi.agents.requestMoreInfoKyc} — mô tả yêu cầu:`);
    if (!reason?.trim()) return;
    await runAction(() => adminApi.requestMoreInfoKyc(agentId, reason.trim()));
  }

  async function handleAddNote() {
    if (!noteText.trim()) return;
    setMetaSaving(true);
    try {
      await agentCenterApi.updateMeta(agentId, { note: noteText.trim() });
      setNoteText('');
      toast.success(vi.app.saved);
      await refreshAfterAction();
    } catch (e) {
      toast.error(e instanceof ApiClientError ? e.message : vi.app.requestFailed);
    } finally {
      setMetaSaving(false);
    }
  }

  async function handleUpdateAgent() {
    setEditSaving(true);
    try {
      await adminApi.updateAgent(agentId, {
        companyName: editForm.companyName.trim() || undefined,
        contactEmail: editForm.contactEmail.trim() || undefined,
        rateLimit: editForm.rateLimit ? Number(editForm.rateLimit) : undefined,
      });
      toast.success(vi.agents.updateSuccess);
      await refreshAfterAction();
    } catch (e) {
      toast.error(e instanceof ApiClientError ? e.message : vi.app.requestFailed);
    } finally {
      setEditSaving(false);
    }
  }

  const agent = header?.agent;
  const kycStatus = agent?.kyc?.status ?? (header?.cards?.kycStatus as string | null) ?? null;
  const kycPending =
    kycStatus === 'SUBMITTED' || kycStatus === 'PENDING' || kycStatus === 'NEED_MORE_INFO';

  function renderKycPendingBanner() {
    if (!can('agents.kyc.review') || !kycPending) return null;
    const onInformationTab = activeTab === 'information';
    return (
      <Card className="space-y-3 border-amber-200 bg-amber-50">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div>
            <p className="font-semibold text-amber-900">
              {onInformationTab
                ? 'Đại lý đang chờ duyệt KYC — xem hồ sơ bên dưới và thực hiện duyệt.'
                : vi.agentCenter.kycPendingBanner}
            </p>
            {kycStatus && (
              <p className="mt-1 text-sm text-amber-800">
                {vi.agents.kyc}: <Badge tone={statusTone(kycStatus)} status={kycStatus} />
              </p>
            )}
          </div>
          <div className="flex flex-wrap gap-2">
            <Button size="sm" disabled={actionBusy} onClick={() => void handleApproveKyc()}>
              {vi.agents.approveKyc}
            </Button>
            <Button size="sm" variant="danger" disabled={actionBusy} onClick={() => void handleRejectKyc()}>
              {vi.agents.rejectKyc}
            </Button>
            {kycStatus === 'SUBMITTED' && (
              <Button size="sm" variant="ghost" disabled={actionBusy} onClick={() => void handleRequestMoreInfoKyc()}>
                {vi.agents.requestMoreInfoKyc}
              </Button>
            )}
            {!onInformationTab && (
              <Button size="sm" variant="ghost" onClick={() => setTab('information')}>
                {vi.agentCenter.tabInformation}
              </Button>
            )}
          </div>
        </div>
      </Card>
    );
  }

  function renderAccountStatusCard() {
    if (!can('agents.manage')) return null;
    return (
      <Card className="space-y-3">
        <h3 className="font-semibold">{vi.agentCenter.accountStatusTitle}</h3>
        <p className="text-sm text-zinc-500">{vi.agentCenter.accountStatusHint}</p>
        <div className="flex flex-wrap items-center gap-3">
          {agent?.status && <Badge tone={statusTone(agent.status)} status={agent.status} />}
          {agent?.status === 'ACTIVE' && (
            <Button size="sm" variant="danger" disabled={actionBusy} onClick={() => void handleSuspend()}>
              {vi.agentCenter.actionSuspend}
            </Button>
          )}
          {agent?.status === 'SUSPENDED' && (
            <Button size="sm" disabled={actionBusy} onClick={() => void handleReactivate()}>
              {vi.agentCenter.actionEnable}
            </Button>
          )}
        </div>
      </Card>
    );
  }

  function renderTabPanel() {
    if (!tabAllowed) return <ForbiddenMessage />;
    if (tabLoading && !tabData) return <LoadingBlock />;

    switch (activeTab) {
      case 'overview': {
        const cards = (tabData?.cards ?? header?.cards ?? {}) as Record<string, string | number | null>;
        const latestActivity = (tabData?.latestActivity ?? header?.latestActivity) as OverviewData['latestActivity'];
        const latestLogin = (tabData?.latestLogin ?? header?.latestLogin) as OverviewData['latestLogin'];
        return (
          <div className="space-y-4">
            {renderKycPendingBanner()}
            <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
              <StatCard label={vi.agentCenter.colWallet} value={formatVnd(String(cards.walletBalance ?? '0'))} />
              <StatCard
                label="Khả dụng"
                value={formatVnd(String(cards.availableBalance ?? '0'))}
                hint={`Giữ: ${formatVnd(String(cards.heldBalance ?? '0'))}`}
              />
              <StatCard label={vi.agentCenter.colTodayOrders} value={String(cards.todayOrders ?? 0)} />
              <StatCard label="Doanh thu tháng" value={formatVnd(String(cards.monthRevenue ?? '0'))} />
              <StatCard label="Tỷ lệ thành công" value={`${cards.successRate ?? 0}%`} />
              <StatCard label="API hôm nay" value={String(cards.apiCallsToday ?? 0)} />
              <StatCard label={vi.agentCenter.colMembers} value={String(cards.memberCount ?? 0)} />
              <StatCard label={vi.agentCenter.colWebhookStatus} value={String(cards.webhookStatus ?? '—')} />
            </div>
            {(latestActivity || latestLogin) && (
              <Card className="space-y-3">
                <h3 className="font-semibold">{vi.agentCenter.tabActivity}</h3>
                {latestActivity && (
                  <p className="text-sm text-zinc-600">
                    {latestActivity.title} · {formatDateTime(latestActivity.at)}
                  </p>
                )}
                {latestLogin && (
                  <p className="text-sm text-zinc-500">
                    Đăng nhập cuối: {formatDateTime(latestLogin.at)}
                    {latestLogin.ipAddress ? ` · ${latestLogin.ipAddress}` : ''}
                    {latestLogin.device ? ` · ${latestLogin.device}` : ''}
                  </p>
                )}
              </Card>
            )}
          </div>
        );
      }

      case 'information': {
        const info = tabData as Record<string, unknown> | null;
        const kyc = info?.kyc as Record<string, unknown> | null;
        const notes = (info?.notes ?? header?.notes ?? []) as OverviewData['notes'];
        return (
          <div className="space-y-4">
            {renderKycPendingBanner()}
            <Card className="grid gap-3 md:grid-cols-2">
              <div>
                <p className="text-xs text-zinc-500">{vi.agentCenter.colCompany}</p>
                <p className="font-medium">{String(info?.companyName ?? agent?.companyName ?? '—')}</p>
              </div>
              <div>
                <p className="text-xs text-zinc-500">{vi.agents.contactEmail}</p>
                <p>{String(info?.contactEmail ?? agent?.contactEmail ?? '—')}</p>
              </div>
              <div>
                <p className="text-xs text-zinc-500">{vi.agents.userEmail}</p>
                <p>{String(info?.userEmail ?? agent?.user?.email ?? '—')}</p>
              </div>
              <div>
                <p className="text-xs text-zinc-500">{vi.common.created}</p>
                <p>{info?.createdAt ? formatDateTime(String(info.createdAt)) : '—'}</p>
              </div>
            </Card>

            <AgentKycReviewPanel
              agentId={agentId}
              kyc={kyc}
              userPhone={info?.userPhone ? String(info.userPhone) : null}
              emailVerified={info?.emailVerified != null ? Boolean(info.emailVerified) : null}
              canViewDocuments={can('agents.kyc.review')}
            />

            {renderAccountStatusCard()}

            {can('agents.manage') && (
              <Card className="space-y-3">
                <h3 className="font-semibold">{vi.agents.edit}</h3>
                <div className="grid gap-3 md:grid-cols-3">
                  <div>
                    <Label className="text-xs">{vi.agentCenter.colCompany}</Label>
                    <Input
                      className="mt-1"
                      value={editForm.companyName}
                      onChange={(e) => setEditForm((f) => ({ ...f, companyName: e.target.value }))}
                    />
                  </div>
                  <div>
                    <Label className="text-xs">{vi.agents.contactEmail}</Label>
                    <Input
                      className="mt-1"
                      value={editForm.contactEmail}
                      onChange={(e) => setEditForm((f) => ({ ...f, contactEmail: e.target.value }))}
                    />
                  </div>
                  <div>
                    <Label className="text-xs">{vi.agents.rateLimit}</Label>
                    <Input
                      className="mt-1"
                      type="number"
                      value={editForm.rateLimit}
                      onChange={(e) => setEditForm((f) => ({ ...f, rateLimit: e.target.value }))}
                    />
                  </div>
                </div>
                <Button size="sm" disabled={editSaving} onClick={() => void handleUpdateAgent()}>
                  {vi.agents.saveEdit}
                </Button>
              </Card>
            )}

            <Card className="space-y-3">
              <h3 className="font-semibold">{vi.agentCenter.notesTitle}</h3>
              <div className="flex gap-2">
                <Input
                  placeholder={vi.agentCenter.addNote}
                  value={noteText}
                  onChange={(e) => setNoteText(e.target.value)}
                  onKeyDown={(e) => e.key === 'Enter' && void handleAddNote()}
                />
                <Button size="sm" disabled={metaSaving || !noteText.trim()} onClick={() => void handleAddNote()}>
                  {vi.agentCenter.addNote}
                </Button>
              </div>
              {notes.length === 0 ? (
                <EmptyBlock />
              ) : (
                <ul className="space-y-2 text-sm">
                  {notes.map((n) => (
                    <li key={n.id} className="rounded-lg border border-zinc-100 p-3">
                      <p>{n.text}</p>
                      <p className="mt-1 text-xs text-zinc-400">
                        {n.adminEmail} · {formatDateTime(n.createdAt)}
                      </p>
                    </li>
                  ))}
                </ul>
              )}
            </Card>
          </div>
        );
      }

      case 'wallet':
        return (
          <AgentWalletTabPanel
            agentId={agentId}
            agentName={agent?.companyName ?? 'Đại lý'}
            canCredit={can('agents.credit')}
            canApprove={can('agents.manage')}
            canDebit={user?.role === 'SUPER_ADMIN' && can('agents.credit')}
            canDepositOnBehalf={can('agents.credit') && can('finance.manage')}
            openTopupInitially={walletAction === 'topup'}
          />
        );

      case 'api': {
        const api = tabData as Record<string, unknown> | null;
        const whitelist = (api?.ipWhitelist ?? []) as Array<Record<string, unknown>>;
        const usage = api?.usage24h as Record<string, number> | undefined;
        const logs = (api?.recentLogs ?? []) as Array<Record<string, unknown>>;
        return (
          <div className="space-y-4">
            {can('agents.manage') && (
              <Card className="space-y-3">
                <h3 className="font-semibold">{vi.agentCenter.apiManagementTitle}</h3>
                <p className="text-sm text-zinc-500">
                  Secret không thể xem lại — dùng &quot;Tạo lại khóa API&quot; để cấp cặp mới cho đại lý.
                </p>
                <div className="flex flex-wrap items-center gap-3">
                  <Badge tone={api?.apiEnabled ? 'success' : 'default'}>
                    API {api?.apiEnabled ? vi.app.enabled : vi.app.no}
                  </Badge>
                  <Button
                    size="sm"
                    variant={api?.apiEnabled ? 'danger' : 'secondary'}
                    disabled={actionBusy}
                    onClick={() => void handleToggleApi(Boolean(api?.apiEnabled))}
                  >
                    {api?.apiEnabled ? vi.agentCenter.actionDisableApi : vi.agentCenter.actionEnableApi}
                  </Button>
                  {Boolean(api?.hasCredentials) && (
                    <Button size="sm" disabled={actionBusy} onClick={() => void handleRotateApiKeys()}>
                      {vi.agents.rotateApiKey}
                    </Button>
                  )}
                </div>
              </Card>
            )}
            <Card className="grid gap-3 md:grid-cols-2 lg:grid-cols-4">
              <div>
                <p className="text-xs text-zinc-500">{vi.agents.apiEnabled}</p>
                <p>{api?.apiEnabled ? vi.app.yes : vi.app.no}</p>
              </div>
              <div>
                <p className="text-xs text-zinc-500">{vi.agents.hasCredentials}</p>
                <p>{api?.hasCredentials ? vi.app.yes : vi.app.no}</p>
              </div>
              <div className="sm:col-span-2">
                <p className="text-xs text-zinc-500">{vi.agents.apiKeyMasked}</p>
                <p className="font-mono text-sm">{String(api?.apiKeyMasked ?? '—')}</p>
              </div>
              <div>
                <p className="text-xs text-zinc-500">{vi.agents.rateLimit}</p>
                <p>{String(api?.rateLimit ?? '—')}</p>
              </div>
              <div>
                <p className="text-xs text-zinc-500">{vi.agents.lastApiUse}</p>
                <p>{api?.lastUsedAt ? formatDateTime(String(api.lastUsedAt)) : '—'}</p>
              </div>
            </Card>
            <Card className="space-y-2">
              <h3 className="font-semibold">IP whitelist</h3>
              <p className="text-sm text-zinc-500">
                Đại lý gửi IP → Admin duyệt mới cho phép gọi API từ IP đó. Rate-limit theo đại lý vẫn áp dụng.
              </p>
              {whitelist.length === 0 ? (
                <EmptyBlock />
              ) : (
                <ul className="space-y-3 text-sm">
                  {whitelist.map((e, i) => {
                    const status = String(e.status ?? 'APPROVED');
                    const entryId = String(e.id ?? '');
                    return (
                      <li
                        key={entryId || i}
                        className="flex flex-wrap items-center justify-between gap-2 rounded-lg border border-zinc-100 px-3 py-2"
                      >
                        <div>
                          <p className="font-mono text-xs">{String(e.cidr)}</p>
                          <p className="text-xs text-zinc-500">
                            {String(e.description || '—')} ·{' '}
                            {status === 'PENDING'
                              ? 'Chờ duyệt'
                              : status === 'REJECTED'
                                ? 'Từ chối'
                                : e.enabled === false
                                  ? 'Đã duyệt · tắt'
                                  : 'Đã duyệt · bật'}
                          </p>
                        </div>
                        {can('agents.manage') && status === 'PENDING' && entryId && (
                          <div className="flex gap-2">
                            <Button
                              size="sm"
                              disabled={actionBusy}
                              onClick={() => void handleReviewIp(entryId, 'approve')}
                            >
                              Duyệt
                            </Button>
                            <Button
                              size="sm"
                              variant="danger"
                              disabled={actionBusy}
                              onClick={() => void handleReviewIp(entryId, 'reject')}
                            >
                              Từ chối
                            </Button>
                          </div>
                        )}
                      </li>
                    );
                  })}
                </ul>
              )}
            </Card>
            <Card className="grid gap-3 sm:grid-cols-2">
              <StatCard label="API 24h" value={String(usage?.total ?? 0)} />
              <StatCard label="Lỗi 24h" value={String(usage?.errors ?? 0)} />
            </Card>
            <Card className="space-y-3 p-0">
              <p className="px-6 pt-6 font-semibold">Log gần đây</p>
              <SimpleTable
                headers={['Thời gian', 'Endpoint', 'HTTP', 'ms']}
                rows={logs.map((l) => [
                  formatDateTime(String(l.requestTime)),
                  `${String(l.method)} ${String(l.endpoint)}`,
                  String(l.httpStatus),
                  String(l.latencyMs),
                ])}
              />
            </Card>
          </div>
        );
      }

      case 'webhook': {
        const wh = tabData as Record<string, unknown> | null;
        const stats = wh?.stats as Record<string, number> | undefined;
        const deliveries = (wh?.deliveries ?? []) as Array<Record<string, unknown>>;
        return (
          <div className="space-y-4">
            <Card className="grid gap-3 md:grid-cols-2">
              <div>
                <p className="text-xs text-zinc-500">Callback URL</p>
                <p className="break-all font-mono text-xs">{String(wh?.callbackUrl ?? '—')}</p>
              </div>
              <div>
                <p className="text-xs text-zinc-500">{vi.agentCenter.colWebhookStatus}</p>
                <p>{wh?.enabled ? vi.app.enabled : vi.app.no}</p>
              </div>
              <div>
                <p className="text-xs text-zinc-500">Tỷ lệ giao 7 ngày</p>
                <p>{String(wh?.deliveryRate ?? 0)}%</p>
              </div>
              <div>
                <p className="text-xs text-zinc-500">Secret</p>
                <p>{wh?.secretConfigured ? vi.app.configured : vi.app.notConfigured}</p>
              </div>
            </Card>
            <div className="grid gap-4 sm:grid-cols-4">
              <StatCard label="Tổng" value={String(stats?.total ?? 0)} />
              <StatCard label="Thành công" value={String(stats?.delivered ?? 0)} />
              <StatCard label="Thất bại" value={String(stats?.failed ?? 0)} />
              <StatCard label="Đang chờ" value={String(stats?.pending ?? 0)} />
            </div>
            <Card className="space-y-3 p-0">
              <p className="px-6 pt-6 font-semibold">Giao gần đây</p>
              <SimpleTable
                headers={[vi.common.created, 'HTTP', 'Retry', vi.finance.status]}
                rows={deliveries.map((d) => [
                  formatDateTime(String(d.createdAt)),
                  String(d.httpStatus ?? '—'),
                  String(d.retryCount ?? 0),
                  d.processed ? 'OK' : 'Chờ',
                ])}
              />
            </Card>
          </div>
        );
      }

      case 'members': {
        const items = ((tabData as { items?: Array<Record<string, unknown>> })?.items ?? []) as Array<
          Record<string, unknown>
        >;
        return (
          <Card className="p-0">
            <SimpleTable
              headers={['Email', 'Tên', 'Vai trò', vi.agentCenter.colStatus, 'Đăng nhập cuối']}
              rows={items.map((m) => [
                String(m.email),
                String(m.fullName ?? '—'),
                String(m.role),
                <Badge key={String(m.id)} tone={statusTone(String(m.status))} status={String(m.status)} />,
                m.lastLoginAt ? formatDateTime(String(m.lastLoginAt)) : '—',
              ])}
            />
          </Card>
        );
      }

      case 'roles': {
        const roles = ((tabData as { roles?: Array<{ role: string; permissions: string[] }> })?.roles ??
          []) as Array<{ role: string; permissions: string[] }>;
        if (roles.length === 0) return <EmptyBlock />;
        return (
          <div className="space-y-3">
            <p className="text-sm text-zinc-500">
              Bảng tham chiếu vai trò và quyền trên cổng Partner — áp dụng cho thành viên đại lý
              (tab Thành viên), không chỉnh tại đây. Admin dùng để tra cứu quyền khi hỗ trợ đại lý.
            </p>
            <Card className="overflow-x-auto p-0">
            <table className="min-w-full text-left text-sm">
              <thead className="border-b bg-zinc-50 text-zinc-500">
                <tr>
                  <th className="px-4 py-3">Vai trò</th>
                  <th className="px-4 py-3">Quyền</th>
                </tr>
              </thead>
              <tbody>
                {roles.map((r) => (
                  <tr key={r.role} className="border-b border-zinc-50 align-top">
                    <td className="px-4 py-3 font-medium">{r.role}</td>
                    <td className="px-4 py-3">
                      <div className="flex flex-wrap gap-1">
                        {r.permissions.map((p) => (
                          <span key={p} className="rounded bg-zinc-100 px-2 py-0.5 text-xs">
                            {p}
                          </span>
                        ))}
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </Card>
          </div>
        );
      }

      case 'orders': {
        const items = ((tabData as { items?: Array<Record<string, unknown>> })?.items ?? []) as Array<
          Record<string, unknown>
        >;
        return (
          <Card className="p-0">
            <SimpleTable
              headers={['Mã đơn', vi.finance.amount, 'Thanh toán', 'Giao hàng', vi.common.created, '']}
              rows={items.map((o) => [
                String(o.orderCode),
                formatVnd(String(o.amount)),
                <Badge key={`p-${o.id}`} tone={statusTone(String(o.paymentStatus))} status={String(o.paymentStatus)} />,
                <Badge
                  key={`f-${o.id}`}
                  tone={statusTone(String(o.fulfillmentStatus))}
                  status={String(o.fulfillmentStatus)}
                />,
                formatDateTime(String(o.createdAt)),
                <Link key={`l-${o.id}`} href={`/orders/${String(o.id)}`} className="text-admin-600 hover:underline">
                  {vi.common.detail}
                </Link>,
              ])}
            />
          </Card>
        );
      }

      case 'activity': {
        const items = ((tabData as { items?: Array<Record<string, unknown>> })?.items ?? []) as Array<
          Record<string, unknown>
        >;
        if (items.length === 0) return <EmptyBlock />;
        return (
          <Card>
            <ul className="space-y-4 border-l-2 border-zinc-200 pl-4">
              {items.map((a) => (
                <li key={String(a.id)} className="relative">
                  <span className="absolute -left-[1.35rem] top-1 h-2 w-2 rounded-full bg-admin-500" />
                  <p className="font-medium">{String(a.title)}</p>
                  {a.description ? <p className="text-sm text-zinc-600">{String(a.description)}</p> : null}
                  <p className="mt-1 text-xs text-zinc-400">
                    {formatDateTime(String(a.createdAt))}
                    {a.performedEmail ? ` · ${String(a.performedEmail)}` : ''}
                    {a.severity ? ` · ${String(a.severity)}` : ''}
                  </p>
                </li>
              ))}
            </ul>
          </Card>
        );
      }

      case 'login-history': {
        const items = ((tabData as { items?: Array<Record<string, unknown>> })?.items ?? []) as Array<
          Record<string, unknown>
        >;
        return (
          <Card className="p-0">
            <SimpleTable
              headers={[vi.common.created, 'IP', 'Thiết bị', 'Trình duyệt', 'Quốc gia', 'Kết quả']}
              rows={items.map((r) => [
                formatDateTime(String(r.createdAt)),
                String(r.ipAddress ?? '—'),
                String(r.device ?? '—'),
                String(r.browser ?? '—'),
                String(r.country ?? '—'),
                String(r.result ?? '—'),
              ])}
            />
          </Card>
        );
      }

      case 'pricing': {
        if (!tabData) return <LoadingBlock />;
        return (
          <AgentPricingTabPanel agentId={agentId} data={tabData} />
        );
      }

      case 'statement':
        return (
          <AgentStatementTabPanel
            agentId={agentId}
            canWrite={can('finance.manage')}
            isSuperAdmin={user?.role === 'SUPER_ADMIN'}
          />
        );

      case 'invoices':
        return (
          <AgentInvoiceTabPanel agentId={agentId} canWrite={can('finance.manage')} />
        );

      default:
        return <EmptyBlock />;
    }
  }

  return (
    <div className="space-y-6">
      <div>
        <Link href="/agents/list" className="text-sm text-admin-600 hover:underline">
          {vi.agentCenter.backToList}
        </Link>
        {headerLoading && !agent ? (
          <LoadingBlock />
        ) : (
          <div className="mt-3 flex flex-wrap items-start justify-between gap-4">
            <div>
              <h1 className="text-2xl font-bold">{agent?.companyName ?? '—'}</h1>
              <p className="mt-1 font-mono text-sm text-zinc-500">{formatAgentCode(agentId)}</p>
              <div className="mt-2 flex flex-wrap gap-2">
                {agent?.status && <Badge tone={statusTone(agent.status)} status={agent.status} />}
                {kycStatus && <Badge tone={statusTone(kycStatus)} status={kycStatus} />}
                {agent?.apiEnabled !== undefined && (
                  <Badge tone={agent.apiEnabled ? 'success' : 'default'}>
                    API {agent.apiEnabled ? vi.app.enabled : vi.app.no}
                  </Badge>
                )}
              </div>
            </div>
            <div className="flex flex-wrap items-center gap-x-2 text-sm">
              {can('agents.manage') && (
                <>
                  <button
                    type="button"
                    disabled={actionBusy}
                    className="text-admin-600 hover:underline disabled:opacity-50"
                    onClick={() => void handleImpersonate()}
                  >
                    {vi.agentCenter.actionImpersonate}
                  </button>
                  <span className="text-zinc-300" aria-hidden>
                    ·
                  </span>
                </>
              )}
              <button
                type="button"
                className="text-admin-600 hover:underline"
                onClick={() => void handlePartnerPortal()}
              >
                {vi.agentCenter.actionPartnerPortal}
              </button>
            </div>
          </div>
        )}
      </div>

      {error && <ErrorMessage message={error} />}

      <nav className="-mx-1 flex gap-1 overflow-x-auto border-b border-zinc-200 pb-0">
        {visibleTabs.map((t) => (
          <button
            key={t.id}
            type="button"
            onClick={() => setTab(t.id)}
            className={cn(
              'shrink-0 rounded-t-lg px-3 py-2 text-sm font-medium whitespace-nowrap',
              activeTab === t.id
                ? 'border border-b-white border-zinc-200 bg-white text-admin-700'
                : 'text-zinc-600 hover:bg-zinc-50',
            )}
          >
            {t.label}
          </button>
        ))}
      </nav>

      <div>{renderTabPanel()}</div>

      {revealedCreds && (
        <ApiCredentialsReveal
          credentials={revealedCreds}
          onDismiss={() => setRevealedCreds(null)}
        />
      )}
    </div>
  );
}
