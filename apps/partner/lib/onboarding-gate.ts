import type { OnboardingGateFlags, OnboardingStatus } from '@/types/onboarding';

/** Routes always allowed before KYC approval. */
export const ONBOARDING_ALLOWED_PREFIXES = [
  '/account/kyc',
  '/account/verify-email',
  '/notifications',
  '/verify-email',
  '/login',
  '/api/docs',
  '/api/sdk',
] as const;

/** Routes blocked until email verified + KYC approved. */
export const ONBOARDING_BLOCKED_PREFIXES = [
  '/wallet',
  '/finance',
  '/orders',
  '/reports',
  '/invoices',
  '/api/keys',
  '/api/ip-whitelist',
  '/api/webhook',
  '/api/rate-limit',
  '/api/security',
  '/api/logs',
  '/api/test',
  '/api/usage',
  '/dashboard',
  '/users',
] as const;

/** Hidden until multi-user org features are enabled for the tenant. */
export const PARTNER_TEAM_NAV_ENABLED =
  process.env.NEXT_PUBLIC_PARTNER_TEAM_NAV === 'true';

export function isFullyOnboarded(status: OnboardingStatus | null): boolean {
  if (!status) return false;
  return (
    status.emailVerified &&
    status.gates.canUseWallet &&
    status.gates.canUseOrders &&
    status.gates.canUseApi
  );
}

export function getOnboardingRedirectPath(status: OnboardingStatus | null): string {
  if (!status || isFullyOnboarded(status)) return '/dashboard';
  return status.kycPath || '/account/kyc';
}

export function isOnboardingAllowedPath(
  pathname: string,
  status: OnboardingStatus | null,
): boolean {
  if (!status || isFullyOnboarded(status)) {
    return true;
  }

  return ONBOARDING_ALLOWED_PREFIXES.some(
    (p) => pathname === p || pathname.startsWith(`${p}/`),
  );
}

export function gateBlockedMessage(status: OnboardingStatus | null): string {
  return status?.banner ?? 'Vui lòng hoàn thiện xác minh KYC để sử dụng dịch vụ.';
}

export type { OnboardingGateFlags, OnboardingStatus };
