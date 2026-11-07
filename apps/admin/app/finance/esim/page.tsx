'use client';

import { useState } from 'react';
import { FinanceEsimPaypalPanel } from '@/components/finance/FinanceEsimPaypalPanel';
import { FinanceEsimRevenuePanel } from '@/components/finance/FinanceEsimRevenuePanel';
import { Button } from '@/components/ui/Form';

type EsimFinanceTab = 'revenue' | 'paypal';

export default function FinanceEsimPage() {
  const [tab, setTab] = useState<EsimFinanceTab>('revenue');

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap gap-2">
        <Button
          size="sm"
          variant={tab === 'revenue' ? 'primary' : 'secondary'}
          onClick={() => setTab('revenue')}
        >
          Doanh thu
        </Button>
        <Button
          size="sm"
          variant={tab === 'paypal' ? 'primary' : 'secondary'}
          onClick={() => setTab('paypal')}
        >
          PayPal fee
        </Button>
      </div>
      {tab === 'revenue' ? <FinanceEsimRevenuePanel /> : <FinanceEsimPaypalPanel />}
    </div>
  );
}
