import { vi } from './vi';

export { vi };

/** Map backend enum/status to Vietnamese label; unknown values pass through. */
export function translateStatus(status: string): string {
  const map = vi.status as Record<string, string>;
  return map[status] ?? status;
}

export function translateRole(role: string): string {
  const map = vi.roles as Record<string, string>;
  return map[role] ?? role;
}

export function t(path: string): string {
  const parts = path.split('.');
  let cur: unknown = vi;
  for (const p of parts) {
    if (cur && typeof cur === 'object' && p in cur) {
      cur = (cur as Record<string, unknown>)[p];
    } else {
      return path;
    }
  }
  return typeof cur === 'string' ? cur : path;
}
