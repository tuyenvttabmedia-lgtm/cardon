'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import { useAuth } from '@/hooks/useAuth';
import type { SidebarBadgeKey } from '@/lib/permissions';
import { adminApi, agentCenterApi, operationsApi } from '@/services/api-client';

export type SidebarBadgeCounts = Partial<Record<SidebarBadgeKey, number>>;

const REFRESH_MS = 60_000;

/**
 * Sidebar action badges — existing APIs only.
 * agentKycPending uses agent-center dashboard `pendingReview` (= AgentKycStatus.SUBMITTED).
 */
export function useSidebarBadges(enabled: boolean): SidebarBadgeCounts {
  const { can, user } = useAuth();
  const [counts, setCounts] = useState<SidebarBadgeCounts>({});
  const alive = useRef(true);

  const load = useCallback(async () => {
    if (!enabled || !user) {
      setCounts({});
      return;
    }

    const next: SidebarBadgeCounts = {};
    const tasks: Array<Promise<void>> = [];

    if (can('admin.dashboard')) {
      tasks.push(
        adminApi
          .getDashboard('today')
          .then((data) => {
            const n = data.backlog?.needManualReview;
            if (typeof n === 'number' && n > 0) next.retailNmr = n;
          })
          .catch(() => undefined),
      );
    }

    if (can('orders.read')) {
      tasks.push(
        adminApi
          .getEsimOpsDashboard()
          .then((data) => {
            const n = data.orders?.needManualReview;
            if (typeof n === 'number' && n > 0) next.esimNmr = n;
          })
          .catch(() => undefined),
      );
    }

    if (
      ['refund.request', 'refund.approve', 'refund.execute', 'refund.reconcile'].some((p) =>
        can(p),
      )
    ) {
      tasks.push(
        adminApi
          .listRefundRequests({ needsAction: true, skip: 0, take: 1 })
          .then((data) => {
            const n = data.total;
            if (typeof n === 'number' && n > 0) next.refundNeedsAction = n;
          })
          .catch(() => undefined),
      );
    }

    if (can('reconciliation.read') || can('finance.view')) {
      tasks.push(
        operationsApi
          .getDashboard()
          .then((data) => {
            const n = data.cards?.exceptions;
            if (typeof n === 'number' && n > 0) next.opsExceptions = n;
          })
          .catch(() => undefined),
      );
    }

    if (can('users.read')) {
      tasks.push(
        agentCenterApi
          .dashboard()
          .then((data) => {
            const n = data.pendingReview;
            if (typeof n === 'number' && n > 0) next.agentKycPending = n;
          })
          .catch(() => undefined),
      );
    }

    await Promise.all(tasks);
    if (alive.current) setCounts(next);
  }, [can, enabled, user]);

  useEffect(() => {
    alive.current = true;
    void load();
    const id = window.setInterval(() => void load(), REFRESH_MS);
    return () => {
      alive.current = false;
      window.clearInterval(id);
    };
  }, [load]);

  return counts;
}
