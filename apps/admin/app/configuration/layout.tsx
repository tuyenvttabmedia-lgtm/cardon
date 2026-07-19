'use client';

import { ConfigurationShell } from '@/components/configuration/ConfigurationShell';
import { RequirePermission } from '@/components/layout/AdminShell';

export default function ConfigurationLayout({ children }: { children: React.ReactNode }) {
  return (
    <RequirePermission permission="configuration.read">
      <ConfigurationShell>{children}</ConfigurationShell>
    </RequirePermission>
  );
}
