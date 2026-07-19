'use client';

import { useState } from 'react';
import { Button } from '@/components/ui/Form';

function CopyButton({ value, label = 'Copy' }: { value: string; label?: string }) {
  const [copied, setCopied] = useState(false);

  async function copy() {
    try {
      await navigator.clipboard.writeText(value);
      setCopied(true);
      window.setTimeout(() => setCopied(false), 1500);
    } catch {
      setCopied(false);
    }
  }

  return (
    <Button size="sm" variant="ghost" onClick={() => void copy()}>
      {copied ? 'Đã copy' : label}
    </Button>
  );
}

export function CopyValueRow({
  label,
  value,
  mono = true,
}: {
  label: string;
  value: string;
  mono?: boolean;
}) {
  return (
    <div className="flex flex-wrap items-center justify-between gap-2">
      <div>
        <p className="text-xs text-zinc-500">{label}</p>
        <p className={mono ? 'font-mono text-sm' : 'text-sm'}>{value}</p>
      </div>
      <CopyButton value={value} />
    </div>
  );
}

export function formatExpire(value: string | null): string {
  if (!value) return '—';
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return value;
  return date.toLocaleDateString('vi-VN');
}
