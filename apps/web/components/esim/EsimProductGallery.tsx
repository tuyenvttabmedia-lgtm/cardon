'use client';

import Image from 'next/image';
import { useState } from 'react';
import { useT } from '@/components/i18n/LocaleProvider';

export function EsimProductGallery({
  images,
  country,
}: {
  images: string[];
  country: string;
}) {
  const t = useT();
  const gallery = images.filter(Boolean);
  const [index, setIndex] = useState(0);
  const safeIndex = gallery.length === 0 ? 0 : Math.min(index, gallery.length - 1);
  const current = gallery[safeIndex] ?? '';
  const [touchX, setTouchX] = useState<number | null>(null);

  if (gallery.length === 0 || !current) return null;

  function go(delta: number) {
    setIndex((value) => (value + delta + gallery.length) % gallery.length);
  }

  const thumbCols = gallery.length >= 5 ? 'grid-cols-5' : 'grid-cols-4';

  return (
    <div className="w-full" data-gallery-index={safeIndex} data-gallery-count={gallery.length}>
      <div
        className="relative aspect-[4/3] w-full overflow-hidden rounded-2xl bg-white shadow-card"
        onTouchStart={(event) => setTouchX(event.changedTouches[0]?.clientX ?? null)}
        onTouchEnd={(event) => {
          if (touchX == null) return;
          const dx = (event.changedTouches[0]?.clientX ?? touchX) - touchX;
          if (Math.abs(dx) > 40) go(dx < 0 ? 1 : -1);
          setTouchX(null);
        }}
      >
        <Image
          src={current}
          alt={`eSIM ${country}`}
          fill
          priority
          sizes="(max-width: 1024px) 100vw, 50vw"
          className="object-cover"
        />
        {gallery.length > 1 ? (
          <>
            <button
              type="button"
              aria-label={t('esim.photoPrev')}
              onClick={() => go(-1)}
              className="absolute left-2 top-1/2 z-10 flex h-9 w-9 -translate-y-1/2 items-center justify-center rounded-full bg-white/90 text-lg font-bold text-cardon-navy shadow"
            >
              ‹
            </button>
            <button
              type="button"
              aria-label={t('esim.photoNext')}
              onClick={() => go(1)}
              className="absolute right-2 top-1/2 z-10 flex h-9 w-9 -translate-y-1/2 items-center justify-center rounded-full bg-white/90 text-lg font-bold text-cardon-navy shadow"
            >
              ›
            </button>
          </>
        ) : null}
      </div>
      {gallery.length > 1 ? (
        <ul className={`mt-2 grid w-full gap-2 ${thumbCols}`}>
          {gallery.map((src, i) => {
            const active = i === safeIndex;
            return (
              <li key={src}>
                <button
                  type="button"
                  onClick={() => setIndex(i)}
                  aria-pressed={active}
                  className={`relative block aspect-square w-full overflow-hidden rounded-xl border-2 bg-white ${
                    active ? 'border-cardon-blue' : 'border-transparent hover:border-cardon-blue/40'
                  }`}
                >
                  <Image
                    src={src}
                    alt=""
                    fill
                    quality={90}
                    sizes="(max-width: 1024px) 25vw, 200px"
                    className="object-cover"
                  />
                </button>
              </li>
            );
          })}
        </ul>
      ) : null}
    </div>
  );
}
