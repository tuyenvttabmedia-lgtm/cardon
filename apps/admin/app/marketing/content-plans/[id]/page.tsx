'use client';

import Link from 'next/link';
import { useParams } from 'next/navigation';
import { useCallback, useEffect, useRef, useState } from 'react';
import { ArticlePreviewModal } from '@/components/marketing/cms-editor/ArticlePreviewModal';
import { MarketingNav } from '@/components/marketing/MarketingNav';
import { RequirePermission } from '@/components/layout/AdminShell';
import { Card, ErrorMessage } from '@/components/ui/Display';
import { Button } from '@/components/ui/Form';
import { useToast } from '@/components/ui/Toast';
import { vi } from '@/lib/i18n/vi';
import { ApiClientError } from '@/services/api-client';
import { contentAutomationApi } from '@/services/content-automation-api';
import type {
  ContentAiRunListItem,
  ContentAutomationContext,
  ContentPlanDetail,
} from '@/types/api';

type Tab = 'overview' | 'intelligence' | 'outline' | 'article' | 'quality' | 'context' | 'aiRuns';

type QualityCheck = {
  code: string;
  layer: 1 | 2 | 3;
  severity: 'error' | 'warning' | 'info';
  message: string;
  passed: boolean;
};

type QualityReport = {
  version?: string;
  checkedAt?: string;
  passed?: boolean;
  layer1Passed?: boolean;
  layer2Passed?: boolean;
  layer3Score?: number;
  checks?: QualityCheck[];
};

const cp = vi.contentPlans;

const TAB_LABELS: Record<Tab, string> = {
  overview: cp.tabs.overview,
  intelligence: cp.tabs.intelligence,
  outline: cp.tabs.outline,
  article: cp.tabs.article,
  quality: cp.tabs.quality,
  context: cp.tabs.context,
  aiRuns: cp.tabs.aiRuns,
};

const AI_POLL_INTERVAL_MS = 4_000;
const AI_POLL_MAX_MS = 180_000;
const TERMINAL_RUN_STATUSES = new Set(['SUCCEEDED', 'FAILED', 'CANCELLED']);

function statusLabel(status: string) {
  return (cp.statusLabels as Record<string, string>)[status] ?? status;
}

function formatCost(costUsd: string | null): string {
  if (costUsd == null || costUsd === '') return '—';
  const n = Number(costUsd);
  if (!Number.isFinite(n)) return costUsd;
  return n.toFixed(4);
}

function parseQualityReport(raw: unknown): QualityReport | null {
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return null;
  const obj = raw as QualityReport;
  if (!Array.isArray(obj.checks)) return null;
  return obj;
}

