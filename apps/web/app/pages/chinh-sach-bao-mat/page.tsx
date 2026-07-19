import { permanentRedirect } from 'next/navigation';

export default function LegacyPrivacyRedirect() {
  permanentRedirect('/chinh-sach-bao-mat');
}
