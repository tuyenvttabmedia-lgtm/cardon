'use client';

import { useMemo, useState } from 'react';
import type { CmsTag } from '@/types/api';

export function TagChipInput({
  tags,
  selectedIds,
  onChange,
  onCreateTag,
}: {
  tags: CmsTag[];
  selectedIds: string[];
  onChange: (ids: string[]) => void;
  onCreateTag?: (name: string) => void;
}) {
  const [query, setQuery] = useState('');

  const selected = useMemo(
    () => tags.filter((t) => selectedIds.includes(t.id)),
    [tags, selectedIds],
  );

  const suggestions = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return tags.filter((t) => !t.isHidden && !selectedIds.includes(t.id)).slice(0, 8);
    return tags
      .filter((t) => !t.isHidden && !selectedIds.includes(t.id) && t.name.toLowerCase().includes(q))
      .slice(0, 8);
  }, [tags, query, selectedIds]);

  function addTag(id: string) {
    onChange([...selectedIds, id]);
    setQuery('');
  }

  function removeTag(id: string) {
    onChange(selectedIds.filter((x) => x !== id));
  }

  function handleKeyDown(e: React.KeyboardEvent<HTMLInputElement>) {
    if (e.key === 'Enter' && query.trim()) {
      e.preventDefault();
      const exact = tags.find((t) => t.name.toLowerCase() === query.trim().toLowerCase());
      if (exact) addTag(exact.id);
      else onCreateTag?.(query.trim());
      setQuery('');
    }
  }

  return (
    <div className="space-y-2">
      <div className="flex flex-wrap gap-1.5">
        {selected.map((t) => (
          <span
            key={t.id}
            className="inline-flex items-center gap-1 rounded-full bg-admin-100 px-2.5 py-1 text-xs font-medium text-admin-800"
          >
            {t.name}
            <button type="button" className="text-admin-500 hover:text-admin-800" onClick={() => removeTag(t.id)} aria-label="Remove">
              ×
            </button>
          </span>
        ))}
      </div>
      <input
        className="w-full rounded-lg border border-zinc-200 px-3 py-2 text-sm outline-none focus:border-admin-500"
        placeholder="Tìm hoặc tạo thẻ… Enter để thêm"
        value={query}
        onChange={(e) => setQuery(e.target.value)}
        onKeyDown={handleKeyDown}
      />
      {query && suggestions.length > 0 && (
        <ul className="max-h-32 overflow-y-auto rounded-lg border border-zinc-100 bg-white shadow-sm">
          {suggestions.map((t) => (
            <li key={t.id}>
              <button
                type="button"
                className="w-full px-3 py-2 text-left text-sm hover:bg-zinc-50"
                onClick={() => addTag(t.id)}
              >
                {t.name}
              </button>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
