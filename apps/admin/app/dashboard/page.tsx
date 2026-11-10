'use client';

import { RequirePermission } from '@/components/layout/AdminShell';
import { DashboardCockpit } from '@/components/dashboard/DashboardCockpit';

export default function DashboardPage() {
  return (
    <RequirePermission permission="admin.dashboard">
      <DashboardCockpit />
    </RequirePermission>
  );
}
