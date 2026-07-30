'use client';

import { OrdersListPageClient } from '@/components/orders/OrdersListPageClient';

export default function AgentOrdersPage() {
  return <OrdersListPageClient channel="AGENT" />;
}
