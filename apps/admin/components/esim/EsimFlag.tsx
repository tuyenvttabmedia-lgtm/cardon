'use client';

import { useState } from 'react';
import { esimProductIso, flagCdnCode } from '@/lib/esim-flag';

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
  const code = flagCdnCode(resolved);
  const [failed, setFailed] = useState(!code);
  const label = resolved === 'ASIA' ? 'Á' : (resolved ?? name ?? '?').slice(0, 2);
  return (
    <span
      className={`inline-flex shrink-0 items-center justify-center overflow-hidden rounded-full bg-slate-100 text-[10px] font-bold text-slate-600 ring-1 ring-slate-200 ${className}`}
    >
      {failed || !code ? (
        label
      ) : (
        // eslint-disable-next-line @next/next/no-img-element
        <img
          src={`https://flagcdn.com/w80/${code}.png`}
          alt=""
          className="h-full w-full object-cover"
          onError={() => setFailed(true)}
        />
      )}
    </span>
  );
}
