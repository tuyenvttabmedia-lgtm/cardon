'use client';

import Link from 'next/link';
import { useParams } from 'next/navigation';
import { useCallback, useEffect, useRef, useState } from 'react';
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

export default function ContentPlanDetailPage() {
  const params = useParams<{ id: string }>();
  const planId = params.id;
  const toast = useToast();
  const [tab, setTab] = useState<Tab>('overview');
  const [plan, setPlan] = useState<ContentPlanDetail | null>(null);
  const [context, setContext] = useState<ContentAutomationContext | null>(null);
  const [aiRuns, setAiRuns] = useState<ContentAiRunListItem[]>([]);
  const [previewHtml, setPreviewHtml] = useState<string | null>(null);
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
    opts?: { pollAi?: boolean },
  ) {
    setActionLoading(true);
    try {
      const result = await fn();
      toast.success(label);
      await load();
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

  async function loadPreview() {
    setActionLoading(true);
    try {
      const res = await contentAutomationApi.getPreview(planId);
      setPreviewHtml(res.html);
      setTab('article');
    } catch (err) {
      toast.error(err instanceof ApiClientError ? err.message : vi.app.requestFailed);
    } finally {
      setActionLoading(false);
    }
  }

  const busy = actionLoading || pollingAi;
  const mutationsDisabled = busy || featureEnabled === false;
  const intelligence = plan?.intelligenceSnapshot;
  const outline = plan?.outline;
  const article = plan?.articleDocument;
  const quality = plan?.qualityReport as { passed?: boolean; checks?: unknown[] } | null;

  return (
    <RequirePermission permission="cms.manage">
      <div className="space-y-4">
        <MarketingNav />
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
        {pollingAi ? (
          <p className="rounded-lg border border-sky-200 bg-sky-50 px-4 py-3 text-sm text-sky-900">
            {cp.aiJobPolling}
          </p>
        ) : null}
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <Link href="/marketing/content-plans" className="text-sm text-primary hover:underline">
              {cp.backToList}
            </Link>
            <h1 className="text-xl font-semibold">{plan?.topic ?? cp.title}</h1>
            {plan ? (
              <p className="text-sm text-muted-foreground">
                {statusLabel(plan.status)} · {plan.primaryKeyword} · {cp.generationEpoch}{' '}
                {plan.generationEpoch}
              </p>
            ) : null}
          </div>
          <div className="flex flex-wrap gap-2">
            {plan?.status === 'DRAFT' ? (
              <Button
                onClick={() =>
                  void runAction(
                    cp.actions.analyzeDone,
                    () => contentAutomationApi.analyzePlan(planId),
                    { pollAi: true },
                  )
                }
                disabled={mutationsDisabled}
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
                disabled={mutationsDisabled}
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
                disabled={mutationsDisabled}
              >
                {cp.actions.generateArticle}
              </Button>
            ) : null}
            {plan?.status === 'CONTENT_READY' || plan?.status === 'IN_REVIEW' ? (
              <Button
                onClick={() =>
                  void runAction(cp.actions.runQualityGateDone, () =>
                    contentAutomationApi.runQualityGate(planId),
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
              <Button variant="secondary" onClick={() => void loadPreview()} disabled={busy}>
                {cp.actions.previewHtml}
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
                <JsonCard data={article} empty={cp.emptyArticle} />
                {previewHtml ? (
                  <Card className="p-4">
                    <h3 className="mb-2 font-medium">{cp.htmlPreview}</h3>
                    <div
                      className="prose max-w-none rounded border bg-white p-4 text-sm"
                      dangerouslySetInnerHTML={{ __html: previewHtml }}
                    />
                  </Card>
                ) : null}
              </div>
            ) : null}

            {tab === 'quality' ? <JsonCard data={quality} empty={cp.emptyQuality} /> : null}

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
                          const isTerminal = TERMINAL_RUN_STATUSES.has(run.status);
                          return (
                            <tr
                              key={run.id}
                              className={`border-b align-top ${
                                isHeuristic ? 'bg-amber-50/80' : ''
                              }`}
                            >
                              <td className="py-2 pr-3 font-mono text-xs">{run.task}</td>
                              <td className="py-2 pr-3">
                                {run.status}
                                {!isTerminal ? (
                                  <span className="ml-1 text-xs text-sky-700">…</span>
                                ) : null}
                              </td>
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
