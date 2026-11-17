'use client';

import { useState } from 'react';
import { esimProductIso, flagImageSrc } from '@/lib/esim-flag';

export function EsimFlag({
  iso,
  name,
  slug,
  className = 'h-7 w-7',
}: {
  iso?: string | null;
  name?: string;
  slug?: string | null;
  className?: string;
}) {
  const resolved = iso || esimProductIso(name ?? '', slug);
  const src = flagImageSrc(resolved);
  const [failed, setFailed] = useState(!src);
  const key = (resolved ?? '').toUpperCase();
  const label = key === 'ASIA' ? 'Á' : key === 'WORLD' ? '🌍' : (resolved ?? name ?? '?').slice(0, 2);
  return (
    <span
      className={`inline-flex shrink-0 items-center justify-center overflow-hidden rounded-full bg-slate-100 text-[10px] font-bold text-slate-600 ring-1 ring-slate-200 ${className}`}
    >
      {failed || !src ? (
        label
      ) : (
        // eslint-disable-next-line @next/next/no-img-element
        <img
          src={src}
          alt=""
          className="h-full w-full object-cover"
          onError={() => setFailed(true)}
        />
      )}
    </span>
  );
}
