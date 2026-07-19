'use client';

import { useEffect, useState } from 'react';
import { Card } from '@/components/ui/Card';
import { PlatformSection } from '@/components/platform/PlatformSection';
import { agentPlatformApi } from '@/services/api-client';
import { formatVnd } from '@/lib/utils';
import type { AgentPlatformPricingResponse } from '@/types/platform';

export default function ProductsPageClient() {
  const [payload, setPayload] = useState<AgentPlatformPricingResponse | null>(null);

  useEffect(() => {
    void agentPlatformApi.listProducts().then(setPayload).catch(() => setPayload(null));
  }, []);

  const products = payload?.items ?? [];

  return (
    <PlatformSection
      title="Bảng giá"
      description="Giá mua từ CardOn — chỉ xem, không chỉnh sửa."
    >
      <Card>
        {products.length === 0 ? (
          <p className="text-sm text-slate-500">Chưa có sản phẩm.</p>
        ) : (
          <div className="overflow-x-auto">
            <table className="min-w-full text-sm">
              <thead>
                <tr className="border-b border-slate-100 text-left text-slate-500">
                  <th className="py-2 pr-4">SKU</th>
                  <th className="py-2 pr-4">Tên</th>
                  <th className="py-2 pr-4">Danh mục</th>
                  <th className="py-2 pr-4">Giá mua (CardOn)</th>
                </tr>
              </thead>
              <tbody>
                {products.map((p) => (
                  <tr key={p.id} className="border-b border-slate-50">
                    <td className="py-3 pr-4 font-mono text-xs">{p.sku}</td>
                    <td className="py-3 pr-4">{p.name}</td>
                    <td className="py-3 pr-4">{p.category ?? '—'}</td>
                    <td className="py-3 pr-4 font-medium">{formatVnd(p.agentPrice)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </Card>
    </PlatformSection>
  );
}
