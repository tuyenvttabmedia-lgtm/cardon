import { NextResponse } from 'next/server';
import type { NextRequest } from 'next/server';
import { REMOVED_CUSTOMER_PORTAL_REDIRECTS } from '@/lib/account-routes';
import { englishLegacyRedirect } from '@/lib/locale-redirects';
import {
  LOCALE_COOKIE,
  LOCALE_HEADER,
  PUBLIC_PATH_HEADER,
  localeRoutingDecision,
  withLocalePrefix,
} from '@/lib/i18n/locale';
import { PORTAL_HEADER } from '@/lib/portal-host';

function apiBaseUrl(): string {
  return (
    process.env.API_INTERNAL_URL?.trim() ||
    process.env.INTERNAL_API_URL?.trim() ||
    process.env.NEXT_PUBLIC_API_URL?.trim() ||
    'http://localhost:3000/api/v1'
  ).replace(/\/$/, '');
}

function nextWithPortal(request: NextRequest, pathname: string, locale: 'vi' | 'en' = 'vi'): NextResponse {
  const requestHeaders = new Headers(request.headers);
  requestHeaders.set('x-pathname', pathname);
  requestHeaders.set(LOCALE_HEADER, locale);
  requestHeaders.set(PUBLIC_PATH_HEADER, pathname);
  const response = NextResponse.next({ request: { headers: requestHeaders } });
  response.headers.set(PORTAL_HEADER, 'public');
  return response;
}

function rewriteLocale(request: NextRequest, internalPath: string): NextResponse {
  const url = request.nextUrl.clone();
  url.pathname = internalPath;
  const requestHeaders = new Headers(request.headers);
  requestHeaders.set('x-pathname', request.nextUrl.pathname);
  requestHeaders.set(LOCALE_HEADER, 'en');
  requestHeaders.set(PUBLIC_PATH_HEADER, request.nextUrl.pathname);
  const response = NextResponse.rewrite(url, { request: { headers: requestHeaders } });
  response.headers.set(PORTAL_HEADER, 'public');
  response.cookies.set(LOCALE_COOKIE, 'en', { path: '/', maxAge: 60 * 60 * 24 * 365, sameSite: 'lax' });
  return response;
}

function withPortalHeader(response: NextResponse): NextResponse {
  response.headers.set(PORTAL_HEADER, 'public');
  return response;
}

const PLATFORM_STATUS_TTL_MS = 90_000;

type PlatformMode = 'OFF' | 'MAINTENANCE' | 'EMERGENCY';

let platformStatusCache: { at: number; mode: PlatformMode } | null = null;

async function readPlatformMode(): Promise<PlatformMode | null> {
  const now = Date.now();
  if (platformStatusCache && now - platformStatusCache.at < PLATFORM_STATUS_TTL_MS) {
    return platformStatusCache.mode;
  }

  try {
    const res = await fetch(`${apiBaseUrl()}/cms/platform-status`, {
      cache: 'no-store',
      headers: { Accept: 'application/json' },
    });
    if (!res.ok) {
      return platformStatusCache?.mode ?? null;
    }

    const payload = (await res.json()) as {
      data?: { mode?: string; maintenance?: boolean; emergency?: boolean };
    };
    const status = payload.data ?? (payload as { mode?: string; maintenance?: boolean; emergency?: boolean });
    const mode = (status.mode ?? 'OFF') as PlatformMode;
    platformStatusCache = { at: now, mode };
    return mode;
  } catch {
    return platformStatusCache?.mode ?? null;
  }
}

