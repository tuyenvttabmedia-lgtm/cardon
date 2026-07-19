'use client';

import { useState } from 'react';
import { cn } from '@/lib/utils';

const SHARE_NETWORKS = [
  {
    id: 'facebook',
    label: 'Facebook',
    icon: 'f',
    buildUrl: (url: string) =>
      `https://www.facebook.com/sharer/sharer.php?u=${encodeURIComponent(url)}`,
  },
  {
    id: 'x',
    label: 'X',
    icon: '𝕏',
    buildUrl: (url: string, title: string) =>
      `https://twitter.com/intent/tweet?url=${encodeURIComponent(url)}&text=${encodeURIComponent(title)}`,
  },
  {
    id: 'telegram',
    label: 'Telegram',
    icon: '✈',
    buildUrl: (url: string, title: string) =>
      `https://t.me/share/url?url=${encodeURIComponent(url)}&text=${encodeURIComponent(title)}`,
  },
  {
    id: 'zalo',
    label: 'Zalo',
    icon: 'Z',
    buildUrl: (url: string) => `https://zalo.me/share?url=${encodeURIComponent(url)}`,
  },
] as const;

export function ArticleShareButtons({
  url,
  title,
  className,
}: {
  url: string;
  title: string;
  className?: string;
}) {
  const [copied, setCopied] = useState(false);

  async function copyLink() {
    try {
      await navigator.clipboard.writeText(url);
      setCopied(true);
      window.setTimeout(() => setCopied(false), 2500);
    } catch {
      setCopied(false);
    }
  }

  return (
    <div className={cn('border-t border-cardon-border pt-6', className)}>
      <p className="text-sm font-semibold text-cardon-navy">Chia sẻ bài viết</p>
      <div className="mt-3 flex flex-wrap items-center gap-2">
        {SHARE_NETWORKS.map((network) => (
          <a
            key={network.id}
            href={network.buildUrl(url, title)}
            target="_blank"
            rel="noopener noreferrer"
            className="inline-flex items-center gap-1.5 rounded-full border border-cardon-border bg-white px-3 py-1.5 text-sm font-medium text-cardon-navy transition hover:border-cardon-blue hover:text-cardon-blue"
          >
            <span aria-hidden className="flex h-5 w-5 items-center justify-center rounded-full bg-cardon-light text-xs">
              {network.icon}
            </span>
            {network.label}
          </a>
        ))}
        <button
          type="button"
          onClick={() => void copyLink()}
          className="inline-flex items-center gap-1.5 rounded-full border border-cardon-border bg-white px-3 py-1.5 text-sm font-medium text-cardon-navy transition hover:border-cardon-blue hover:text-cardon-blue"
        >
          <span aria-hidden className="flex h-5 w-5 items-center justify-center rounded-full bg-cardon-light text-xs">
            ⧉
          </span>
          {copied ? 'Đã sao chép liên kết' : 'Copy Link'}
        </button>
      </div>
    </div>
  );
}
