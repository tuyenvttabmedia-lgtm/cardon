'use client';

import { useEffect } from 'react';
import { usePathname, useRouter } from 'next/navigation';
import { useOnboarding } from '@/contexts/OnboardingContext';
import { gateBlockedMessage } from '@/lib/onboarding-gate';

export function OnboardingGate({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();
  const router = useRouter();
  const { status, loading, fullyOnboarded, redirectPath, isPathAllowed } = useOnboarding();

  useEffect(() => {
    if (loading || !status || fullyOnboarded) return;
    if (isPathAllowed(pathname)) return;
    if (pathname !== redirectPath) {
      router.replace(redirectPath);
    }
  }, [loading, status, fullyOnboarded, pathname, redirectPath, isPathAllowed, router]);

  if (loading) {
    return (
      <div className="rounded-lg border border-slate-200 bg-white px-4 py-8 text-center text-sm text-slate-500">
        Đang kiểm tra trạng thái onboarding...
      </div>
    );
  }

  const showBanner = status && !fullyOnboarded && status.banner;

  return (
    <>
      {showBanner && pathname !== redirectPath && (
        <div className="mb-4 rounded-lg border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-900">
          <p className="font-medium">{gateBlockedMessage(status)}</p>
          <p className="mt-2">
            <a href={redirectPath} className="font-semibold underline">
              Tiếp tục xác minh →
            </a>
          </p>
        </div>
      )}
      {children}
    </>
  );
}
