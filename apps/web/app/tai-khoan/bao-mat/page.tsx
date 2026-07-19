import { permanentRedirect } from 'next/navigation';
import { ACCOUNT_PATHS } from '@/lib/account-routes';

export default function LegacyBaoMatRedirect() {
  permanentRedirect(ACCOUNT_PATHS.password);
}
