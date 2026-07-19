'use client';

import { useCallback, useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { Input } from '@/components/ui/Form';
import { configurationCenterApi, ApiClientError } from '@/services/api-client';
import { vi } from '@/lib/i18n/vi';
import type { ConfigurationSearchEntry } from '@/types/api';

export function ConfigurationSearchDialog() {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [q, setQ] = useState('');
  const [items, setItems] = useState<ConfigurationSearchEntry[]>([]);
  const [error, setError] = useState<string | null>(null);

  const search = useCallback(async (query: string) => {
    if (!query.trim()) {
      setItems([]);
      return;
    }
    try {
      const res = await configurationCenterApi.search(query.trim());
      setItems(res.items);
      setError(null);
    } catch (e) {
      setError(e instanceof ApiClientError ? e.message : vi.configuration.searchFailed);
    }
  }, []);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'k') {
        e.preventDefault();
        setOpen((o) => !o);
      }
      if (e.key === 'Escape') setOpen(false);
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, []);

  useEffect(() => {
    if (!open) return;
    const t = window.setTimeout(() => void search(q), 200);
    return () => window.clearTimeout(t);
  }, [q, open, search]);

  if (!open) return null;

  return (
    <>
      <button type="button" className="fixed inset-0 z-50 bg-black/40" aria-label={vi.common.close} onClick={() => setOpen(false)} />
      <div className="fixed left-1/2 top-24 z-50 w-full max-w-lg -translate-x-1/2 rounded-xl border border-zinc-200 bg-white p-4 shadow-2xl">
        <p className="mb-2 text-sm font-semibold text-zinc-800">{vi.configuration.globalSearch}</p>
        <Input
          autoFocus
          placeholder={vi.configuration.searchPlaceholder}
          value={q}
          onChange={(e) => setQ(e.target.value)}
        />
        {error && <p className="mt-2 text-xs text-red-600">{error}</p>}
        <ul className="mt-3 max-h-64 overflow-y-auto">
          {items.map((item) => (
            <li key={item.id}>
              <button
                type="button"
                className="w-full rounded-lg px-3 py-2 text-left text-sm hover:bg-zinc-100"
                onClick={() => {
                  router.push(item.href);
                  setOpen(false);
                }}
              >
                <span className="font-medium">{item.label}</span>
                <span className="ml-2 text-xs text-zinc-400">{item.module}</span>
              </button>
            </li>
          ))}
          {q && items.length === 0 && !error && (
            <li className="px-3 py-4 text-sm text-zinc-500">{vi.common.noData}</li>
          )}
        </ul>
        <p className="mt-2 text-xs text-zinc-400">Ctrl+K</p>
      </div>
    </>
  );
}
