import type { Metadata } from 'next';
import { buildMetadata } from '@/lib/seo';
import MaintenancePageClient from './MaintenancePageClient';

export const metadata: Metadata = buildMetadata({
  title: 'Bảo trì hệ thống — CardOn.vn',
  path: '/bao-tri',
  robots: { index: false, follow: false },
});

export default function MaintenancePage() {
  return <MaintenancePageClient />;
}
