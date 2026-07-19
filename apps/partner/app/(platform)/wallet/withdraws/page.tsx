import { redirect } from 'next/navigation';

export default function WalletWithdrawsRedirect() {
  redirect('/finance/withdraws');
}
