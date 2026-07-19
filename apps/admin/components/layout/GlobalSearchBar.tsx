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
    <form onSubmit={(e) => void handleSearch(e)} className="hidden max-w-md flex-1 md:block">
      <Input
        placeholder="Tìm mã đơn, email, payment ref, gateway tx…"
        value={q}
        onChange={(e) => setQ(e.target.value)}
        className="text-sm"
      />
      {error && <p className="mt-1 text-xs text-red-600">{error}</p>}
    </form>
  );
}
