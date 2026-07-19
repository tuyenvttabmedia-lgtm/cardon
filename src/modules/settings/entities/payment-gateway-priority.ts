import type { MvpPaymentGatewayCode } from './settings.constants';

export interface GatewayPriorityEntry {
  code: MvpPaymentGatewayCode;
  priority: number;
  enabled?: boolean;
}

export function validateGatewayPriorities(
  gateways: Array<{ code: string; priority?: number | null }>,
): string | null {
  const seen = new Set<number>();
  for (const gateway of gateways) {
    if (gateway.priority == null || !Number.isFinite(gateway.priority)) {
      return 'Priority không được để trống.';
    }
    if (gateway.priority <= 0) {
      return 'Priority phải lớn hơn 0.';
    }
    if (seen.has(gateway.priority)) {
      return 'Priority đã được sử dụng bởi Gateway khác.';
    }
    seen.add(gateway.priority);
  }
  return null;
}

export function normalizeBuildVersion(version: string): string {
  return version.replace(/\s+HOTFIX$/i, '').trim();
}

export function versionsMatch(expected: string, actual: string | null | undefined): boolean {
  if (!actual) return false;
  return normalizeBuildVersion(expected) === normalizeBuildVersion(actual);
}

export function priorityOrderLabel(priority: number): string {
  const labels = ['①', '②', '③', '④', '⑤', '⑥', '⑦', '⑧', '⑨'];
  return labels[priority - 1] ?? String(priority);
}
