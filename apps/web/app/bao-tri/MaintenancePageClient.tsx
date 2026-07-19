'use client';

import { useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import { fetchPlatformStatusClient, type PlatformMaintenanceStatus } from '@/lib/cms-api';

function useCountdown(targetIso?: string | null) {
  const [now, setNow] = useState(() => Date.now());

  useEffect(() => {
    const id = window.setInterval(() => setNow(Date.now()), 1000);
    return () => window.clearInterval(id);
  }, []);

  return useMemo(() => {
    if (!targetIso) return null;
    const diff = new Date(targetIso).getTime() - now;
    if (diff <= 0) return '00:00:00';
    const h = Math.floor(diff / 3600000);
    const m = Math.floor((diff % 3600000) / 60000);
    const s = Math.floor((diff % 60000) / 1000);
    return `${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}`;
  }, [targetIso, now]);
}

export default function MaintenancePageClient() {
  const [status, setStatus] = useState<PlatformMaintenanceStatus | null>(null);

  useEffect(() => {
    void fetchPlatformStatusClient().then(setStatus);
  }, []);

  const finish =
    status?.estimatedFinish ??
    (status?.customerPage?.estimatedFinish as string | undefined) ??
    null;
  const countdown = useCountdown(finish);
  const banner = (status?.banner ?? {}) as { title?: string; description?: string; color?: string; buttonText?: string; buttonLink?: string };
  const customer = status?.customerPage ?? {};

  return (
    <main className="flex min-h-[70vh] items-center justify-center px-4 py-16">
      <div className="w-full max-w-xl rounded-3xl border border-zinc-200 bg-white p-8 shadow-xl">
        <div
          className="mx-auto mb-6 flex h-16 w-16 items-center justify-center rounded-2xl text-2xl text-white"
          style={{ backgroundColor: banner.color ?? '#dc2626' }}
        >
          🔧
        </div>
        <h1 className="text-center text-2xl font-bold text-zinc-900">
          {banner.title ?? 'Hệ thống đang bảo trì'}
        </h1>
        <p className="mt-3 text-center text-zinc-600">
          {banner.description ?? status?.reason ?? 'Chúng tôi đang nâng cấp hệ thống. Vui lòng quay lại sau.'}
        </p>

        {countdown && (
          <div className="mt-8 text-center">
            <p className="text-xs uppercase tracking-wide text-zinc-500">Thời gian còn lại</p>
            <p className="mt-2 font-mono text-4xl font-bold text-zinc-900">{countdown}</p>
            {finish && (
              <p className="mt-2 text-sm text-zinc-500">
                Dự kiến hoàn tất: {new Date(finish).toLocaleString('vi-VN')}
              </p>
            )}
          </div>
        )}

        <div className="mt-8 flex flex-col gap-3 text-sm">
          {customer.supportLink && (
            <Link href={customer.supportLink} className="text-center text-brand-600 hover:underline">
              Liên hệ hỗ trợ
            </Link>
          )}
          {customer.telegram && (
            <a href={customer.telegram} target="_blank" rel="noreferrer" className="text-center text-brand-600 hover:underline">
              Telegram
            </a>
          )}
          {customer.facebook && (
            <a href={customer.facebook} target="_blank" rel="noreferrer" className="text-center text-brand-600 hover:underline">
              Facebook
            </a>
          )}
          {customer.hotline && (
            <p className="text-center font-semibold text-zinc-800">Hotline: {customer.hotline}</p>
          )}
        </div>

        {banner.buttonLink && banner.buttonText && (
          <div className="mt-6 text-center">
            <Link
              href={banner.buttonLink}
              className="inline-flex rounded-xl bg-brand-600 px-5 py-2.5 text-sm font-semibold text-white hover:bg-brand-700"
            >
              {banner.buttonText}
            </Link>
          </div>
        )}
      </div>
    </main>
  );
}
