'use client';

import { useState } from 'react';

const FLAG_ALIAS: Record<string, string> = {
  GB: 'gb',
  UK: 'gb',
  EUROPE: 'eu',
  EU: 'eu',
};

/** Regional packs — no ISO flag on flagcdn. */
const FLAG_CUSTOM: Record<string, string> = {
  ASIA: '/images/esim/flag-asia.svg',
  WORLD: '/images/esim/flag-world.svg',
};

export function flagCodeFor(iso: string): string | null {
  const key = iso.trim().toUpperCase();
  if (FLAG_ALIAS[key]) return FLAG_ALIAS[key];
  if (/^[A-Z]{2}$/.test(key)) return key.toLowerCase();
  return null;
}

export function flagImageSrc(iso: string): string | null {
  const key = iso.trim().toUpperCase();
  if (FLAG_CUSTOM[key]) return FLAG_CUSTOM[key];
  const code = flagCodeFor(key);
  return code ? `https://flagcdn.com/w160/${code}.png` : null;
}

export function EsimFlag({ iso, className = 'h-10 w-10' }: { iso: string; className?: string }) {
  const src = flagImageSrc(iso);
  const [failed, setFailed] = useState(!src);
  const key = iso.trim().toUpperCase();
  const label =
    key === 'ASIA' ? 'Á' : key === 'WORLD' ? '🌍' : key === 'EUROPE' || key === 'EU' ? 'EU' : key.slice(0, 3);
  return (
    <span className={`inline-flex shrink-0 items-center justify-center overflow-hidden rounded-full bg-[#eef3f8] text-[11px] font-bold text-cardon-navy ring-1 ring-black/10 ${className}`}>
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
