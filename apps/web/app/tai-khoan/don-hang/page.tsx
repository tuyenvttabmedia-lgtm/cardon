import { permanentRedirect } from 'next/navigation';
import { ACCOUNT_PATHS } from '@/lib/account-routes';

export default function LegacyDonHangRedirect() {
  permanentRedirect(ACCOUNT_PATHS.orders);
}
