'use client';

import { sanitizeCmsHtml } from '@/lib/sanitize-cms-html';

interface Props {
  html: string;
  className?: string;
}

/** Renders CMS HTML after client-side sanitization (defense in depth with server sanitize). */
export function SafeCmsHtml({ html, className }: Props) {
  const safe = sanitizeCmsHtml(html);
  return (
    <div
      className={className ?? 'cms-prose'}
      dangerouslySetInnerHTML={{ __html: safe }}
    />
  );
}
