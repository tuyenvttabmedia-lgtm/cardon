import { redirect } from 'next/navigation';

export default function ApiRootPage() {
  redirect('/api/keys');
}
