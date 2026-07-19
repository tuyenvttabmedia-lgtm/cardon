import { permanentRedirect } from 'next/navigation';
import { ACCOUNT_PATHS } from '@/lib/account-routes';

export default function LegacyKhoPinRedirect() {
  permanentRedirect(ACCOUNT_PATHS.cards);
}
