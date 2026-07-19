'use client';

import { useEffect, useState } from 'react';
import { Badge, statusToBadgeTone } from '@/components/ui/Badge';
import { Card } from '@/components/ui/Card';
import { PlatformSection } from '@/components/platform/PlatformSection';
import { useAgentProfile } from '@/hooks/useAuth';
import { agentApi } from '@/services/api-client';
import { formatDateTime, formatVnd, ledgerTypeLabel } from '@/lib/utils';
import type { LedgerEntry } from '@/types/api';

const LEDGER_GROUPS = [
  'Deposit',
  'Withdraw',
  'Adjustment',
  'Refund',
  'Purchase',
  'Commission',
  'Settlement',
  'Transfer',
] as const;

export default function WalletTransactionsPageClient() {
  const { profile, loading: profileLoading } = useAgentProfile();
  const [ledger, setLedger] = useState<LedgerEntry[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    agentApi
      .getLedger()
      .then(setLedger)
      .catch((err) => setError(err instanceof Error ? err.message : 'Failed to load ledger'))
      .finally(() => setLoading(false));
  }, []);

  return (
    <PlatformSection
      title="Transactions"
      description="Ledger entries — reuses the existing wallet engine without duplicate finance logic."
    >
      <div className="flex flex-wrap gap-2">
        {LEDGER_GROUPS.map((g) => (
          <span key={g} className="rounded-full bg-slate-100 px-3 py-1 text-xs font-medium text-slate-600">
            {g}
          </span>
        ))}
      </div>

      {profile && (
        <p className="text-sm text-slate-600">
          Available {formatVnd(profile.balance.availableBalance)} · Frozen {formatVnd(profile.balance.heldBalance)}
        </p>
      )}

      <Card>
        {profileLoading || loading ? <p className="text-sm text-slate-500">Loading ledger...</p> : null}
        {error && <p className="text-sm text-red-600">{error}</p>}
        {!loading && !error && ledger.length === 0 && (
          <p className="text-sm text-slate-500">No ledger entries yet.</p>
        )}
        {ledger.length > 0 && (
          <div className="overflow-x-auto">
            <table className="min-w-full text-sm">
              <thead>
                <tr className="border-b border-slate-100 text-left text-slate-500">
                  <th className="py-2 pr-4">Time</th>
                  <th className="py-2 pr-4">Type</th>
                  <th className="py-2 pr-4">Amount</th>
                  <th className="py-2 pr-4">Balance after</th>
                  <th className="py-2">Description</th>
                </tr>
              </thead>
              <tbody>
                {ledger.map((entry) => (
                  <tr key={entry.id} className="border-b border-slate-50">
                    <td className="py-3 pr-4 whitespace-nowrap">{formatDateTime(entry.createdAt)}</td>
                    <td className="py-3 pr-4">
                      <Badge tone={statusToBadgeTone(entry.type)}>{ledgerTypeLabel(entry.type)}</Badge>
                    </td>
                    <td className="py-3 pr-4">{formatVnd(entry.amount)}</td>
                    <td className="py-3 pr-4">{formatVnd(entry.afterBalance)}</td>
                    <td className="py-3">{entry.description ?? entry.referenceType}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </Card>
    </PlatformSection>
  );
}
