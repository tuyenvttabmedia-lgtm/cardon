'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { useParams } from 'next/navigation';
import { Badge, statusToBadgeTone } from '@/components/ui/Badge';
import { Button } from '@/components/ui/Button';
import { Card } from '@/components/ui/Card';
import { OrderLifecycleTimeline } from '@/components/orders/OrdersOperations';
import { useAgentPlatform } from '@/hooks/useAgentPlatform';
import { orderOperationsApi } from '@/services/api-client';
import { formatDateTime, formatVnd, transactionStatusLabel } from '@/lib/utils';
import type { AgentOrderDetail } from '@/types/platform';

function JsonBlock({ title, data }: { title: string; data: unknown }) {
  return (
    <Card className="space-y-2">
      <h3 className="text-sm font-semibold text-slate-900 dark:text-slate-100">{title}</h3>
      <pre className="max-h-48 overflow-auto rounded-lg bg-slate-950 p-3 text-xs text-slate-100">
        {JSON.stringify(data, null, 2)}
      </pre>
    </Card>
  );
}

export default function OrderDetailPageClient() {
  const params = useParams<{ id: string }>();
  const { role } = useAgentPlatform();
  const readonly = role === 'READONLY';
  const [order, setOrder] = useState<AgentOrderDetail | null>(null);
  const [loading, setLoading] = useState(true);
  const [retrying, setRetrying] = useState(false);
  const [message, setMessage] = useState<string | null>(null);

  useEffect(() => {
    if (!params.id) return;
    setLoading(true);
    void orderOperationsApi
      .getOrder(params.id)
      .then(setOrder)
      .catch(() => setOrder(null))
      .finally(() => setLoading(false));
  }, [params.id]);

  async function handleRetry() {
    if (!order || readonly || !order.retryAllowed) return;
    setRetrying(true);
    setMessage(null);
    try {
      const res = await orderOperationsApi.retryOrder(order.id);
      setMessage(`Thử lại thành công — trạng thái: ${res.fulfillmentStatus}`);
      const refreshed = await orderOperationsApi.getOrder(order.id);
      setOrder(refreshed);
      void orderOperationsApi.audit('retry', { orderId: order.id });
    } catch (e) {
      setMessage(e instanceof Error ? e.message : 'Không thể thử lại đơn hàng');
    } finally {
      setRetrying(false);
    }
  }

  if (loading) {
    return <p className="p-6 text-sm text-slate-500">Đang tải chi tiết đơn…</p>;
  }

  if (!order) {
    return <p className="p-6 text-sm text-red-600">Không tìm thấy đơn hàng.</p>;
  }

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <Link href="/orders/search" className="text-sm text-indigo-600 hover:underline">
            ← Quay lại tra cứu
          </Link>
          <h1 className="mt-2 text-2xl font-bold text-slate-900 dark:text-slate-100">Chi tiết đơn API</h1>
          <p className="font-mono text-sm text-slate-500">{order.requestId}</p>
        </div>
        <div className="flex flex-wrap gap-2">
          <Link href={`/orders/${order.id}/trace`}>
            <Button size="sm" variant="secondary">
              Vòng đời
            </Button>
          </Link>
          {order.retryAllowed && !readonly && (
            <Button size="sm" onClick={handleRetry} disabled={retrying}>
              {retrying ? 'Đang thử lại…' : 'Thử lại an toàn'}
            </Button>
          )}
        </div>
      </div>

      {message && <p className="text-sm text-slate-600">{message}</p>}

      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <Card className="p-4">
          <p className="text-xs text-slate-500">Trạng thái</p>
          <Badge tone={statusToBadgeTone(order.status)}>{transactionStatusLabel(order.status)}</Badge>
        </Card>
        <Card className="p-4">
          <p className="text-xs text-slate-500">Giá bán</p>
          <p className="font-semibold">{formatVnd(order.sellPrice)}</p>
        </Card>
        <Card className="p-4">
          <p className="text-xs text-slate-500">Độ trễ</p>
          <p className="font-semibold">{order.latencyMs != null ? `${order.latencyMs}ms` : '—'}</p>
        </Card>
        <Card className="p-4">
          <p className="text-xs text-slate-500">Provider</p>
          <p className="font-semibold">{order.provider ?? '—'}</p>
        </Card>
      </div>

      <div className="grid gap-4 lg:grid-cols-2">
        <Card className="p-4">
          <h2 className="mb-4 text-sm font-semibold">Timeline</h2>
          <OrderLifecycleTimeline steps={order.timeline.map((s) => ({ stage: s.stage, status: s.status, at: s.at, label: s.label }))} />
        </Card>
        <div className="space-y-4">
          <JsonBlock title="API Request (đã che)" data={order.apiRequest} />
          <JsonBlock title="API Response" data={order.apiResponse} />
          <JsonBlock title="Provider Request" data={order.providerRequest} />
          <JsonBlock title="Provider Response" data={order.providerResponse} />
          {order.webhook && <JsonBlock title="Webhook payload" data={order.webhook.payload} />}
          <JsonBlock title="Wallet Hold" data={order.walletHold} />
          <JsonBlock title="Ledger Commit" data={order.ledgerCommit} />
        </div>
      </div>

      <Card className="p-4 text-xs text-slate-500">
        IP: {order.clientTrace.ipAddress ?? '—'} · API Key: {order.apiKey ?? '—'} · Tạo: {formatDateTime(order.createdAt)}
      </Card>
    </div>
  );
}