export default function ContentPlanDetailPage() {
  const params = useParams<{ id: string }>();
  const planId = params.id;
  const toast = useToast();
  const [tab, setTab] = useState<Tab>('overview');
  const [plan, setPlan] = useState<ContentPlanDetail | null>(null);
  const [context, setContext] = useState<ContentAutomationContext | null>(null);
  const [aiRuns, setAiRuns] = useState<ContentAiRunListItem[]>([]);
  const [previewOpen, setPreviewOpen] = useState(false);
  const [previewHtml, setPreviewHtml] = useState<string>('');
  const [previewLoading, setPreviewLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [actionLoading, setActionLoading] = useState(false);
  const [pollingAi, setPollingAi] = useState(false);
  const [featureEnabled, setFeatureEnabled] = useState<boolean | null>(null);
  const [aiConfigured, setAiConfigured] = useState<boolean | null>(null);
  const [promptsReady, setPromptsReady] = useState<boolean | null>(null);
  const pollAbortRef = useRef(0);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const [planRes, contextRes, runsRes] = await Promise.all([
        contentAutomationApi.getPlan(planId),
        contentAutomationApi.getPlanContext(planId),
        contentAutomationApi.listAiRuns(planId),
      ]);
      setPlan(planRes);
      setContext(contextRes);
      setAiRuns(runsRes.items);
      setError(null);
    } catch (err) {
      const message = err instanceof ApiClientError ? err.message : vi.app.requestFailed;
      setError(message);
    } finally {
      setLoading(false);
    }
  }, [planId]);

  const refreshQuiet = useCallback(async (): Promise<{
    plan: ContentPlanDetail;
    runs: ContentAiRunListItem[];
  } | null> => {
    try {
      const [planRes, runsRes] = await Promise.all([
        contentAutomationApi.getPlan(planId),
        contentAutomationApi.listAiRuns(planId),
      ]);
      setPlan(planRes);
      setAiRuns(runsRes.items);
      return { plan: planRes, runs: runsRes.items };
    } catch {
      return null;
    }
  }, [planId]);

  useEffect(() => {
    void contentAutomationApi
      .status()
      .then((s) => {
        setFeatureEnabled(s.enabled);
        setAiConfigured(s.aiConfigured ?? null);
        setPromptsReady(s.promptsReady ?? null);
      })
      .catch(() => undefined);
    void load();
  }, [load]);

  useEffect(() => {
    return () => {
      pollAbortRef.current += 1;
    };
  }, []);

  async function pollAiJob(token: number, aiRunId?: string) {
    setPollingAi(true);
    const started = Date.now();
    try {
      while (Date.now() - started < AI_POLL_MAX_MS) {
        if (token !== pollAbortRef.current) return;
        await new Promise((r) => setTimeout(r, AI_POLL_INTERVAL_MS));
        if (token !== pollAbortRef.current) return;

        if (aiRunId) {
          try {
            const run = await contentAutomationApi.getAiRun(aiRunId);
            await refreshQuiet();
            if (TERMINAL_RUN_STATUSES.has(run.status)) {
              if (run.status === 'FAILED' || run.status === 'CANCELLED') {
                toast.error(run.error ? `${cp.aiJobFailed}: ${run.error}` : cp.aiJobFailed);
              } else if (run.provider === 'heuristic') {
                toast.error(cp.heuristicWarning);
              } else {
                toast.success(cp.aiJobDone);
              }
              return;
            }
            continue;
          } catch {
            // fall through to plan refresh
          }
        }

        const snap = await refreshQuiet();
        if (!snap) continue;
        const tracked = aiRunId
          ? snap.runs.find((r) => r.id === aiRunId)
          : snap.runs[0];
        if (tracked && TERMINAL_RUN_STATUSES.has(tracked.status)) {
          if (tracked.status === 'FAILED' || tracked.status === 'CANCELLED') {
            toast.error(tracked.error ? `${cp.aiJobFailed}: ${tracked.error}` : cp.aiJobFailed);
          } else if (tracked.provider === 'heuristic') {
            toast.error(cp.heuristicWarning);
          } else {
            toast.success(cp.aiJobDone);
          }
          return;
        }
      }
      if (token === pollAbortRef.current) {
        toast.error(cp.aiJobTimeout);
      }
    } finally {
      if (token === pollAbortRef.current) {
        setPollingAi(false);
      }
    }
  }

  async function runAction(
    label: string,
    fn: () => Promise<unknown>,
    opts?: { pollAi?: boolean; switchTab?: Tab },
  ) {
    setActionLoading(true);
    try {
      const result = await fn();
      toast.success(label);
      await load();
      if (opts?.switchTab) {
        setTab(opts.switchTab);
      }
      if (opts?.pollAi) {
        const aiRunId =
          result &&
          typeof result === 'object' &&
          'aiRunId' in result &&
          typeof (result as { aiRunId: unknown }).aiRunId === 'string'
            ? (result as { aiRunId: string }).aiRunId
            : undefined;
        const token = ++pollAbortRef.current;
        void pollAiJob(token, aiRunId);
      }
    } catch (err) {
      toast.error(err instanceof ApiClientError ? err.message : vi.app.requestFailed);
    } finally {
      setActionLoading(false);
    }
  }

  async function openPreview() {
    setPreviewLoading(true);
    try {
      const res = await contentAutomationApi.getPreview(planId);
      setPreviewHtml(res.html || '');
      setPreviewOpen(true);
    } catch (err) {
      toast.error(err instanceof ApiClientError ? err.message : vi.app.requestFailed);
    } finally {
      setPreviewLoading(false);
    }
  }

  // Plan metadata edits + quality/approve/CMS stay available; only AI enqueue needs flag ON.
  const busy = actionLoading || pollingAi;
  const aiActionsDisabled = busy || featureEnabled === false;
  const mutationsDisabled = busy;
  const intelligence = plan?.intelligenceSnapshot;
  const outline = plan?.outline;
  const article = plan?.articleDocument;
  const quality = parseQualityReport(plan?.qualityReport);
  const articleTitle =
    (typeof article?.title === 'string' && article.title) ||
    plan?.suggestedTitle ||
    plan?.topic ||
    '';
  const articleExcerpt =
    typeof article?.excerpt === 'string' ? article.excerpt : '';

  return (
    <RequirePermission permission="cms.manage">
      <div className="space-y-4">
        <MarketingNav />
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div>
            <Link href="/marketing/content-plans" className="text-sm text-muted-foreground hover:underline">
              {cp.backToList}
            </Link>
            <h1 className="mt-1 text-xl font-semibold">{plan?.topic ?? cp.title}</h1>
            {plan ? (
              <p className="text-sm text-muted-foreground">
                {statusLabel(plan.status)} · {plan.primaryKeyword} · {cp.generationEpoch}{' '}
                {plan.generationEpoch}
                {quality ? (
                  <>
                    {' '}
                    ·{' '}
                    <span className={quality.passed ? 'text-emerald-700' : 'text-red-700'}>
                      {quality.passed ? cp.qualityPassed : cp.qualityFailed}
                    </span>
                  </>
                ) : null}
              </p>
            ) : null}
            {pollingAi ? <p className="mt-1 text-sm text-amber-800">{cp.aiJobPolling}</p> : null}
          </div>
          <div className="flex flex-wrap gap-2">
            {/* action buttons preserved below via existing conditions */}
            {plan?.status === 'DRAFT' ? (
              <Button
                onClick={() =>
                  void runAction(
                    cp.actions.analyzeDone,
                    () => contentAutomationApi.analyzePlan(planId),
                    { pollAi: true },
                  )
                }
                disabled={aiActionsDisabled}
              >
                {cp.actions.analyze}
              </Button>
            ) : null}
            {plan?.status === 'PLANNED' ? (
              <Button
                onClick={() =>
                  void runAction(
                    cp.actions.generateOutlineDone,
                    () => contentAutomationApi.generateOutline(planId),
                    { pollAi: true },
                  )
                }
                disabled={aiActionsDisabled}
              >
                {cp.actions.generateOutline}
              </Button>
            ) : null}
            {plan?.status === 'OUTLINE_READY' ? (
              <>
                <Button
                  onClick={() =>
                    void runAction(cp.actions.approveOutlineDone, () =>
                      contentAutomationApi.approveOutline(planId),
                    )
                  }
                  disabled={mutationsDisabled}
                >
                  {cp.actions.approveOutline}
                </Button>
                <Button
                  variant="secondary"
                  onClick={() =>
                    void runAction(cp.actions.rejectOutlineDone, () =>
                      contentAutomationApi.rejectOutline(planId),
                    )
                  }
                  disabled={mutationsDisabled}
                >
                  {cp.actions.rejectOutline}
                </Button>
              </>
            ) : null}
            {plan?.status === 'OUTLINE_APPROVED' ? (
              <Button
                onClick={() =>
                  void runAction(
                    cp.actions.generateArticleDone,
                    () => contentAutomationApi.generateArticle(planId),
                    { pollAi: true },
                  )
                }
                disabled={aiActionsDisabled}
              >
                {cp.actions.generateArticle}
              </Button>
            ) : null}
            {plan?.status === 'CONTENT_READY' || plan?.status === 'IN_REVIEW' ? (
              <Button
                onClick={() =>
                  void runAction(
                    cp.actions.runQualityGateDone,
                    () => contentAutomationApi.runQualityGate(planId),
                    { switchTab: 'quality' },
                  )
                }
                disabled={mutationsDisabled}
              >
                {cp.actions.runQualityGate}
              </Button>
            ) : null}
            {plan?.status === 'IN_REVIEW' ? (
              <>
                <Button
                  onClick={() =>
                    void runAction(cp.actions.approveContentDone, () =>
                      contentAutomationApi.approveContent(planId),
                    )
                  }
                  disabled={mutationsDisabled}
                >
                  {cp.actions.approveContent}
                </Button>
                <Button
                  variant="secondary"
                  onClick={() =>
                    void runAction(cp.actions.rejectRewriteDone, () =>
                      contentAutomationApi.rejectContent(planId, 're-write'),
                    )
                  }
                  disabled={mutationsDisabled}
                >
                  {cp.actions.rejectRewrite}
                </Button>
                <Button
                  variant="secondary"
                  onClick={() =>
                    void runAction(cp.actions.rejectReOutlineDone, () =>
                      contentAutomationApi.rejectContent(planId, 're-outline'),
                    )
                  }
                  disabled={mutationsDisabled}
                >
                  {cp.actions.rejectReOutline}
                </Button>
              </>
            ) : null}
            {plan?.status === 'APPROVED' ? (
              <>
                <Button
                  onClick={() =>
                    void runAction(cp.actions.createCmsDraftDone, () =>
                      contentAutomationApi.createCmsDraft(planId, false),
                    )
                  }
                  disabled={mutationsDisabled}
                >
                  {cp.actions.createCmsDraft}
                </Button>
                {plan.cmsPageId ? (
                  <Button
                    variant="secondary"
                    onClick={() =>
                      void runAction(cp.actions.createCmsDraftDone, () =>
                        contentAutomationApi.createCmsDraft(planId, true),
                      )
                    }
                    disabled={mutationsDisabled}
                  >
                    {cp.forceCmsUpdate}
                  </Button>
                ) : null}
              </>
            ) : null}
            {plan?.cmsPageId ? (
              <Link
                href={`/marketing/articles?pageId=${encodeURIComponent(plan.cmsPageId)}`}
                className="inline-flex items-center rounded-md border px-3 py-2 text-sm hover:bg-muted"
              >
                {cp.openCms}
              </Link>
            ) : null}
            {article ? (
              <Button
                variant="secondary"
                onClick={() => void openPreview()}
                disabled={busy || previewLoading}
              >
                {previewLoading ? vi.app.loading : cp.actions.previewHtml}
              </Button>
            ) : null}
            {plan && plan.status !== 'ARCHIVED' ? (
              <Button
                variant="secondary"
                onClick={() =>
                  void runAction(cp.actions.archiveDone, () => contentAutomationApi.archivePlan(planId))
                }
                disabled={mutationsDisabled}
              >
                {cp.actions.archive}
              </Button>
            ) : null}
            <Button variant="secondary" onClick={() => void load()} disabled={busy}>
              {vi.app.refresh}
            </Button>
          </div>
        </div>

        {featureEnabled === false ? (
          <p className="rounded-lg border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-900">
            {cp.disabledBanner}{' '}
            <Link href="/configuration/content-ai" className="font-medium underline">
              Content AI
            </Link>
          </p>
        ) : null}
        {featureEnabled === true && aiConfigured === false ? (
          <p className="rounded-lg border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-900">
            {cp.aiNotConfiguredBanner}{' '}
            <Link href="/configuration/content-ai" className="font-medium underline">
              Content AI
            </Link>
          </p>
        ) : null}
        {featureEnabled === true && promptsReady === false ? (
          <p className="rounded-lg border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-900">
            {cp.promptsMissingBanner}
          </p>
        ) : null}

        {error ? <ErrorMessage message={error} /> : null}
        {loading ? <p>{vi.app.loading}</p> : null}

        {plan ? (
          <>
            <div className="flex flex-wrap gap-2 border-b pb-2">
              {(
                [
                  'overview',
                  'intelligence',
                  'outline',
                  'article',
                  'quality',
                  'context',
                  'aiRuns',
                ] as Tab[]
              ).map((t) => (
                <button
                  key={t}
                  type="button"
                  className={`rounded px-3 py-1 text-sm ${
                    tab === t ? 'bg-primary text-primary-foreground' : 'bg-muted'
                  }`}
                  onClick={() => setTab(t)}
                >
                  {TAB_LABELS[t]}
                  {t === 'quality' && quality ? (
                    <span
                      className={`ml-1 inline-block h-2 w-2 rounded-full ${
                        quality.passed ? 'bg-emerald-400' : 'bg-red-400'
                      }`}
                    />
                  ) : null}
                </button>
              ))}
            </div>

            {tab === 'overview' ? (
              <Card className="space-y-3 p-4 text-sm">
                <Row label={cp.topic} value={plan.topic} />
                <Row label={cp.primaryKeyword} value={plan.primaryKeyword} />
                <Row label={cp.status} value={statusLabel(plan.status)} />
                <Row
                  label={cp.contentType}
                  value={
                    (cp.contentTypeLabels as Record<string, string>)[plan.contentType] ??
                    plan.contentType
                  }
                />
                <Row
                  label={cp.searchIntent}
                  value={
                    (cp.searchIntentLabels as Record<string, string>)[plan.searchIntent] ??
                    plan.searchIntent
                  }
                />
                <Row label={cp.suggestedTitle} value={plan.suggestedTitle ?? '—'} />
                <Row label={cp.cmsPageId} value={plan.cmsPageId ?? '—'} />
              </Card>
            ) : null}

            {tab === 'intelligence' ? (
              <JsonCard data={intelligence} empty={cp.emptyIntelligence} />
            ) : null}

            {tab === 'outline' ? <JsonCard data={outline} empty={cp.emptyOutline} /> : null}

            {tab === 'article' ? (
              <div className="space-y-4">
                <div className="flex justify-end">
                  <Button
                    variant="secondary"
                    onClick={() => void openPreview()}
                    disabled={busy || previewLoading || !article}
                  >
                    {previewLoading ? vi.app.loading : cp.actions.previewHtml}
                  </Button>
                </div>
                <JsonCard data={article} empty={cp.emptyArticle} />
              </div>
            ) : null}

            {tab === 'quality' ? <QualityReportPanel report={quality} /> : null}

            {tab === 'context' && context ? <JsonCard data={context} empty="" /> : null}

            {tab === 'aiRuns' ? (
              <Card className="p-4 text-sm">
                {aiRuns.length === 0 ? (
                  <p className="text-muted-foreground">{cp.emptyAiRuns}</p>
                ) : (
                  <div className="overflow-x-auto">
                    <table className="min-w-full text-left">
                      <thead>
                        <tr className="border-b">
                          <th className="py-2 pr-3">Task</th>
                          <th className="py-2 pr-3">{cp.status}</th>
                          <th className="py-2 pr-3">{cp.generationEpoch}</th>
                          <th className="py-2 pr-3">Provider</th>
                          <th className="py-2 pr-3">Model</th>
                          <th className="py-2 pr-3">Tokens</th>
                          <th className="py-2 pr-3">{cp.costUsd}</th>
                          <th className="py-2 pr-3">Lỗi</th>
                          <th className="py-2">{cp.updatedAt}</th>
                        </tr>
                      </thead>
                      <tbody>
                        {aiRuns.map((run) => {
                          const isHeuristic = run.provider === 'heuristic';
                          return (
                            <tr key={run.id} className="border-b align-top">
                              <td className="py-2 pr-3">{run.task}</td>
                              <td className="py-2 pr-3">{run.status}</td>
                              <td className="py-2 pr-3">{run.generationEpoch}</td>
                              <td className="py-2 pr-3">
                                {run.provider ?? '—'}
                                {isHeuristic ? (
                                  <span className="mt-1 block text-xs font-medium text-amber-800">
                                    {cp.heuristicBadge}
                                  </span>
                                ) : null}
                              </td>
                              <td className="py-2 pr-3">{run.model ?? '—'}</td>
                              <td className="py-2 pr-3">
                                {run.tokensIn ?? '—'} / {run.tokensOut ?? '—'}
                              </td>
                              <td className="py-2 pr-3 font-mono text-xs">
                                {formatCost(run.costUsd)}
                              </td>
                              <td className="py-2 pr-3 text-xs text-red-600">{run.error ?? '—'}</td>
                              <td className="py-2">
                                {new Date(run.createdAt).toLocaleString('vi-VN')}
                              </td>
                            </tr>
                          );
                        })}
                      </tbody>
                    </table>
                  </div>
                )}
              </Card>
            ) : null}
          </>
        ) : null}

        <ArticlePreviewModal
          open={previewOpen}
          onClose={() => setPreviewOpen(false)}
          title={articleTitle}
          content={previewHtml}
          featuredImage=""
          excerpt={articleExcerpt}
          pageLayout="ARTICLE"
        />
      </div>
    </RequirePermission>
  );
}

