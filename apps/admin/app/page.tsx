'use client';

import { useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { useAuth } from '@/hooks/useAuth';
import { defaultRouteForRole } from '@/lib/permissions';

export default function HomePage() {
  const router = useRouter();
  const { user, permissions, loading, isAuthenticated } = useAuth();

  useEffect(() => {
    if (loading) return;
    if (!isAuthenticated || !user) {
      router.replace('/login');
      return;
    }
    router.replace(defaultRouteForRole(user.role, permissions));
  }, [loading, isAuthenticated, user, permissions, router]);

  return (
    <div className="flex min-h-screen items-center justify-center text-sm text-zinc-500">
      Đang chuyển hướng…
    </div>
  );
}
