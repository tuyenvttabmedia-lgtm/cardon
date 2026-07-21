import { redirect } from 'next/navigation';

/** Self-serve withdraw is not offered — contact CardOn in writing when ending service. */
export default function FinanceWithdrawsPage() {
  redirect('/wallet');
}