export async function middleware(request: NextRequest) {
  const host = request.headers.get('host')?.split(':')[0]?.toLowerCase() ?? '';
  if (host === 'customer.localhost') {
    const url = request.nextUrl.clone();
    url.protocol = request.nextUrl.protocol;
    url.hostname = 'localhost';
    return NextResponse.redirect(url, 301);
  }

  const { pathname } = request.nextUrl;
  const localeDecision = localeRoutingDecision({
    pathname,
    cookie: request.cookies.get(LOCALE_COOKIE)?.value,
    method: request.method,
  });
  const rulesPath =
    localeDecision.action === 'rewrite' ? localeDecision.internalPath : pathname;

  if (
    pathname.startsWith('/_next') ||
    pathname.startsWith('/api') ||
    pathname.includes('.')
  ) {
    return nextWithPortal(request, pathname);
  }

  // Legacy homepage tab deep-links → clean SEO paths (strip query).
  if (rulesPath === '/') {
    const category = request.nextUrl.searchParams.get('category');
    if (category === 'game' || category === 'phone') {
      const target = category === 'phone' ? '/the-dien-thoai' : '/the-game';
      const localized =
        localeDecision.locale === 'en' || request.cookies.get(LOCALE_COOKIE)?.value === 'en'
          ? withLocalePrefix(target, 'en')
          : target;
      return withPortalHeader(NextResponse.redirect(new URL(localized, request.url), 308));
    }
  }

  // Drop leftover ?category= / ?section=buy-card on the new paths.
  if (rulesPath === '/the-game' || rulesPath === '/the-dien-thoai') {
    const params = request.nextUrl.searchParams;
    if (params.has('category') || params.get('section') === 'buy-card') {
      const clean = new URL(
        localeDecision.locale === 'en' ? withLocalePrefix(rulesPath, 'en') : rulesPath,
        request.url,
      );
      params.delete('category');
      params.delete('section');
      params.forEach((value, key) => clean.searchParams.set(key, value));
      return withPortalHeader(NextResponse.redirect(clean, 308));
    }
  }

  const removedRoute = REMOVED_CUSTOMER_PORTAL_REDIRECTS[rulesPath];
  if (removedRoute) {
    const destination =
      localeDecision.locale === 'en' ? withLocalePrefix(removedRoute, 'en') : removedRoute;
    return withPortalHeader(NextResponse.redirect(new URL(destination, request.url)));
  }

  if (
    rulesPath.startsWith('/bao-tri') ||
    pathname.startsWith('/_next') ||
    pathname.startsWith('/api') ||
    pathname.includes('.')
  ) {
    return nextWithPortal(request, pathname);
  }

  const mode = await readPlatformMode();
  if (mode === 'MAINTENANCE' || mode === 'EMERGENCY') {
    const url = request.nextUrl.clone();
    url.pathname = '/bao-tri';
    url.searchParams.set('from', rulesPath);
    return withPortalHeader(NextResponse.redirect(url));
  }

  if (localeDecision.locale === 'en') {
    const legacy = englishLegacyRedirect(rulesPath, request.nextUrl.searchParams);
    if (legacy) {
      const url = request.nextUrl.clone();
      const target = new URL(legacy, request.url);
      url.pathname = target.pathname;
      url.search = target.search;
      const response = withPortalHeader(NextResponse.redirect(url, 308));
      response.cookies.set(LOCALE_COOKIE, 'en', {
        path: '/',
        maxAge: 60 * 60 * 24 * 365,
        sameSite: 'lax',
      });
      return response;
    }
  }

  if (localeDecision.action === 'redirect') {
    const url = request.nextUrl.clone();
    url.pathname = localeDecision.pathname;
    const response = withPortalHeader(NextResponse.redirect(url));
    response.cookies.set(LOCALE_COOKIE, localeDecision.locale, {
      path: '/',
      maxAge: 60 * 60 * 24 * 365,
      sameSite: 'lax',
    });
    return response;
  }

  if (localeDecision.action === 'rewrite') {
    return rewriteLocale(request, localeDecision.internalPath);
  }

  return nextWithPortal(request, pathname, 'vi');
}

export const config = {
  matcher: ['/((?!_next/static|_next/image|favicon.ico).*)'],
};
