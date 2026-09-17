'use client';

import { useEffect } from 'react';
import { recordBlogPostView } from '@/lib/cms-api';

const SESSION_KEY_PREFIX = 'cardon-cms-viewed:';

/**
 * Fire-and-forget public view counter.
 * One increment per browser tab session per slug (sessionStorage), so React
 * Strict Mode remounts and soft navigations do not double-count.
 */
export function RecordBlogPostView({ slug }: { slug: string }) {
  useEffect(() => {
    if (!slug) return;
    const key = `${SESSION_KEY_PREFIX}${slug}`;
    try {
      if (sessionStorage.getItem(key)) return;
      sessionStorage.setItem(key, '1');
    } catch {
      // private mode / blocked storage — still attempt one network ping
    }
    void recordBlogPostView(slug);
  }, [slug]);

  return null;
}
