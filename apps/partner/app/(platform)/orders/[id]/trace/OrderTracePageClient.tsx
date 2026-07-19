'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { useParams } from 'next/navigation';
import { Card } from '@/components/ui/Card';
import { OrderLifecycleTimeline } from '@/components/orders/OrdersOperations';
import { orderOperationsApi } from '@/services/api-client';

export default function OrderTracePageClient() {
  const params = useParams<{ id: string }>();
  const [lifecycle, setLifecycle] = useState<Array<{ stage: string; status: string; at: string }>>([]);
  const [steps, setSteps] = useState<Array<{ stage: string; status: string; at: string; label?: string }>>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!params.id) return;
    void orderOperationsApi
      .getTimeline(params.id)
      .then((res) => {
        setLifecycle(res.lifecycle as typeof lifecycle);
        setSteps(res.steps as typeof steps);
      })
      .catch(() => {})
      .finally(() => setLoading(false));
    void orderOperationsApi.audit('timeline', { orderId: params.id });
  }, [params.id]);

  return (
    <div className="space-y-6">
      <div>
        <Link href={`/orders/${params.id}`} className="text-sm text-indigo-600 hover:underline">
          ← Chi tiết đơn
        </Link>
        <h1 className="mt-2 text-2xl font-bold text-slate-900 dark:text-slate-100">Trace vòng đời đơn hàng</h1>
        <p className="text-sm text-slate-600">API → Wallet Hold → Provider → Response → Webhook → Ledger → Notification → Activity → Completed</p>
      </div>

      {loading ? (
        <p className="text-sm text-slate-500">Đang tải timeline…</p>
      ) : (
        <>
          <Card className="p-4">
            <h2 className="mb-4 text-sm font-semibold">Pipeline</h2>
            <div className="flex flex-wrap gap-2">
              {lifecycle.map((node) => (
                <div
                  key={node.stage}
                  className={`rounded-lg border px-3 py-2 text-xs ${
                    node.status === 'completed'
                      ? 'border-emerald-200 bg-emerald-50 text-emerald-800'
                      : node.status === 'failed'
                        ? 'border-red-200 bg-red-50 text-red-800'
                        : 'border-slate-200 bg-slate-50 text-slate-700'
                  }`}
                >
                  {node.stage}
                </div>
              ))}
            </div>
          </Card>
          <Card className="p-4">
            <h2 className="mb-4 text-sm font-semibold">Timeline chi tiết</h2>
            <OrderLifecycleTimeline steps={steps} />
          </Card>
        </>
      )}
    </div>
  );
}
