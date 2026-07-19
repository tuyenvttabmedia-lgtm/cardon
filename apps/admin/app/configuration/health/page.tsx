'use client';

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { RequirePermission } from '@/components/layout/AdminShell';
import { ConfigurationAuditBar } from '@/components/configuration/ConfigurationAuditBar';
import { Badge, Card, ErrorMessage } from '@/components/ui/Display';
import { vi } from '@/lib/i18n/vi';
import { Button } from '@/components/ui/Form';
import { getAccessToken } from '@/lib/auth-storage';
import { formatDateTime, formatVnd } from '@/lib/utils';
import { systemHealthApi, ApiClientError } from '@/services/api-client';
import type {
  ChecklistStatus,
  IntegrityReport,
  IntegritySeverity,
  OperationsDashboard,
  SystemHealthSummary,
} from '@/types/api';

type FilterSeverity = 'all' | IntegritySeverity;

const SEVERITY_TONE = {
  ok: 'success',
  warning: 'warning',
  error: 'danger',
} as const;

const CHECKLIST_TONE: Record<ChecklistStatus, keyof typeof SEVERITY_TONE> = {
  pass: 'ok',
  warning: 'warning',
  error: 'error',
};

function formatRelative(iso: string | null | undefined) {
  if (!iso) return '—';
  const diffMs = Date.now() - new Date(iso).getTime();
  const mins = Math.round(diffMs / 60000);
  if (mins < 1) return 'vừa xong';
  if (mins < 60) return `${mins} phút trước`;
  const hours = Math.round(mins / 60);
  if (hours < 48) return `${hours} giờ trước`;
  return formatDateTime(iso);
}

function OpsSection({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <Card>
      <h2 className="mb-3 text-lg font-semibold">{title}</h2>
      {children}
    </Card>
  );
}

