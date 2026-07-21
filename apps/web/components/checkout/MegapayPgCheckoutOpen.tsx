'use client';

import { useEffect, useRef, useState } from 'react';

declare global {
  interface Window {
    openPayment?: (mode: number, domain: string) => void;
  }
}

function loadStylesheet(href: string): HTMLLinkElement {
  const existing = document.querySelector<HTMLLinkElement>(`link[data-megapay-css="${href}"]`);
  if (existing) return existing;
  const link = document.createElement('link');
  link.rel = 'stylesheet';
  link.href = href;
  link.dataset.megapayCss = href;
  document.head.appendChild(link);
  return link;
}

function loadScript(src: string): Promise<void> {
  const existing = document.querySelector<HTMLScriptElement>(`script[data-megapay-js="${src}"]`);
  if (existing) {
    return existing.dataset.loaded === '1'
      ? Promise.resolve()
      : new Promise((resolve, reject) => {
          existing.addEventListener('load', () => resolve());
          existing.addEventListener('error', () => reject(new Error('MegaPay JS failed')));
        });
  }
  return new Promise((resolve, reject) => {
    const script = document.createElement('script');
    script.src = src;
    script.async = true;
    script.dataset.megapayJs = src;
    script.onload = () => {
      script.dataset.loaded = '1';
      resolve();
    };
    script.onerror = () => reject(new Error('MegaPay JS failed to load'));
    document.head.appendChild(script);
  });
}

/**
 * MegaPay Payment Gateway V1.4.6 — form + openPayment(1, domain).
 */
export function MegapayPgCheckoutOpen({
  checkoutFormFields,
  checkoutClient,
}: {
  checkoutFormFields: Record<string, string>;
  checkoutClient: { domain: string; jsUrl: string; cssUrl: string };
}) {
  const formRef = useRef<HTMLFormElement>(null);
  const openedRef = useRef(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    openedRef.current = false;

    async function openLayer() {
      try {
        loadStylesheet(checkoutClient.cssUrl);
        await loadScript(checkoutClient.jsUrl);
        if (cancelled || openedRef.current) return;
        if (typeof window.openPayment !== 'function') {
          setError('Không tải được cổng MegaPay. Vui lòng thử lại.');
          return;
        }
        openedRef.current = true;
        window.openPayment(1, checkoutClient.domain);
      } catch {
        if (!cancelled) {
          setError('Không mở được trang thanh toán MegaPay.');
        }
      }
    }

    void openLayer();
    return () => {
      cancelled = true;
    };
  }, [checkoutClient.cssUrl, checkoutClient.domain, checkoutClient.jsUrl, checkoutFormFields]);

  return (
    <div className="mt-4 space-y-2">
      <p className="text-sm text-cardon-gray">Đang mở cổng thanh toán MegaPay…</p>
      {error && <p className="text-sm text-red-600">{error}</p>}
      <form
        ref={formRef}
        id="megapayForm"
        name="megapayForm"
        method="POST"
        className="hidden"
      >
        {Object.entries(checkoutFormFields).map(([field, value]) => (
          <input key={field} type="hidden" name={field} value={value} />
        ))}
      </form>
    </div>
  );
}
