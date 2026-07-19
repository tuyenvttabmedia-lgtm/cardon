import { AgentManagementShell } from '@/components/agents/AgentManagementShell';

export default function AgentsLayout({ children }: { children: React.ReactNode }) {
  return <AgentManagementShell>{children}</AgentManagementShell>;
}
