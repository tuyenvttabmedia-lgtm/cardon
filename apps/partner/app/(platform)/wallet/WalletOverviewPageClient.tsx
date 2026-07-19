'use client';

import { useEffect, useState } from 'react';
import { WalletOverviewCards } from '@/components/wallet/WalletOverviewCards';
import { BalanceSummaryCard, RecentActivityPanel } from '@/components/wallet/WalletPanels';
import { WalletPageShell } from '@/components/wallet/WalletSubNav';
import { walletApi } from '@/services/api-client';
import type { AgentWalletOverviewExtended, WalletRecentActivity } from '@/types/platform';

export default function WalletOverviewPageClient() {
  const [wallet, setWallet] = useState<AgentWalletOverviewExtended | null>(null);
  const [summary, setSummary] = useState<Record<string, unknown> | null>(null);
  const [activity, setActivity] = useState<WalletRecentActivity | null>(null);

  useEffect(() => {
    void Promise.all([
      walletApi.getOverview().then(setWallet),
      walletApi.getSummary().then(setSummary),
      walletApi.getActivity().then(setActivity),
    ]).catch(() => {});
  }, []);

  return (
    <WalletPageShell
      title="Tổng quan Ví"
      description="Trung tâm số dư đại lý — dữ liệu từ Sổ quỹ (Ledger)."
    >
      <div className="grid gap-6 xl:grid-cols-[1fr_320px]">
        <div className="space-y-6">
          <WalletOverviewCards wallet={wallet} />
          <BalanceSummaryCard summary={summary as Parameters<typeof BalanceSummaryCard>[0]['summary']} />
        </div>
        <RecentActivityPanel activity={activity} />
      </div>
    </WalletPageShell>
  );
}
