'use client';

import Link from 'next/link';
import { useParams } from 'next/navigation';
import { useCallback, useEffect, useState } from 'react';
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

function statusLabel(status: string) {
  return (cp.statusLabels as Record<string, string>)[status] ?? status;
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
  const [featureEnabled, setFeatureEnabled] = useState<boolean | null>(null);

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
      setFeatureEnabled(true);
    } catch (err) {
      const message = err instanceof ApiClientError ? err.message : vi.app.requestFailed;
      setError(message);
      if (err instanceof ApiClientError && (err.status === 503 || /disabled/i.test(err.message))) {
        setFeatureEnabled(false);
      }
    } finally {
      setLoading(false);
    }
  }, [planId]);

  useEffect(() => {
    void contentAutomationApi
      .status()
      .then((s) => setFeatureEnabled(s.enabled))
      .catch(() => undefined);
    void load();
  }, [load]);

  async function runAction(label: string, fn: () => Promise<unknown>) {
    setActionLoading(true);
    try {
      await fn();
      toast.success(label);
      await load();
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
                  void runAction(cp.actions.analyzeDone, () => contentAutomationApi.analyzePlan(planId))
                }
                disabled={actionLoading || featureEnabled === false}
              >
                {cp.actions.analyze}
              </Button>
            ) : null}
            {plan?.status === 'PLANNED' ? (
              <Button
                onClick={() =>
                  void runAction(cp.actions.generateOutlineDone, () =>
                    contentAutomationApi.generateOutline(planId),
                  )
                }
                disabled={actionLoading || featureEnabled === false}
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
                  disabled={actionLoading}
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
                  disabled={actionLoading}
                >
                  {cp.actions.rejectOutline}
                </Button>
              </>
            ) : null}
            {plan?.status === 'OUTLINE_APPROVED' ? (
              <Button
                onClick={() =>
                  void runAction(cp.actions.generateArticleDone, () =>
                    contentAutomationApi.generateArticle(planId),
                  )
                }
                disabled={actionLoading || featureEnabled === false}
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
                disabled={actionLoading}
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
                  disabled={actionLoading}
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
                  disabled={actionLoading}
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
                  disabled={actionLoading}
                >
                  {cp.actions.rejectReOutline}
                </Button>
              </>
            ) : null}
            {plan?.status === 'APPROVED' ? (
              <Button
                onClick={() =>
                  void runAction(cp.actions.createCmsDraftDone, () =>
                    contentAutomationApi.createCmsDraft(planId),
                  )
                }
                disabled={actionLoading}
              >
                {cp.actions.createCmsDraft}
              </Button>
            ) : null}
            {plan?.cmsPageId ? (
              <Link
                href="/marketing/articles"
                className="inline-flex items-center rounded-md border px-3 py-2 text-sm hover:bg-muted"
              >
                {cp.openCms}
              </Link>
            ) : null}
            {article ? (
              <Button variant="secondary" onClick={() => void loadPreview()} disabled={actionLoading}>
                {cp.actions.previewHtml}
              </Button>
            ) : null}
            {plan && plan.status !== 'ARCHIVED' ? (
              <Button
                variant="secondary"
                onClick={() =>
                  void runAction(cp.actions.archiveDone, () => contentAutomationApi.archivePlan(planId))
                }
                disabled={actionLoading}
              >
                {cp.actions.archive}
              </Button>
            ) : null}
            <Button variant="secondary" onClick={() => void load()}>
              {vi.app.refresh}
            </Button>
          </div>
        </div>

        {error && featureEnabled !== false ? <ErrorMessage message={error} /> : null}
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
                          <th className="py-2 pr-3">Lỗi</th>
                          <th className="py-2">{cp.updatedAt}</th>
                        </tr>
                      </thead>
                      <tbody>
                        {aiRuns.map((run) => (
                          <tr key={run.id} className="border-b align-top">
                            <td className="py-2 pr-3 font-mono text-xs">{run.task}</td>
                            <td className="py-2 pr-3">{run.status}</td>
                            <td className="py-2 pr-3">{run.generationEpoch}</td>
                            <td className="py-2 pr-3">{run.provider ?? '—'}</td>
                            <td className="py-2 pr-3">{run.model ?? '—'}</td>
                            <td className="py-2 pr-3">
                              {run.tokensIn ?? '—'} / {run.tokensOut ?? '—'}
                            </td>
                            <td className="py-2 pr-3 text-xs text-red-600">{run.error ?? '—'}</td>
                            <td className="py-2">
                              {new Date(run.createdAt).toLocaleString('vi-VN')}
                            </td>
                          </tr>
                        ))}
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
