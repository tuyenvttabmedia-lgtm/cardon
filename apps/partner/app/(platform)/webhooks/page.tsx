import { redirect } from 'next/navigation';

export default function LegacyWebhooksPage() {
  redirect('/api/webhook');
}
