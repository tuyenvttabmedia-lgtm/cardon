'use client';

import { useState } from 'react';
import { useT } from '@/components/i18n/LocaleProvider';
import { ARTICLE_SHARE_NETWORKS } from '@/lib/article-share';
import { cn } from '@/lib/utils';

export function ArticleShareButtons({
  url,
  title,
  className,
}: {
  url: string;
  title: string;
  className?: string;
}) {
  const t = useT();
  const [copied, setCopied] = useState(false);

  async function copyLink() {
    try {
      if (navigator.clipboard?.writeText) {
        await navigator.clipboard.writeText(url);
      } else {
        const input = document.createElement('textarea');
        input.value = url;
        input.setAttribute('readonly', '');
        input.style.position = 'fixed';
        input.style.left = '-9999px';
        document.body.appendChild(input);
        input.select();
        document.execCommand('copy');
        document.body.removeChild(input);
      }
      setCopied(true);
      window.setTimeout(() => setCopied(false), 2500);
    } catch {
      setCopied(false);
    }
  }

  return (
    <div className={cn('border-t border-cardon-border pt-6', className)}>
      <p className="text-sm font-semibold text-cardon-navy">{t('share.title')}</p>
      <div className="mt-3 flex flex-wrap items-center gap-2">
        {ARTICLE_SHARE_NETWORKS.map((network) => (
          <a
            key={network.id}
            href={network.buildUrl(url, title)}
            target="_blank"
            rel="noopener noreferrer"
            className="inline-flex items-center gap-1.5 rounded-full border border-cardon-border bg-white px-3 py-1.5 text-sm font-medium text-cardon-navy transition hover:border-cardon-blue hover:text-cardon-blue"
          >
            <span
              aria-hidden
              className="flex h-5 w-5 items-center justify-center rounded-full bg-cardon-light text-xs"
            >
              {network.icon}
            </span>
            {t(network.labelKey)}
          </a>
        ))}
        <button
          type="button"
          onClick={() => void copyLink()}
          className="inline-flex items-center gap-1.5 rounded-full border border-cardon-border bg-white px-3 py-1.5 text-sm font-medium text-cardon-navy transition hover:border-cardon-blue hover:text-cardon-blue"
        >
          <span
            aria-hidden
            className="flex h-5 w-5 items-center justify-center rounded-full bg-cardon-light text-xs"
          >
            ⧉
          </span>
          {copied ? t('share.copied') : t('share.copy')}
        </button>
      </div>
    </div>
  );
}
