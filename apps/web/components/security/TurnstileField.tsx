'use client';

import {
  forwardRef,
  useCallback,
  useEffect,
  useImperativeHandle,
  useRef,
  useState,
} from 'react';
import { useTurnstileSiteKey } from '@/hooks/useTurnstileSiteKey';

const SCRIPT_ID = 'cf-turnstile-api';
const SCRIPT_SRC = 'https://challenges.cloudflare.com/turnstile/v0/api.js?render=explicit';

export type TurnstileFieldHandle = {
  reset: () => void;
  getToken: () => string | null;
};

type Props = {
  onTokenChange?: (token: string | null) => void;
  className?: string;
  /** Widget action name — must match API expectedAction when configured. */
  action?: string;
  /** Override site key (tests). Default: admin public API + ENV. */
  siteKey?: string;
};

declare global {
  interface Window {
    turnstile?: {
      render: (
        el: HTMLElement,
        options: {
          sitekey: string;
          theme?: 'light' | 'dark' | 'auto';
          action?: string;
          callback?: (token: string) => void;
          'expired-callback'?: () => void;
          'error-callback'?: () => void;
        },
      ) => string;
      reset: (widgetId?: string) => void;
      remove: (widgetId?: string) => void;
    };
  }
}

export function getTurnstileSiteKey(): string {
  return (process.env.NEXT_PUBLIC_TURNSTILE_SITE_KEY ?? '').trim();
}

/** Sync ENV-only check. Prefer `useTurnstileSiteKey()` for admin-configured keys. */
export function isTurnstileSiteKeyConfigured(siteKey?: string | null): boolean {
  const key = (siteKey ?? getTurnstileSiteKey()).trim();
  return key.length > 0;
}

function loadTurnstileScript(): Promise<void> {
  if (typeof window === 'undefined') return Promise.resolve();
  if (window.turnstile) return Promise.resolve();

  const existing = document.getElementById(SCRIPT_ID) as HTMLScriptElement | null;
  if (existing) {
    return new Promise((resolve, reject) => {
      existing.addEventListener('load', () => resolve(), { once: true });
      existing.addEventListener('error', () => reject(new Error('turnstile_script_error')), {
        once: true,
      });
      if (window.turnstile) resolve();
    });
  }

  return new Promise((resolve, reject) => {
    const script = document.createElement('script');
    script.id = SCRIPT_ID;
    script.src = SCRIPT_SRC;
    script.async = true;
    script.defer = true;
    script.onload = () => resolve();
    script.onerror = () => reject(new Error('turnstile_script_error'));
    document.head.appendChild(script);
  });
}

export const TurnstileField = forwardRef<TurnstileFieldHandle, Props>(
  function TurnstileField({ onTokenChange, className, action, siteKey: siteKeyProp }, ref) {
    const resolvedKey = useTurnstileSiteKey();
    const siteKey = (siteKeyProp ?? resolvedKey).trim();
    const containerRef = useRef<HTMLDivElement | null>(null);
    const widgetIdRef = useRef<string | null>(null);
    const tokenRef = useRef<string | null>(null);
    const [status, setStatus] = useState<'idle' | 'loading' | 'ready' | 'error' | 'unconfigured'>(
      siteKey ? 'loading' : 'unconfigured',
    );

    const setToken = useCallback(
      (token: string | null) => {
        tokenRef.current = token;
        onTokenChange?.(token);
      },
      [onTokenChange],
    );

    const reset = useCallback(() => {
      setToken(null);
      if (widgetIdRef.current && window.turnstile) {
        try {
          window.turnstile.reset(widgetIdRef.current);
        } catch {
          /* ignore */
        }
      }
    }, [setToken]);

    useImperativeHandle(
      ref,
      () => ({
        reset,
        getToken: () => tokenRef.current,
      }),
      [reset],
    );

    useEffect(() => {
      if (!siteKey) {
        setStatus('unconfigured');
        return;
      }

      let cancelled = false;

      (async () => {
        try {
          setStatus('loading');
          await loadTurnstileScript();
          if (cancelled || !containerRef.current || !window.turnstile) return;

          if (widgetIdRef.current) {
            try {
              window.turnstile.remove(widgetIdRef.current);
            } catch {
              /* ignore */
            }
            widgetIdRef.current = null;
          }

          widgetIdRef.current = window.turnstile.render(containerRef.current, {
            sitekey: siteKey,
            theme: 'light',
            action,
            callback: (token: string) => {
              setToken(token);
              setStatus('ready');
            },
            'expired-callback': () => {
              setToken(null);
            },
            'error-callback': () => {
              setToken(null);
              setStatus('error');
            },
          });
          setStatus('ready');
        } catch {
          if (!cancelled) setStatus('error');
        }
      })();

      return () => {
        cancelled = true;
        if (widgetIdRef.current && window.turnstile) {
          try {
            window.turnstile.remove(widgetIdRef.current);
          } catch {
            /* ignore */
          }
          widgetIdRef.current = null;
        }
      };
    }, [siteKey, action, setToken]);

    if (!siteKey) {
      return (
        <p className={`text-sm text-amber-800 ${className ?? ''}`}>
          Xác minh bảo mật chưa được cấu hình trên môi trường này (thiếu Site Key).
        </p>
      );
    }

    return (
      <div className={className}>
        {status === 'loading' && (
          <p className="mb-2 text-xs text-cardon-gray">Đang tải xác minh bảo mật…</p>
        )}
        {status === 'error' && (
          <p className="mb-2 text-xs text-red-600">
            Không tải được xác minh bảo mật. Vui lòng tải lại trang hoặc thử lại.
          </p>
        )}
        <div ref={containerRef} className="cf-turnstile" />
      </div>
    );
  },
);

/** Map API captcha failures to user-facing copy + whether to reset widget. */
export function captchaErrorFromApi(err: unknown): {
  message: string;
  shouldReset: boolean;
} | null {
  if (!err || typeof err !== 'object') return null;
  const status = 'status' in err ? Number((err as { status?: number }).status) : NaN;
  const message =
    'message' in err && typeof (err as { message?: unknown }).message === 'string'
      ? (err as { message: string }).message
      : '';
  const lower = message.toLowerCase();
  const looksCaptcha =
    lower.includes('captcha') || lower.includes('xác minh') || lower.includes('turnstile');

  if (status === 503 && (looksCaptcha || lower.includes('unavailable'))) {
    return {
      message: 'Dịch vụ xác minh tạm thời không khả dụng. Vui lòng thử lại sau.',
      shouldReset: true,
    };
  }
  if (status === 400 && looksCaptcha) {
    return {
      message: 'Xác minh bảo mật thất bại. Vui lòng xác minh lại.',
      shouldReset: true,
    };
  }
  return null;
}
