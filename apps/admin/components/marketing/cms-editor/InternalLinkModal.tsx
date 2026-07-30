'use client';

import { useMemo, useState } from 'react';
import { Dialog } from '@/components/ui/Dialog';
import { Input } from '@/components/ui/Form';

export interface LinkTarget {
  label: string;
  href: string;
  type: string;
}

export function InternalLinkModal({
  open,
  onClose,
  targets,
  onSelect,
}: {
  open: boolean;
  onClose: () => void;
  targets: LinkTarget[];
  onSelect: (href: string) => void;
}) {
  const [q, setQ] = useState('');

  const filtered = useMemo(() => {
    const query = q.trim().toLowerCase();
    if (!query) return targets.slice(0, 20);
    return targets.filter(
      (t) => t.label.toLowerCase().includes(query) || t.href.toLowerCase().includes(query),
    ).slice(0, 20);
  }, [targets, q]);

  return (
    <Dialog open={open} onClose={onClose} title="Liên kết nội bộ (Ctrl+K)" className="items-start pt-[15vh]">
      <Input
        placeholder="Tìm bài viết, trang, danh mục…"
        value={q}
        onChange={(e) => setQ(e.target.value)}
        autoFocus
      />
      <ul className="mt-3 max-h-72 overflow-y-auto">
        {filtered.map((t) => (
          <li key={`${t.type}-${t.href}`}>
            <button
              type="button"
              className="flex w-full items-center justify-between rounded-lg px-3 py-2.5 text-left text-sm hover:bg-slate-50"
              onClick={() => onSelect(t.href)}
            >
              <span className="font-medium text-slate-800">{t.label}</span>
              <span className="text-xs text-slate-400">{t.type}</span>
            </button>
          </li>
        ))}
        {filtered.length === 0 && <li className="px-4 py-6 text-center text-sm text-slate-500">Không tìm thấy</li>}
      </ul>
    </Dialog>
  );
}
