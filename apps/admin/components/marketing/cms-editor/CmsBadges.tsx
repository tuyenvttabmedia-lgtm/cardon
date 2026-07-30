'use client';

import { memo } from 'react';
import { Badge } from '@/components/ui/Display';
import { seoRating, seoRatingStyles, type SeoRating } from '@/lib/cms-editor-utils';

export const SeoScoreBadge = memo(function SeoScoreBadge({ score, showLabel = true }: { score: number; showLabel?: boolean }) {
  const rating = seoRating(score);
  return (
    <Badge className={`gap-1 ${seoRatingStyles(rating)}`}>
      {score}
      {showLabel && <span className="opacity-80">· {ratingLabel(rating)}</span>}
    </Badge>
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
    return <Badge tone="violet">Scheduled</Badge>;
  }
  const tones: Record<string, 'success' | 'default' | 'warning'> = {
    PUBLISHED: 'success',
    DRAFT: 'default',
    ARCHIVED: 'warning',
  };
  const labels: Record<string, string> = {
    PUBLISHED: 'Published',
    DRAFT: 'Draft',
    ARCHIVED: 'Archived',
  };
  return <Badge tone={tones[status] ?? 'default'}>{labels[status] ?? status}</Badge>;
}
