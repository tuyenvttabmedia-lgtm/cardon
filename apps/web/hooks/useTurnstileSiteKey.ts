'use client';

import { useEffect, useState } from 'react';
import { getApiBaseUrl } from '@/lib/utils';

export type PublicTurnstileClient = {
  enabled: boolean;
  siteKey: string | null;
};

/**
 * Resolves Turnstile site key: admin/DB via public API, else NEXT_PUBLIC env fallback.
 */
export function useTurnstileSiteKey(): string {
  const envKey = (process.env.NEXT_PUBLIC_TURNSTILE_SITE_KEY ?? '').trim();
  const [siteKey, setSiteKey] = useState(envKey);

  useEffect(() => {
    let cancelled = false;
    const base = getApiBaseUrl().replace(/\/$/, '');
    void fetch(`${base}/public/turnstile`, { credentials: 'omit' })
      .then(async (res) => {
        if (!res.ok) return;
        const payload = (await res.json()) as
          | PublicTurnstileClient
          | { success?: boolean; data?: PublicTurnstileClient };
        const data =
          payload &&
          typeof payload === 'object' &&
          'data' in payload &&
          payload.data &&
          typeof payload.data === 'object'
            ? payload.data
            : (payload as PublicTurnstileClient);
        if (cancelled) return;
        if (data.enabled && data.siteKey?.trim()) {
          setSiteKey(data.siteKey.trim());
        } else if (!envKey) {
          setSiteKey('');
        }
      })
      .catch(() => undefined);
    return () => {
      cancelled = true;
    };
  }, [envKey]);

  return siteKey;
}

export function isTurnstileSiteKeyConfigured(siteKey?: string): boolean {
  const key = (siteKey ?? process.env.NEXT_PUBLIC_TURNSTILE_SITE_KEY ?? '').trim();
  return key.length > 0;
}
