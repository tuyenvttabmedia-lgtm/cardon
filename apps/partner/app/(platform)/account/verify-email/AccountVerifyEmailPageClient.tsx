'use client';

import { useEffect } from 'react';
import { useRouter } from 'next/navigation';

/** Legacy route — onboarding email step lives on the KYC hub. */
export default function AccountVerifyEmailPageClient() {
  const router = useRouter();

  useEffect(() => {
    router.replace('/account/kyc');
  }, [router]);

  return (
    <p className="text-center text-sm text-slate-500">Đang chuyển đến Trung tâm KYC…</p>
  );
}
