'use client';

import { useState } from 'react';
import { Button } from '@/components/ui/Button';

export function CopyButton({ value, label = 'Sao chép' }: { value: string; label?: string }) {
  const [copied, setCopied] = useState(false);

  async function handleCopy() {
    try {
      await navigator.clipboard.writeText(value);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      setCopied(false);
    }
  }

  return (
    <Button type="button" variant="secondary" size="sm" onClick={handleCopy}>
      {copied ? 'Đã sao chép' : label}
    </Button>
  );
}