function Row({ label, value }: { label: string; value: string }) {
  return (
    <div className="grid grid-cols-[160px_1fr] gap-2">
      <span className="text-muted-foreground">{label}</span>
      <span>{value}</span>
    </div>
  );
}

function JsonCard({ data, empty }: { data: unknown; empty: string }) {
  return (
    <Card className="p-4 text-sm">
      {!data ? (
        <p className="text-muted-foreground">{empty}</p>
      ) : (
        <pre className="overflow-x-auto rounded bg-muted p-3 text-xs">{JSON.stringify(data, null, 2)}</pre>
      )}
    </Card>
  );
}

function QualityReportPanel({ report }: { report: QualityReport | null }) {
  if (!report) {
    return (
      <Card className="p-4 text-sm">
        <p className="text-muted-foreground">{cp.emptyQuality}</p>
      </Card>
    );
  }

  const checks = report.checks ?? [];
  const failed = checks.filter((c) => !c.passed);
  const passed = checks.filter((c) => c.passed);

  return (
    <div className="space-y-4">
      <Card
        className={`space-y-2 border p-4 ${
          report.passed
            ? 'border-emerald-200 bg-emerald-50'
            : 'border-red-200 bg-red-50'
        }`}
      >
        <p className={`text-base font-semibold ${report.passed ? 'text-emerald-900' : 'text-red-900'}`}>
          {report.passed ? cp.qualityPassed : cp.qualityFailed}
        </p>
        <div className="flex flex-wrap gap-3 text-sm">
          <span>
            {cp.qualityLayer1}: {report.layer1Passed ? '✓' : '✗'}
          </span>
          <span>
            {cp.qualityLayer2}: {report.layer2Passed ? '✓' : '✗'}
          </span>
          <span>
            {cp.qualityScore}: {report.layer3Score ?? '—'}
          </span>
          {report.checkedAt ? (
            <span className="text-muted-foreground">
              {cp.qualityCheckedAt}: {new Date(report.checkedAt).toLocaleString('vi-VN')}
            </span>
          ) : null}
        </div>
      </Card>

      {failed.length > 0 ? (
        <Card className="p-4">
          <h3 className="mb-3 font-medium text-red-800">{cp.qualityCheckFailed}</h3>
          <ul className="space-y-2">
            {failed.map((c, i) => (
              <li
                key={`${c.code}-fail-${i}`}
                className="rounded border border-red-200 bg-red-50 px-3 py-2 text-sm"
              >
                <span className="font-mono text-xs text-red-700">L{c.layer} · {c.code}</span>
                <p className="mt-1 text-red-900">{c.message}</p>
              </li>
            ))}
          </ul>
        </Card>
      ) : null}

      <Card className="p-4">
        <h3 className="mb-3 font-medium">{cp.qualityCheckPassed}</h3>
        <ul className="space-y-2">
          {passed.map((c, i) => (
            <li
              key={`${c.code}-ok-${i}`}
              className="rounded border border-slate-200 bg-white px-3 py-2 text-sm"
            >
              <div className="flex items-start justify-between gap-3">
                <div>
                  <span className="font-mono text-xs text-slate-500">L{c.layer} · {c.code}</span>
                  <p className="mt-1 text-slate-800">{c.message}</p>
                </div>
                <span
                  className={`shrink-0 rounded px-2 py-0.5 text-xs ${
                    c.severity === 'warning'
                      ? 'bg-amber-100 text-amber-800'
                      : 'bg-emerald-100 text-emerald-800'
                  }`}
                >
                  {c.severity === 'warning' ? cp.qualityCheckWarn : cp.qualityCheckPassed}
                </span>
              </div>
            </li>
          ))}
        </ul>
      </Card>
    </div>
  );
}