export default function SystemHealthPage() {
  const [summary, setSummary] = useState<SystemHealthSummary | null>(null);
  const [report, setReport] = useState<IntegrityReport | null>(null);
  const [filter, setFilter] = useState<FilterSeverity>('all');
  const [scanning, setScanning] = useState(false);
  const [fixing, setFixing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const pollRef = useRef<ReturnType<typeof setInterval> | null>(null);

  const ops = report?.operations as OperationsDashboard | undefined;

  const load = useCallback(async () => {
    setError(null);
    try {
      const [healthSummary, healthReport] = await Promise.all([
        systemHealthApi.getHealth(),
        systemHealthApi.getReport(),
      ]);
      setSummary(healthSummary);
      setScanning(Boolean(healthSummary.scanning));
      if (healthReport.runAt) setReport(healthReport);
    } catch (err) {
      setError(err instanceof ApiClientError ? err.message : 'Không tải được trạng thái hệ thống');
    }
  }, []);

  useEffect(() => {
    void load();
    return () => {
      if (pollRef.current) clearInterval(pollRef.current);
    };
  }, [load]);

  const filteredFindings = useMemo(() => {
    if (!report) return [];
    if (filter === 'all') return report.findings;
    return report.findings.filter((f) => f.severity === filter);
  }, [report, filter]);

  async function pollUntilDone() {
    if (pollRef.current) clearInterval(pollRef.current);
    pollRef.current = setInterval(() => {
      void (async () => {
        const status = await systemHealthApi.getStatus();
        if (!status.running) {
          if (pollRef.current) clearInterval(pollRef.current);
          pollRef.current = null;
          setScanning(false);
          await load();
        }
      })();
    }, 2000);
  }

  async function runScan() {
    setScanning(true);
    setError(null);
    try {
      await systemHealthApi.runScan();
      await pollUntilDone();
    } catch (err) {
      setScanning(false);
      setError(err instanceof ApiClientError ? err.message : 'Quét hệ thống thất bại');
    }
  }

  async function runAutoFix() {
    setFixing(true);
    setError(null);
    try {
      const result = await systemHealthApi.autoFix();
      setReport(result.report);
      setSummary({
        healthScore: result.report.healthScore,
        productionLabel: result.report.productionLabel,
        status: result.report.status,
        runAt: result.report.runAt,
        lastScanAt: result.report.runAt,
        scanning: false,
        summary: result.report.summary,
      });
    } catch (err) {
      setError(err instanceof ApiClientError ? err.message : 'Auto Fix thất bại');
    } finally {
      setFixing(false);
    }
  }

  async function downloadExport(path: 'json' | 'pdf') {
    const token = getAccessToken();
    const url = path === 'json' ? systemHealthApi.exportJsonUrl() : systemHealthApi.exportPdfUrl();
    const res = await fetch(url, { headers: token ? { Authorization: `Bearer ${token}` } : {} });
    if (!res.ok) throw new Error('Export failed');
    const blob = await res.blob();
    const href = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = href;
    a.download = path === 'json' ? 'health-report.json' : 'health-report.pdf';
    a.click();
    URL.revokeObjectURL(href);
  }

  return (
    <RequirePermission permission="settings.manage">
      <div className="space-y-6">
        <ConfigurationAuditBar module="health" />
        <div className="flex flex-wrap items-center justify-end gap-2">
            <Button onClick={() => void runScan()} disabled={scanning}>
              {scanning ? 'Đang quét…' : 'Kiểm tra hệ thống'}
            </Button>
            <Button variant="secondary" onClick={() => void runAutoFix()} disabled={fixing || !report?.findings.some((f) => f.autoFixable)}>
              {fixing ? 'Đang sửa…' : 'Tự sửa'}
            </Button>
            <Button variant="secondary" onClick={() => void downloadExport('json')}>{vi.configuration.exportJson}</Button>
            <Button variant="secondary" onClick={() => void downloadExport('pdf')}>Xuất PDF</Button>
        </div>

        {error && <ErrorMessage message={error} />}

        {summary && (
          <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
            <Card>
              <p className="text-sm text-zinc-500">Production Readiness</p>
              <p className="mt-1 text-2xl font-bold">{summary.productionLabel ?? 'Production Ready'}</p>
              <p className="mt-2 text-4xl font-bold">{summary.healthScore}%</p>
              <Badge tone={SEVERITY_TONE[summary.status]}>{summary.status.toUpperCase()}</Badge>
            </Card>
            <Card>
              <p className="text-sm text-zinc-500">Last Scan</p>
              <p className="mt-1 text-lg font-semibold">{summary.lastScanAt ? formatDateTime(summary.lastScanAt) : 'Chưa quét'}</p>
              <p className="text-sm text-zinc-500">{scanning ? 'Scan đang chạy…' : formatRelative(summary.lastScanAt)}</p>
            </Card>
            <Card>
              <p className="text-sm text-zinc-500">Warnings</p>
              <p className="mt-1 text-3xl font-bold text-amber-600">{summary.summary.warning}</p>
            </Card>
            <Card>
              <p className="text-sm text-zinc-500">Errors</p>
              <p className="mt-1 text-3xl font-bold text-red-600">{summary.summary.error}</p>
            </Card>
          </div>
        )}

        {(summary?.systemVersion ?? ops?.systemVersion) && (
          <OpsSection title={vi.settings.systemVersionTitle}>
            {(() => {
              const version = summary?.systemVersion ?? ops?.systemVersion!;
              return (
                <div className="space-y-2 text-sm">
                  {(summary?.versionMismatch || version.versionMismatch) && (
                    <Badge tone="warning">{vi.settings.versionMismatch}</Badge>
                  )}
                  <p>Build: <strong>{version.build}</strong></p>
                  <p>Database Migration: <strong>{version.database.migrationCount}</strong></p>
                  <div className="grid gap-1 sm:grid-cols-2">
                    <p>API: {version.services.api.version} {version.services.api.status === 'ok' ? '✓' : '⚠'}</p>
                    <p>WEB: {version.services.web.version} {version.services.web.status === 'ok' ? '✓' : '⚠'}</p>
                    <p>ADMIN: {version.services.admin.version} {version.services.admin.status === 'ok' ? '✓' : '⚠'}</p>
                    <p>WORKER: {version.services.worker.version} {version.services.worker.status === 'ok' ? '✓' : '⚠'}</p>
                  </div>
                  {version.gitCommit && <p>Git Commit: {version.gitCommit}</p>}
                  {version.deployTime && <p>Deploy Time: {formatDateTime(version.deployTime)}</p>}
                </div>
              );
            })()}
          </OpsSection>
        )}

        {ops && (
          <div className="grid gap-4 xl:grid-cols-2">
            <OpsSection title="Payment Strategy">
              <div className="space-y-3">
                {ops.payment.map((g) => (
                  <div key={g.id} className="rounded-lg border border-zinc-100 px-3 py-3 text-sm">
                    <div className="flex items-center justify-between gap-2">
                      <span className="font-semibold">
                        {!g.comingSoon && g.priorityLabel ? `${g.priorityLabel} ` : ''}
                        {g.label}
                      </span>
                      {g.comingSoon ? (
                        <Badge tone="default">Coming Soon</Badge>
                      ) : (
                        <Badge tone={g.healthy ? 'success' : g.enabled ? 'warning' : 'default'}>
                          {g.healthy ? 'Healthy' : g.enabled ? 'Enabled' : 'Disabled'}
                        </Badge>
                      )}
                    </div>
                    {g.checks?.map((check) => (
                      <p key={check} className="text-zinc-600">✓ {check}</p>
                    ))}
                    {g.lastCheckAt && !g.comingSoon && (
                      <p className="mt-1 text-xs text-zinc-500">
                        Last Check: {formatRelative(g.lastCheckAt)}
                      </p>
                    )}
                  </div>
                ))}
              </div>
            </OpsSection>

            <OpsSection title="Providers">
              <div className="space-y-3">
                {ops.providers.map((p) => (
                  <div key={p.id} className="rounded-lg border border-zinc-100 px-3 py-2 text-sm">
                    <div className="flex items-center justify-between">
                      <span className="font-semibold">{p.name}</span>
                      <Badge tone={p.healthStatus === 'ONLINE' ? 'success' : 'warning'}>{p.healthStatus}</Badge>
                    </div>
                    <p className="text-zinc-600">Balance: {p.balance ? formatVnd(p.balance) : '—'}</p>
                    <p className="text-zinc-600">Last Sync: {formatRelative(p.lastSyncAt)}</p>
                    <p className="text-zinc-600">API: {p.apiLatencyMs != null ? `${p.apiLatencyMs} ms` : '—'}</p>
                  </div>
                ))}
              </div>
            </OpsSection>

            <OpsSection title="Queue">
              <div className="grid grid-cols-2 gap-2 text-sm">
                <div>Waiting: <strong>{ops.queue.waiting}</strong></div>
                <div>Processing: <strong>{ops.queue.processing}</strong></div>
                <div>Completed: <strong>{ops.queue.completed}</strong></div>
                <div>Failed: <strong>{ops.queue.failed}</strong></div>
              </div>
              <p className="mt-2 text-sm">Redis: <Badge tone={ops.queue.redisStatus === 'ok' ? 'success' : 'danger'}>{ops.queue.redisStatus}</Badge></p>
            </OpsSection>

            <OpsSection title="Storage">
              <p className="text-sm capitalize">Provider: {ops.storage.provider}</p>
              <p className="text-sm">Bucket: {ops.storage.bucket ?? '—'}</p>
              <p className="text-sm">Region: {ops.storage.region ?? '—'}</p>
              <p className="text-sm">Objects: {ops.storage.objectCount ?? '—'}</p>
              <p className="text-sm">Latency: {ops.storage.latencyMs != null ? `${ops.storage.latencyMs} ms` : '—'}</p>
            </OpsSection>

            <OpsSection title="SMTP">
              <p className="text-sm">{ops.smtp.connected ? 'SMTP Connected' : 'SMTP Not Connected'}</p>
              <p className="text-sm">TLS: {ops.smtp.tls ? 'Yes' : 'No'}</p>
              <p className="text-sm">Host: {ops.smtp.host ?? '—'}</p>
              <p className="text-sm">Last Send: {formatRelative(ops.smtp.lastSendAt)}</p>
              <p className="text-sm">Queue: {ops.smtp.queueDepth}</p>
            </OpsSection>

            <OpsSection title="SEO">
              <div className="grid grid-cols-2 gap-1 text-sm">
                <div>robots: {ops.seo.robotsConfigured ? '✓' : '✗'}</div>
                <div>sitemap: {ops.seo.sitemapEnabled ? '✓' : '✗'}</div>
                <div>canonical issues: {ops.seo.canonicalIssues}</div>
                <div>broken links: {ops.seo.brokenLinks}</div>
                <div>missing meta: {ops.seo.missingMeta}</div>
                <div>missing OG: {ops.seo.missingOg}</div>
                <div>404: {ops.seo.notFoundPages}</div>
              </div>
            </OpsSection>

            <OpsSection title="Cron">
              <p className="text-sm">Cron Running: {ops.cron.running ? 'Yes' : 'No'}</p>
              <p className="text-sm">Last Run: {formatRelative(ops.cron.lastRunAt)}</p>
              <p className="text-sm">Next Run: {ops.cron.nextRunAt ? formatDateTime(ops.cron.nextRunAt) : '—'}</p>
              <p className="text-sm text-zinc-500">{ops.cron.schedule}</p>
            </OpsSection>

            <OpsSection title="Telegram">
              <p className="text-sm">Bot Connected: {ops.telegram.connected ? 'Yes' : 'No'}</p>
              <p className="text-sm">Chat ID: {ops.telegram.chatId || '—'}</p>
              <p className="text-sm">Last Message: {formatRelative(ops.telegram.lastMessageAt)}</p>
            </OpsSection>
          </div>
        )}

        {ops && (
          <OpsSection title="Production Checklist">
            <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-3">
              {ops.checklist.map((item) => (
                <div key={item.id} className="flex items-center justify-between rounded-lg border border-zinc-100 px-3 py-2 text-sm">
                  <span>{item.label}</span>
                  <Badge tone={SEVERITY_TONE[CHECKLIST_TONE[item.status]]}>{item.status.toUpperCase()}</Badge>
                </div>
              ))}
            </div>
          </OpsSection>
        )}

        {report && (
          <>
            <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-4">
              {report.domains.map((domain) => (
                <Card key={domain.domain}>
                  <div className="flex items-center justify-between">
                    <h3 className="font-semibold">{domain.label}</h3>
                    <Badge tone={SEVERITY_TONE[domain.status]}>{domain.status}</Badge>
                  </div>
                  <p className="mt-2 text-sm text-zinc-600">
                    OK {domain.okCount} · ⚠ {domain.warningCount} · ✕ {domain.errorCount}
                  </p>
                </Card>
              ))}
            </div>

            <Card>
              <div className="flex flex-wrap gap-2 border-b border-zinc-100 pb-3">
                {(['all', 'error', 'warning', 'ok'] as FilterSeverity[]).map((value) => (
                  <button
                    key={value}
                    type="button"
                    onClick={() => setFilter(value)}
                    className={`rounded-full px-3 py-1 text-sm ${filter === value ? 'bg-admin-600 text-white' : 'bg-zinc-100'}`}
                  >
                    {value === 'all' ? 'All' : value.charAt(0).toUpperCase() + value.slice(1)}
                  </button>
                ))}
              </div>
              <div className="mt-4 space-y-3">
                {filteredFindings.length === 0 ? (
                  <p className="text-sm text-zinc-500">Không có mục nào cho bộ lọc này.</p>
                ) : (
                  filteredFindings.map((finding) => (
                    <div key={finding.id} className="rounded-lg border border-zinc-100 px-4 py-3">
                      <div className="flex flex-wrap items-center gap-2">
                        <span>{finding.severity === 'error' ? '❌' : finding.severity === 'warning' ? '⚠' : '✓'}</span>
                        <Badge tone={SEVERITY_TONE[finding.severity]}>{finding.entityType}</Badge>
                        <span className="font-medium">{finding.entityLabel}</span>
                        {finding.autoFixable && <Badge tone="info">Auto Fix</Badge>}
                      </div>
                      <p className="mt-1 text-sm text-zinc-600">{finding.message}</p>
                    </div>
                  ))
                )}
              </div>
            </Card>
          </>
        )}

        <p className="text-xs text-zinc-400">
          Cron quét tự động lúc 03:00. Telegram alert khi Health Score &lt; 90% hoặc có Error.
        </p>
      </div>
    </RequirePermission>
  );
}
