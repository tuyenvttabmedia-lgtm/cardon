'use client';

import { useRouter, useSearchParams } from 'next/navigation';
import { Suspense, useCallback } from 'react';
import { FinanceEsimPaypalPanel } from '@/components/finance/FinanceEsimPaypalPanel';
import { FinanceEsimRevenuePanel } from '@/components/finance/FinanceEsimRevenuePanel';
import { Button } from '@/components/ui/Form';

type EsimFinanceTab = 'revenue' | 'paypal';

function FinanceEsimTabs() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const tab: EsimFinanceTab = searchParams.get('tab') === 'paypal' ? 'paypal' : 'revenue';

  const selectTab = useCallback(
    (next: EsimFinanceTab) => {
      const params = new URLSearchParams(searchParams.toString());
      if (next === 'paypal') params.set('tab', 'paypal');
      else params.delete('tab');
      const qs = params.toString();
      router.replace(qs ? `/finance/esim?${qs}` : '/finance/esim', { scroll: false });
    },
    [router, searchParams],
  );

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap gap-2">
        <Button
          size="sm"
          variant={tab === 'revenue' ? 'primary' : 'secondary'}
          onClick={() => selectTab('revenue')}
        >
          Doanh thu
        </Button>
        <Button
          size="sm"
          variant={tab === 'paypal' ? 'primary' : 'secondary'}
          onClick={() => selectTab('paypal')}
        >
          PayPal fee
        </Button>
      </div>
      {tab === 'revenue' ? <FinanceEsimRevenuePanel /> : <FinanceEsimPaypalPanel />}
    </div>
  );
}

export default function FinanceEsimPage() {
  return (
    <Suspense fallback={<div className="text-sm text-slate-500">Đang tải…</div>}>
      <FinanceEsimTabs />
    </Suspense>
  );
}
