'use client';

import { useState } from 'react';
import type { TocItem } from '@/lib/blog-utils';
import { cn } from '@/lib/utils';

function buildTocLabels(items: TocItem[]): { item: TocItem; label: string }[] {
  let h2 = 0;
  let h3 = 0;

  return items.map((item) => {
    if (item.level === 2) {
      h2 += 1;
      h3 = 0;
      return { item, label: `${h2}. ${item.text}` };
    }
    h3 += 1;
    return { item, label: `${h2}.${h3} ${item.text}` };
  });
}

export function ArticleTableOfContents({ items }: { items: TocItem[] }) {
  const [expanded, setExpanded] = useState(false);

  if (items.length < 2) return null;

  const entries = buildTocLabels(items);

  function scrollTo(id: string) {
    document.getElementById(id)?.scrollIntoView({ behavior: 'smooth', block: 'start' });
  }

  return (
    <nav className="mt-6 rounded-xl border border-cardon-border bg-white p-4 shadow-sm" aria-label="Mục lục">
      <div className="flex items-center justify-between gap-2">
        <h2 className="text-sm font-semibold text-cardon-blue">Mục lục</h2>
        <button
          type="button"
          onClick={() => setExpanded((v) => !v)}
          className="flex h-7 w-7 shrink-0 items-center justify-center rounded-md text-lg leading-none text-cardon-blue hover:bg-cardon-light"
          aria-expanded={expanded}
          aria-label={expanded ? 'Thu gọn mục lục' : 'Mở rộng mục lục'}
        >
          {expanded ? '−' : '+'}
        </button>
      </div>
      <div
        className={cn(
          'grid transition-[grid-template-rows] duration-300 ease-in-out',
          expanded ? 'grid-rows-[1fr]' : 'grid-rows-[0fr]',
        )}
      >
        <div className="min-h-0 overflow-hidden">
          <ol className="mt-3 space-y-1.5 text-[14px] leading-[1.6]">
            {entries.map(({ item, label }) => (
              <li key={item.id} className={cn(item.level === 3 && 'pl-4')}>
                <button
                  type="button"
                  onClick={() => scrollTo(item.id)}
                  className="text-left text-cardon-gray hover:text-cardon-blue"
                >
                  {label}
                </button>
              </li>
            ))}
          </ol>
        </div>
      </div>
    </nav>
  );
}
