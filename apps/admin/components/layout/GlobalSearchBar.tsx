'use client';

import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useState } from 'react';
import { Input } from '@/components/ui/Form';
import { adminApi, ApiClientError } from '@/services/api-client';

export function GlobalSearchBar() {
  const router = useRouter();
  const [q, setQ] = useState('');
  const [error, setError] = useState<string | null>(null);

  async function handleSearch(e: React.FormEvent) {
    e.preventDefault();
    if (!q.trim()) return;
    setError(null);
    try {
      const result = await adminApi.globalSearch(q.trim());
      if (result.orders[0]) {
        router.push(`/orders/${result.orders[0].id}`);
        return;
      }
      if (result.customers[0]) {
        router.push(`/customers?id=${result.customers[0].id}`);
        return;
      }
      if (result.payments[0]) {
        router.push(`/orders/${result.payments[0].orderId}`);
        return;
      }
      if (result.providerTransactions[0]) {
        router.push(`/orders/${result.providerTransactions[0].orderId}`);
        return;
      }
      setError('Không tìm thấy kết quả');
    } catch (err) {
      setError(err instanceof ApiClientError ? err.message : 'Tìm kiếm thất bại');
    }
  }

  return (
    <form onSubmit={(e) => void handleSearch(e)} className="relative hidden max-w-xl flex-1 md:block">
      <span className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-sm text-slate-400">
        ⌕
      </span>
      <Input
        aria-label="Tìm kiếm toàn hệ thống"
        placeholder="Tìm mã đơn, email, payment ref, giao dịch…"
        value={q}
        onChange={(e) => setQ(e.target.value)}
        className="h-10 bg-slate-50/80 pl-9 pr-14 text-sm hover:bg-white focus:bg-white"
      />
      <span className="pointer-events-none absolute right-3 top-1/2 -translate-y-1/2 rounded border border-slate-200 bg-white px-1.5 py-0.5 text-[10px] font-medium text-slate-400">
        Enter
      </span>
      {error && (
        <p className="absolute left-0 top-full mt-1 rounded-md bg-red-50 px-2 py-1 text-xs text-red-600 shadow-sm">
          {error}
        </p>
      )}
    </form>
  );
}
