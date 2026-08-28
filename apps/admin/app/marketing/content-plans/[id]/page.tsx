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
import type { ContentAutomationContext, ContentPlanDetail } from '@/types/api';

type Tab = 'overview' | 'intelligence' | 'outline' | 'article' | 'quality' | 'context';

export default function ContentPlanDetailPage() {
  const params = useParams<{ id: string }>();
  const planId = params.id;
  const toast = useToast();
  const [tab, setTab] = useState<Tab>('overview');
  const [plan, setPlan] = useState<ContentPlanDetail | null>(null);
  const [context, setContext] = useState<ContentAutomationContext | null>(null);
  const [previewHtml, setPreviewHtml] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [actionLoading, setActionLoading] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const [planRes, contextRes] = await Promise.all([
        contentAutomationApi.getPlan(planId),
        contentAutomationApi.getPlanContext(planId),
      ]);
      setPlan(planRes);
      setContext(contextRes);
      setError(null);
    } catch (err) {
      setError(err instanceof ApiClientError ? err.message : vi.app.requestFailed);
    } finally {
      setLoading(false);
    }
  }, [planId]);

  useEffect(() => {
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
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <Link href="/marketing/content-plans" className="text-sm text-primary hover:underline">
              ← Danh sách kế hoạch
            </Link>
            <h1 className="text-xl font-semibold">{plan?.topic ?? 'Kế hoạch nội dung'}</h1>
            {plan ? (
              <p className="text-sm text-muted-foreground">
                {plan.status} · {plan.primaryKeyword} · epoch {plan.generationEpoch}
              </p>
            ) : null}
          </div>
          <div className="flex flex-wrap gap-2">
            {plan?.status === 'DRAFT' ? (
              <Button
                onClick={() => void runAction('Đã xếp hàng phân tích', () => contentAutomationApi.analyzePlan(planId))}
                disabled={actionLoading}
              >
                Analyze
              </Button>
            ) : null}
            {plan?.status === 'PLANNED' ? (
              <Button
                onClick={() =>
                  void runAction('Đã xếp hàng outline', () => contentAutomationApi.generateOutline(planId))
                }
                disabled={actionLoading}
              >
                Generate Outline
              </Button>
            ) : null}
            {plan?.status === 'OUTLINE_READY' ? (
              <>
                <Button
                  onClick={() =>
                    void runAction('Outline đã duyệt', () => contentAutomationApi.approveOutline(planId))
                  }
                  disabled={actionLoading}
                >
                  Approve Outline
                </Button>
                <Button
                  variant="secondary"
                  onClick={() =>
                    void runAction('Outline bị từ chối', () => contentAutomationApi.rejectOutline(planId))
                  }
                  disabled={actionLoading}
                >
                  Reject Outline
                </Button>
              </>
            ) : null}
            {plan?.status === 'OUTLINE_APPROVED' ? (
              <Button
                onClick={() =>
                  void runAction('Đã xếp hàng viết bài', () => contentAutomationApi.generateArticle(planId))
                }
                disabled={actionLoading}
              >
                Generate Article
              </Button>
            ) : null}
            {plan?.status === 'CONTENT_READY' ? (
              <Button
                onClick={() =>
                  void runAction('Quality gate đã chạy', () => contentAutomationApi.runQualityGate(planId))
                }
                disabled={actionLoading}
              >
                Run Quality Gate
              </Button>
            ) : null}
            {plan?.status === 'IN_REVIEW' ? (
              <>
                <Button
                  onClick={() =>
                    void runAction('Nội dung đã duyệt', () => contentAutomationApi.approveContent(planId))
                  }
                  disabled={actionLoading}
                >
                  Approve Content
                </Button>
                <Button
                  variant="secondary"
                  onClick={() =>
                    void runAction('Từ chối — viết lại', () =>
                      contentAutomationApi.rejectContent(planId, 're-write'),
                    )
                  }
                  disabled={actionLoading}
                >
                  Reject (re-write)
                </Button>
              </>
            ) : null}
            {plan?.status === 'APPROVED' ? (
              <Button
                onClick={() =>
                  void runAction('CMS draft đã tạo', () => contentAutomationApi.createCmsDraft(planId))
                }
                disabled={actionLoading}
              >
                Create CMS Draft
              </Button>
            ) : null}
            {article ? (
              <Button variant="secondary" onClick={() => void loadPreview()} disabled={actionLoading}>
                Preview HTML
              </Button>
            ) : null}
            {plan && plan.status !== 'ARCHIVED' ? (
              <Button
                variant="secondary"
                onClick={() => void runAction('Đã lưu trữ', () => contentAutomationApi.archivePlan(planId))}
                disabled={actionLoading}
              >
                Archive
              </Button>
            ) : null}
            <Button variant="secondary" onClick={() => void load()}>
              {vi.app.refresh}
            </Button>
          </div>
        </div>

        {error ? <ErrorMessage message={error} /> : null}
        {loading ? <p>{vi.app.loading}</p> : null}

        {plan ? (
          <>
            <div className="flex flex-wrap gap-2 border-b pb-2">
              {(['overview', 'intelligence', 'outline', 'article', 'quality', 'context'] as Tab[]).map((t) => (
                <button
                  key={t}
                  type="button"
                  className={`rounded px-3 py-1 text-sm capitalize ${
                    tab === t ? 'bg-primary text-primary-foreground' : 'bg-muted'
                  }`}
                  onClick={() => setTab(t)}
                >
                  {t}
                </button>
              ))}
            </div>

            {tab === 'overview' ? (
              <Card className="space-y-3 p-4 text-sm">
                <Row label="Chủ đề" value={plan.topic} />
                <Row label="Từ khóa chính" value={plan.primaryKeyword} />
                <Row label="Status" value={plan.status} />
                <Row label="CMS page ID" value={plan.cmsPageId ?? '—'} />
                <Row label="Suggested title" value={plan.suggestedTitle ?? '—'} />
              </Card>
            ) : null}

            {tab === 'intelligence' ? (
              <JsonCard data={intelligence} empty="Chưa có intelligence — chạy Analyze." />
            ) : null}

            {tab === 'outline' ? (
              <JsonCard data={outline} empty="Chưa có outline — Generate Outline khi PLANNED." />
            ) : null}

            {tab === 'article' ? (
              <div className="space-y-4">
                <JsonCard data={article} empty="Chưa có article — Generate Article khi OUTLINE_APPROVED." />
                {previewHtml ? (
                  <Card className="p-4">
                    <h3 className="mb-2 font-medium">HTML Preview</h3>
                    <div
                      className="prose max-w-none rounded border bg-white p-4 text-sm"
                      dangerouslySetInnerHTML={{ __html: previewHtml }}
                    />
                  </Card>
                ) : null}
              </div>
            ) : null}

            {tab === 'quality' ? (
              <JsonCard
                data={quality}
                empty="Chưa có quality report — chạy Quality Gate sau Generate Article."
              />
            ) : null}

            {tab === 'context' && context ? (
              <JsonCard data={context} empty="" />
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
