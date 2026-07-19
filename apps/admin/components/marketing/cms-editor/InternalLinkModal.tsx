'use client';

import { useMemo, useState } from 'react';
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

  if (!open) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-start justify-center bg-black/40 pt-[15vh]" onClick={onClose}>
      <div className="w-full max-w-lg rounded-xl bg-white shadow-2xl" onClick={(e) => e.stopPropagation()}>
        <div className="border-b border-zinc-100 p-4">
          <p className="text-sm font-semibold text-zinc-900">Liên kết nội bộ (Ctrl+K)</p>
          <Input className="mt-2" placeholder="Tìm bài viết, trang, danh mục…" value={q} onChange={(e) => setQ(e.target.value)} autoFocus />
        </div>
        <ul className="max-h-72 overflow-y-auto py-1">
          {filtered.map((t) => (
            <li key={`${t.type}-${t.href}`}>
              <button
                type="button"
                className="flex w-full items-center justify-between px-4 py-2.5 text-left text-sm hover:bg-zinc-50"
                onClick={() => onSelect(t.href)}
              >
                <span className="font-medium text-zinc-800">{t.label}</span>
                <span className="text-xs text-zinc-400">{t.type}</span>
              </button>
            </li>
          ))}
          {filtered.length === 0 && <li className="px-4 py-6 text-center text-sm text-zinc-500">Không tìm thấy</li>}
        </ul>
      </div>
    </div>
  );
}
