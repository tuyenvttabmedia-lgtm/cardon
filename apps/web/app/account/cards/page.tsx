import { permanentRedirect } from 'next/navigation';
import { ACCOUNT_PATHS } from '@/lib/account-routes';

export default function AccountCardsRedirectPage() {
  permanentRedirect(ACCOUNT_PATHS.gameCards);
}
