import { MonitoringShell } from '@/components/monitoring/MonitoringShell';

export default function MonitoringLayout({ children }: { children: React.ReactNode }) {
  return <MonitoringShell>{children}</MonitoringShell>;
}
