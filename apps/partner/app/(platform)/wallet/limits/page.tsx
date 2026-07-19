import { redirect } from 'next/navigation';

export default function WalletLimitsRedirect() {
  redirect('/finance/credit');
}
