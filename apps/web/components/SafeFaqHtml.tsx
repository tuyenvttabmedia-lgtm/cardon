'use client';

import { sanitizeFaqHtml } from '@/lib/sanitize-faq-html';

interface Props {
  html: string;
  className?: string;
}

export function SafeFaqHtml({ html, className }: Props) {
  const safe = sanitizeFaqHtml(html);
  if (!safe) return null;
  return (
    <div
      className={className ?? 'cms-prose text-sm leading-relaxed text-cardon-gray'}
      dangerouslySetInnerHTML={{ __html: safe }}
    />
  );
}
