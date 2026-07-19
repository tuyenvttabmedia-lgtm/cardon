import { AgentDetailView } from '@/components/agents/AgentDetailView';

export default async function AgentDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  return <AgentDetailView agentId={id} />;
}
