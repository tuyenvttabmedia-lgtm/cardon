import { AgentDetailView } from '@/components/agents/AgentDetailView';

export default async function AgentDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  // Force a clean client state when navigating between agents on the same
  // dynamic route. This also prevents sensitive forms/credentials from being
  // carried from the previous agent.
  return <AgentDetailView key={id} agentId={id} />;
}
