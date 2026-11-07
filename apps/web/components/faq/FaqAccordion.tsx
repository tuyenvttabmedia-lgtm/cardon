'use client';

import { useState } from 'react';
import Link from 'next/link';
import { SafeFaqHtml } from '@/components/SafeFaqHtml';
import { cn } from '@/lib/utils';

export interface FaqItem {
  id: string;
  question: string;
  answer: string;
  slug?: string;
  categorySlug?: string;
}

export function FaqAccordion({
  items,
  title = 'Câu hỏi thường gặp',
  className,
  linkToDetail = false,
  layout = 'stack',
}: {
  items: FaqItem[];
  title?: string;
  className?: string;
  /** When true, show link to /tro-giup/[cat]/[slug] on each item */
  linkToDetail?: boolean;
  /** Homepage uses separate cards in two columns. Other pages keep one list. */
  layout?: 'stack' | 'split';
}) {
  const [openId, setOpenId] = useState<string | null>(null);

  if (items.length === 0) return null;

  return (
    <section className={cn('space-y-4', className)}>
      {title ? <h2 className="text-xl font-bold text-cardon-navy">{title}</h2> : null}
      <div
        className={
          layout === 'split'
            ? 'grid gap-2.5 md:grid-cols-2 md:gap-3'
            : 'divide-y divide-cardon-border rounded-2xl border border-cardon-border bg-white'
        }
      >
        {items.map((item) => {
          const open = openId === item.id;
          return (
            <div
              key={item.id}
              className={layout === 'split' ? 'rounded-2xl border border-cardon-border bg-white shadow-card' : undefined}
            >
              <button
                type="button"
                className={cn(
                  'flex w-full items-start justify-between gap-3 px-4 text-left font-semibold text-cardon-navy hover:bg-cardon-light/50 focus-visible:bg-cardon-light/70 md:px-5',
                  layout === 'split' ? 'py-3.5 text-sm leading-snug' : 'py-4 text-sm',
                )}
                onClick={() => setOpenId(open ? null : item.id)}
              >
                <span>{item.question}</span>
                <span className="shrink-0 text-lg leading-none text-cardon-gray">{open ? '−' : '+'}</span>
              </button>
              {open && (
                <div className="px-4 pb-4 md:px-5">
                  <SafeFaqHtml html={item.answer} />
                  {linkToDetail && item.slug && item.categorySlug && (
                    <Link
                      href={`/tro-giup/${item.categorySlug}/${item.slug}`}
                      className="mt-3 inline-block text-xs font-semibold text-cardon-blue hover:underline"
                    >
                      Xem liên kết chia sẻ →
                    </Link>
                  )}
                </div>
              )}
            </div>
          );
        })}
      </div>
    </section>
  );
}
