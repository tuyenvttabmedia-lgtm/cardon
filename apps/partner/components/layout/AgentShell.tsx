'use client';

import { useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { useAuth } from '@/hooks/useAuth';
import { AgentPlatformProvider } from '@/hooks/useAgentPlatform';
import { MobileNav, Sidebar } from '@/components/layout/Sidebar';
import { ImpersonationBanner } from '@/components/layout/ImpersonationBanner';
import { OnboardingGate } from '@/components/platform/OnboardingGate';
import { OnboardingProvider } from '@/contexts/OnboardingContext';
import { clearPartnerSessionCookie } from '@/lib/partner-session';

function AuthLoading({ message }: { message: string }) {
  return (
    <div className="flex min-h-screen items-center justify-center bg-slate-50 text-slate-500">
      {message}
    </div>
  );
}

export function AuthGuard({ children }: { children: React.ReactNode }) {
  const { isAuthenticated, loading } = useAuth();
  const router = useRouter();

  useEffect(() => {
    if (loading || isAuthenticated) return;
    clearPartnerSessionCookie();
    const next = encodeURIComponent(window.location.pathname + window.location.search);
    router.replace(`/login?next=${next}`);
  }, [loading, isAuthenticated, router]);

  if (loading) {
    return <AuthLoading message="Đang tải nền tảng đại lý..." />;
  }

  if (!isAuthenticated) {
    return <AuthLoading message="Đang chuyển đến trang đăng nhập..." />;
  }

  return (
    <AgentPlatformProvider>
      <OnboardingProvider>
        <div className="flex min-h-screen flex-col bg-slate-50 lg:flex-row">
          <div className="hidden w-64 shrink-0 lg:block">
            <div className="sticky top-0 h-screen">
              <Sidebar />
            </div>
          </div>
          <MobileNav />
          <main className="min-w-0 flex-1 overflow-auto p-4 md:p-6 lg:p-8">
            <ImpersonationBanner />
            <OnboardingGate>{children}</OnboardingGate>
          </main>
        </div>
      </OnboardingProvider>
    </AgentPlatformProvider>
  );
}

export function AgentShell({ children }: { children: React.ReactNode }) {
  return <AuthGuard>{children}</AuthGuard>;
}

/** @deprecated Use AgentShell */
export const PortalShell = AgentShell;
