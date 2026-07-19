import { permanentRedirect } from 'next/navigation';

export default function LegacyThongBaoRedirect() {
  permanentRedirect('/');
}
