import { redirect } from 'next/navigation';

/** Root entry — middleware handles auth routing; this is a server fallback only. */
export default function PartnerRootPage() {
  redirect('/dashboard');
}
