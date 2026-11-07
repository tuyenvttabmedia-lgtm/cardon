'use client';

import { useState } from 'react';
import { cn } from '@/lib/utils';

export function CopyIdButton({
  value,
  label = 'Sao chép',
  className,
}: {
  value: string;
  label?: string;
  className?: string;
}) {
  const [copied, setCopied] = useState(false);

  async function copy() {
    if (!value) return;
    try {
      await navigator.clipboard.writeText(value);
      setCopied(true);
      window.setTimeout(() => setCopied(false), 1400);
    } catch {
      setCopied(false);
    }
  }

  return (
    <button
      type="button"
      onClick={() => void copy()}
      title={label}
      className={cn(
        'inline-flex items-center rounded border border-slate-200 bg-white px-1.5 py-0.5 text-[10px] font-medium text-slate-600 hover:border-admin-300 hover:text-admin-700',
        className,
      )}
    >
      {copied ? 'Đã chép' : 'Sao chép'}
    </button>
  );
}
