'use client';

import { useCallback, useEffect, useState } from 'react';
import Link from 'next/link';
import { useParams } from 'next/navigation';
import { ApiPageShell } from '@/components/api/ApiSubNav';
import { Badge } from '@/components/ui/Badge';
import { Button } from '@/components/ui/Button';
import { Card } from '@/components/ui/Card';
import { useAgentPlatform } from '@/hooks/useAgentPlatform';
import { formatDateTime } from '@/lib/utils';
import { webhookDeliveryApi, ApiClientError } from '@/services/api-client';
import type { WebhookDeliveryDetail } from '@/types/platform';

export default function WebhookDeliveryDetailPage() {
  const params = useParams<{ id: string }>();
  const { can } = useAgentPlatform();
  const canManage = can('webhooks.manage');
  const [data, setData] = useState<WebhookDeliveryDetail | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [actionMsg, setActionMsg] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const detail = await webhookDeliveryApi.getDetail(params.id);
      setData(detail);
    } catch (e) {
      setError(e instanceof ApiClientError ? e.message : 'Không tải được chi tiết');
    } finally {
      setLoading(false);
    }
  }, [params.id]);

  useEffect(() => {
    void load();
  }, [load]);

  const copyText = async (label: string, text: string) => {
    await navigator.clipboard.writeText(text);
    setActionMsg(`Đã sao chép ${label}`);
    setTimeout(() => setActionMsg(null), 2000);
  };

  const downloadJson = () => {
    if (!data) return;
    const blob = new Blob([JSON.stringify(data.rawPayload, null, 2)], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `webhook-${data.id}.json`;
    a.click();
    URL.revokeObjectURL(url);
  };

  if (loading) {
    return (
      <ApiPageShell title="Chi tiết giao Webhook" description="Đang tải…">
        <Card className="space-y-3 p-6">
          {Array.from({ length: 6 }).map((_, i) => (
            <div key={i} className="h-4 animate-pulse rounded bg-slate-200 dark:bg-slate-700" />
          ))}
        </Card>
      </ApiPageShell>
    );
  }

  if (error || !data) {
    return (
      <ApiPageShell title="Chi tiết giao Webhook">
        <p className="text-sm text-red-600">{error ?? 'Không tìm thấy'}</p>
        <Link href="/api/webhook/deliveries" className="text-indigo-600 hover:underline">
          ← Quay lại lịch sử
        </Link>
      </ApiPageShell>
    );
  }

  return (
    <ApiPageShell
      title="Chi tiết giao Webhook"
      description={`${data.event} · ${data.version} · ${formatDateTime(data.createdAt)}`}
    >
      <div className="mb-4 flex flex-wrap items-center gap-2">
        <Link href="/api/webhook/deliveries" className="text-sm text-indigo-600 hover:underline">
          ← Lịch sử giao
        </Link>
        <Badge tone={data.status === 'Delivered' ? 'success' : data.status === 'DeadLetter' ? 'danger' : 'warning'}>
          {data.status}
        </Badge>
        {actionMsg && <span className="text-sm text-emerald-600">{actionMsg}</span>}
      </div>

      <div className="grid gap-4 lg:grid-cols-2">
        <Card className="space-y-3 p-4">
          <p className="font-semibold">Thông tin giao</p>
          <dl className="space-y-2 text-sm">
            <div>
              <dt className="text-slate-500">URL đích</dt>
              <dd className="break-all font-mono text-xs">{data.requestUrl}</dd>
            </div>
            <div>
              <dt className="text-slate-500">Order ID</dt>
              <dd className="font-mono text-xs">{data.orderId}</dd>
            </div>
            <div>
              <dt className="text-slate-500">HTTP Status</dt>
              <dd>{data.httpStatus ?? '—'}</dd>
            </div>
            <div>
              <dt className="text-slate-500">Chữ ký (masked)</dt>
              <dd className="font-mono text-xs">{data.signature ?? '—'}</dd>
            </div>
          </dl>
          <div className="flex flex-wrap gap-2 pt-2">
            <Button size="sm" variant="secondary" onClick={() => void copyText('payload', JSON.stringify(data.rawPayload))}>
              Sao chép Payload
            </Button>
            {data.signature && (
              <Button size="sm" variant="secondary" onClick={() => void copyText('chữ ký', data.signature!)}>
                Sao chép chữ ký
              </Button>
            )}
            <Button size="sm" variant="secondary" onClick={downloadJson}>
              Tải JSON
            </Button>
            {canManage && data.canRetry && (
              <Button
                size="sm"
                onClick={() =>
                  void webhookDeliveryApi.retry(data.id).then(() => {
                    setActionMsg('Đã xếp hàng thử giao lại');
                    void load();
                  })
                }
              >
                Thử giao lại
              </Button>
            )}
            {canManage && data.canCancel && (
              <Button
                size="sm"
                variant="secondary"
                onClick={() =>
                  void webhookDeliveryApi.cancel(data.id).then(() => {
                    setActionMsg('Đã huỷ giao webhook');
                    void load();
                  })
                }
              >
                Huỷ giao
              </Button>
            )}
          </div>
        </Card>

        <Card className="space-y-3 p-4">
          <p className="font-semibold">Headers gửi đi</p>
          <pre className="max-h-48 overflow-auto rounded bg-slate-50 p-3 text-xs dark:bg-slate-900">
            {JSON.stringify(data.requestHeaders, null, 2)}
          </pre>
          <p className="font-semibold">Payload (đã che)</p>
          <pre className="max-h-48 overflow-auto rounded bg-slate-50 p-3 text-xs dark:bg-slate-900">
            {JSON.stringify(data.payload, null, 2)}
          </pre>
        </Card>

        <Card className="space-y-3 p-4 lg:col-span-2">
          <p className="font-semibold">Phản hồi đối tác</p>
          <dl className="grid gap-3 text-sm sm:grid-cols-2">
            <div>
              <dt className="text-slate-500">Response Headers</dt>
              <pre className="mt-1 max-h-32 overflow-auto rounded bg-slate-50 p-2 text-xs dark:bg-slate-900">
                {JSON.stringify(data.responseHeaders, null, 2)}
              </pre>
            </div>
            <div>
              <dt className="text-slate-500">Response Body</dt>
              <pre className="mt-1 max-h-32 overflow-auto rounded bg-slate-50 p-2 text-xs dark:bg-slate-900">
                {data.responseBody ?? '—'}
              </pre>
            </div>
          </dl>
        </Card>

        <Card className="space-y-3 p-4 lg:col-span-2">
          <p className="font-semibold">Timeline giao / thử lại</p>
          <ul className="space-y-2 text-sm">
            {data.timeline.map((step, i) => (
              <li key={i} className="flex flex-wrap gap-2 border-l-2 border-indigo-200 pl-3 dark:border-indigo-800">
                <span className="text-slate-500">{formatDateTime(step.at)}</span>
                <span className="font-medium">{step.status}</span>
                {step.detail && <span className="text-slate-600">{step.detail}</span>}
                {step.httpStatus != null && <span className="text-slate-500">HTTP {step.httpStatus}</span>}
              </li>
            ))}
          </ul>
        </Card>
      </div>
    </ApiPageShell>
  );
}
