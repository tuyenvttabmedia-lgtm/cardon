import { redirect } from 'next/navigation';

export default function WalletDepositsRedirect() {
  redirect('/finance/deposits');
}
