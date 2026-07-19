'use client';

import { useEffect, useState } from 'react';
import { ApiPageShell } from '@/components/api/ApiSubNav';
import { Card } from '@/components/ui/Card';
import { apiOpsApi } from '@/services/api-client';
import type { ApiErrorCodeDoc } from '@/types/platform';

export default function ApiErrorCodesPage() {
  const [items, setItems] = useState<ApiErrorCodeDoc[]>([]);

  useEffect(() => {
    void apiOpsApi.getErrorCodes().then((r) => setItems(r.items)).catch(() => setItems([]));
  }, []);

  return (
    <ApiPageShell title="Mã lỗi API" description="Tra cứu nguyên nhân và cách xử lý khi tích hợp Partner API.">
      <div className="space-y-3">
        {items.map((item) => (
          <Card key={item.code} className="p-4">
            <p className="font-mono font-semibold text-indigo-700 dark:text-indigo-400">{item.code}</p>
            <p className="mt-1 text-sm font-medium">{item.meaning}</p>
            <dl className="mt-3 grid gap-2 text-sm sm:grid-cols-2">
              <div>
                <dt className="text-slate-500">Nguyên nhân</dt>
                <dd>{item.cause}</dd>
              </div>
              <div>
                <dt className="text-slate-500">Giải pháp</dt>
                <dd>{item.solution}</dd>
              </div>
            </dl>
          </Card>
        ))}
      </div>
    </ApiPageShell>
  );
}
