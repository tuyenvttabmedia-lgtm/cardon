'use client';

import { useState } from 'react';

const FLAG_ALIAS: Record<string, string> = {
  GB: 'gb',
  UK: 'gb',
  EUROPE: 'eu',
  EU: 'eu',
};

export function flagCodeFor(iso: string): string | null {
  const key = iso.trim().toUpperCase();
  if (FLAG_ALIAS[key]) return FLAG_ALIAS[key];
  if (/^[A-Z]{2}$/.test(key)) return key.toLowerCase();
  return null;
}

export function EsimFlag({ iso, className = 'h-10 w-10' }: { iso: string; className?: string }) {
  const code = flagCodeFor(iso);
  const [failed, setFailed] = useState(!code);
  const label = iso === 'ASIA' || iso === 'EUROPE' || iso === 'EU' ? '' : iso.toUpperCase();
  return (
    <span className={`inline-flex shrink-0 items-center justify-center overflow-hidden rounded-full bg-[#eef3f8] text-[11px] font-bold text-cardon-navy ring-1 ring-black/10 ${className}`}>
      {failed || !code ? (
        label.slice(0, 3)
      ) : (
        // eslint-disable-next-line @next/next/no-img-element
        <img
          src={`https://flagcdn.com/w160/${code}.png`}
          alt=""
          className="h-full w-full object-cover"
          onError={() => setFailed(true)}
        />
      )}
    </span>
  );
}
