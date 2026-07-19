import { NextResponse } from 'next/server';
import type { NextRequest } from 'next/server';
import {
  PARTNER_LEGACY_REDIRECTS,
  PARTNER_PUBLIC_PATHS,
  PARTNER_SESSION_COOKIE,
  isPartnerPlatformPath,
} from '@/lib/partner-session';
import { PARTNER_HIDDEN_ERP_PREFIXES } from '@/lib/agent-platform/navigation';

function hasSession(request: NextRequest): boolean {
  return request.cookies.get(PARTNER_SESSION_COOKIE)?.value === '1';
}

export function middleware(request: NextRequest) {
  const { pathname } = request.nextUrl;

  if (
    pathname.startsWith('/_next') ||
    pathname.startsWith('/api/v1') ||
    pathname.startsWith('/api/partner') ||
    pathname.includes('.')
  ) {
    return NextResponse.next();
  }

  if (pathname === '/account/verify-email' || pathname.startsWith('/account/verify-email/')) {
    return NextResponse.redirect(new URL('/account/kyc', request.url));
  }

  const legacyTarget = PARTNER_LEGACY_REDIRECTS[pathname];
  if (legacyTarget) {
    return NextResponse.redirect(new URL(legacyTarget, request.url));
  }

  for (const prefix of PARTNER_HIDDEN_ERP_PREFIXES) {
    if (pathname === prefix || pathname.startsWith(`${prefix}/`)) {
      const mapped = PARTNER_LEGACY_REDIRECTS[prefix];
      if (mapped) continue;
      return NextResponse.redirect(new URL('/coming-soon', request.url));
    }
  }

  const authed = hasSession(request);

  if (pathname === '/') {
    return NextResponse.redirect(new URL(authed ? '/dashboard' : '/login', request.url));
  }

  // Login redirect when already authed is handled client-side (localStorage + token check).
  if (pathname === '/login') {
    return NextResponse.next();
  }

  if (pathname === '/verify-email') {
    return NextResponse.next();
  }

  if (isPartnerPlatformPath(pathname) && !authed) {
    const login = new URL('/login', request.url);
    login.searchParams.set('next', pathname);
    return NextResponse.redirect(login);
  }

  if (!PARTNER_PUBLIC_PATHS.has(pathname) && !isPartnerPlatformPath(pathname) && pathname !== '/') {
    return NextResponse.redirect(new URL(authed ? '/dashboard' : '/login', request.url));
  }

  return NextResponse.next();
}

export const config = {
  matcher: ['/((?!_next/static|_next/image|favicon.ico).*)'],
};
