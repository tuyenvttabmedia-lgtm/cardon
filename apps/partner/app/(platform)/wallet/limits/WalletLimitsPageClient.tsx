'use client';

import { useEffect, useState } from 'react';
import { StatCard } from '@/components/ui/Card';
import { WalletPageShell } from '@/components/wallet/WalletSubNav';
import { walletApi } from '@/services/api-client';
import { formatVnd } from '@/lib/utils';
import type { WalletLimits } from '@/types/platform';

export default function WalletLimitsPageClient() {
  const [limits, setLimits] = useState<WalletLimits | null>(null);

  useEffect(() => {
    void walletApi.getLimits().then(setLimits);
  }, []);

  return (
    <WalletPageShell title="Credit & Limits" description="Read-only credit and purchase limits for this phase.">
      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
        <StatCard label="Credit Limit" value={formatVnd(limits?.creditLimit ?? '0')} />
        <StatCard label="Daily Purchase Limit" value={formatVnd(limits?.dailyPurchaseLimit ?? '0')} />
        <StatCard label="Monthly Purchase Limit" value={formatVnd(limits?.monthlyPurchaseLimit ?? '0')} />
        <StatCard label="Current Utilization" value={`${limits?.currentUtilization ?? '0'}%`} />
        <StatCard label="Remaining Limit" value={formatVnd(limits?.remainingLimit ?? '0')} />
        <StatCard label="Status" value={limits?.status ?? 'ACTIVE'} />
      </div>
    </WalletPageShell>
  );
}
