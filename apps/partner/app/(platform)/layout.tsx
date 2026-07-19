import { AgentShell } from '@/components/layout/AgentShell';

export default function PlatformLayout({ children }: { children: React.ReactNode }) {
  return <AgentShell>{children}</AgentShell>;
}
