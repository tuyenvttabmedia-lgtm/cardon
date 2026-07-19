'use client';

import { createContext, useContext, useEffect, useMemo, useState } from 'react';
import { agentApi } from '@/services/api-client';
import type { OnboardingStatus } from '@/types/onboarding';
import {
  getOnboardingRedirectPath,
  isFullyOnboarded,
  isOnboardingAllowedPath,
} from '@/lib/onboarding-gate';

type OnboardingContextValue = {
  status: OnboardingStatus | null;
  loading: boolean;
  fullyOnboarded: boolean;
  redirectPath: string;
  isPathAllowed: (pathname: string) => boolean;
  refresh: () => Promise<void>;
};

const OnboardingContext = createContext<OnboardingContextValue | null>(null);

export function OnboardingProvider({ children }: { children: React.ReactNode }) {
  const [status, setStatus] = useState<OnboardingStatus | null>(null);
  const [loading, setLoading] = useState(true);

  async function load() {
    try {
      const next = await agentApi.getOnboardingStatus();
      setStatus(next);
    } catch {
      setStatus(null);
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    void load();
  }, []);

  const value = useMemo<OnboardingContextValue>(() => {
    const fullyOnboarded = isFullyOnboarded(status);
    return {
      status,
      loading,
      fullyOnboarded,
      redirectPath: getOnboardingRedirectPath(status),
      isPathAllowed: (pathname: string) => isOnboardingAllowedPath(pathname, status),
      refresh: load,
    };
  }, [status, loading]);

  return <OnboardingContext.Provider value={value}>{children}</OnboardingContext.Provider>;
}

export function useOnboarding() {
  const ctx = useContext(OnboardingContext);
  if (!ctx) {
    throw new Error('useOnboarding must be used within OnboardingProvider');
  }
  return ctx;
}
