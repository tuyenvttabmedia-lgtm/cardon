import { permanentRedirect } from 'next/navigation';
import { ACCOUNT_PATHS } from '@/lib/account-routes';

export default function LegacyPurchasedCardsRedirect() {
  permanentRedirect(ACCOUNT_PATHS.gameCards);
}
