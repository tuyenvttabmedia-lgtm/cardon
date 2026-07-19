'use client';

import { useEffect, useState } from 'react';
import { Card } from '@/components/ui/Card';
import { WalletPageShell } from '@/components/wallet/WalletSubNav';
import { walletApi } from '@/services/api-client';

export default function WalletWithdrawsPageClient() {
  const [foundation, setFoundation] = useState(false);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    void walletApi
      .listWithdraws()
      .then((r) => setFoundation(!!r.foundation))
      .finally(() => setLoading(false));
  }, []);

  return (
    <WalletPageShell title="Withdraw History" description="Read-only — withdraw execution ships in a future build.">
      <Card className="border-dashed border-amber-200 bg-amber-50/50 p-6">
        {loading ? (
          <p className="text-sm text-slate-500">Đang tải…</p>
        ) : (
          <>
            <p className="font-semibold text-amber-900">Withdraw module — foundation only</p>
            <p className="mt-2 text-sm text-amber-800">
              {foundation
                ? 'No withdraw records yet. Withdraw requests will appear here when the withdraw engine is enabled.'
                : 'Withdraw history will list completed and pending withdraw requests.'}
            </p>
          </>
        )}
      </Card>
    </WalletPageShell>
  );
}
