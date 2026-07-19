'use client';

import { useRouter } from 'next/navigation';
import { useState } from 'react';
import { Input, Button } from '@/components/ui/Form';
import { resolveMonitoringSearchQuery } from '@/lib/monitoring-routes';
import { vi } from '@/lib/i18n/vi';

export function MonitoringGlobalSearch() {
  const router = useRouter();
  const [query, setQuery] = useState('');

  function submit(e: React.FormEvent) {
    e.preventDefault();
    if (!query.trim()) return;
    router.push(resolveMonitoringSearchQuery(query));
  }

  return (
    <form onSubmit={submit} className="flex flex-wrap gap-2">
      <Input
        className="min-w-[220px] flex-1 text-sm"
        placeholder={vi.monitoringHub.globalSearchPlaceholder}
        value={query}
        onChange={(e) => setQuery(e.target.value)}
      />
      <Button type="submit" variant="secondary" size="sm">
        {vi.monitoringHub.globalSearch}
      </Button>
    </form>
  );
}
