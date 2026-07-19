import { NextResponse } from 'next/server';
import type { NextRequest } from 'next/server';
import { REMOVED_CUSTOMER_PORTAL_REDIRECTS } from '@/lib/account-routes';
import { PORTAL_HEADER } from '@/lib/portal-host';

function apiBaseUrl(): string {
  return (
    process.env.API_INTERNAL_URL?.trim() ||
    process.env.INTERNAL_API_URL?.trim() ||
    process.env.NEXT_PUBLIC_API_URL?.trim() ||
    'http://localhost:3000/api/v1'
  ).replace(/\/$/, '');
}

function withPortalHeader(response: NextResponse): NextResponse {
  response.headers.set(PORTAL_HEADER, 'public');
  return response;
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

  if (
    pathname.startsWith('/_next') ||
    pathname.startsWith('/api') ||
    pathname.includes('.')
  ) {
    return NextResponse.next();
  }

  const removedRoute = REMOVED_CUSTOMER_PORTAL_REDIRECTS[pathname];
  if (removedRoute) {
    return withPortalHeader(NextResponse.redirect(new URL(removedRoute, request.url)));
  }

  if (
    pathname.startsWith('/bao-tri') ||
    pathname.startsWith('/_next') ||
    pathname.startsWith('/api') ||
    pathname.includes('.')
  ) {
    return withPortalHeader(NextResponse.next());
  }

  try {
    const res = await fetch(`${apiBaseUrl()}/cms/platform-status`, {
      cache: 'no-store',
      headers: { Accept: 'application/json' },
    });
    if (!res.ok) {
      return withPortalHeader(NextResponse.next());
    }

    const payload = (await res.json()) as {
      data?: { mode?: string; maintenance?: boolean; emergency?: boolean };
    };
    const status = payload.data ?? (payload as { mode?: string; maintenance?: boolean; emergency?: boolean });
    const mode = status.mode ?? 'OFF';

    if (mode === 'MAINTENANCE' || mode === 'EMERGENCY') {
      const url = request.nextUrl.clone();
      url.pathname = '/bao-tri';
      url.searchParams.set('from', pathname);
      return withPortalHeader(NextResponse.redirect(url));
    }
  } catch {
    return withPortalHeader(NextResponse.next());
  }

  return withPortalHeader(NextResponse.next());
}

export const config = {
  matcher: ['/((?!_next/static|_next/image|favicon.ico).*)'],
};
