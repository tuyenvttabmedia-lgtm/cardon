import { redirect } from 'next/navigation';

export default function WalletTransactionsLegacyPage() {
  redirect('/wallet/ledger');
}
