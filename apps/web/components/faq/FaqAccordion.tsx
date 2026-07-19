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
}: {
  items: FaqItem[];
  title?: string;
  className?: string;
  /** When true, show link to /tro-giup/[cat]/[slug] on each item */
  linkToDetail?: boolean;
}) {
  const [openId, setOpenId] = useState<string | null>(null);

  if (items.length === 0) return null;

  return (
    <section className={cn('space-y-4', className)}>
      {title ? <h2 className="text-xl font-bold text-cardon-navy">{title}</h2> : null}
      <div className="divide-y divide-cardon-border rounded-2xl border border-cardon-border bg-white">
        {items.map((item) => {
          const open = openId === item.id;
          return (
            <div key={item.id}>
              <button
                type="button"
                className="flex w-full items-center justify-between gap-3 px-4 py-4 text-left text-sm font-semibold text-cardon-navy hover:bg-cardon-light/50 md:px-5"
                onClick={() => setOpenId(open ? null : item.id)}
              >
                <span>{item.question}</span>
                <span className="shrink-0 text-cardon-gray">{open ? '−' : '+'}</span>
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
