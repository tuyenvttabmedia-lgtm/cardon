'use client';

import { memo } from 'react';
import { seoRating, seoRatingStyles, type SeoRating } from '@/lib/cms-editor-utils';

export const SeoScoreBadge = memo(function SeoScoreBadge({ score, showLabel = true }: { score: number; showLabel?: boolean }) {
  const rating = seoRating(score);
  return (
    <span className={`inline-flex items-center gap-1 rounded-full border px-2 py-0.5 text-xs font-semibold ${seoRatingStyles(rating)}`}>
      {score}
      {showLabel && <span className="opacity-80">· {ratingLabel(rating)}</span>}
    </span>
  );
});

function ratingLabel(r: SeoRating): string {
  switch (r) {
    case 'Excellent': return 'Excellent';
    case 'Good': return 'Good';
    case 'Need Improve': return 'Need Improve';
    case 'Poor': return 'Poor';
  }
}

export function CmsStatusBadge({
  status,
  scheduledAt,
}: {
  status: string;
  scheduledAt?: string | null;
}) {
  if (scheduledAt && new Date(scheduledAt) > new Date()) {
    return <span className="rounded-full bg-violet-100 px-2 py-0.5 text-xs font-semibold text-violet-700">Scheduled</span>;
  }
  const map: Record<string, string> = {
    PUBLISHED: 'bg-emerald-100 text-emerald-800',
    DRAFT: 'bg-zinc-200 text-zinc-700',
    ARCHIVED: 'bg-amber-100 text-amber-800',
  };
  const labels: Record<string, string> = {
    PUBLISHED: 'Published',
    DRAFT: 'Draft',
    ARCHIVED: 'Archived',
  };
  return (
    <span className={`rounded-full px-2 py-0.5 text-xs font-semibold ${map[status] ?? 'bg-zinc-100 text-zinc-600'}`}>
      {labels[status] ?? status}
    </span>
  );
}
