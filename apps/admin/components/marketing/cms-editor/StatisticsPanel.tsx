'use client';

import { memo } from 'react';
import { analyzeContent } from '@/lib/cms-editor-utils';

export const StatisticsPanel = memo(function StatisticsPanel({ content }: { content: string }) {
  const s = analyzeContent(content);
  const rows = [
    { label: 'Words', value: s.words },
    { label: 'Characters', value: s.characters },
    { label: 'Paragraphs', value: s.paragraphs },
    { label: 'Images', value: s.images },
    { label: 'Tables', value: s.tables },
    { label: 'Links', value: s.links },
    { label: 'Reading Time', value: `${s.readingTimeMinutes} phút` },
  ];
  return (
    <div className="grid grid-cols-2 gap-2">
      {rows.map((r) => (
        <div key={r.label} className="rounded-lg bg-zinc-50 px-3 py-2">
          <p className="text-[10px] uppercase tracking-wide text-zinc-400">{r.label}</p>
          <p className="text-sm font-semibold text-zinc-800">{r.value}</p>
        </div>
      ))}
    </div>
  );
});
