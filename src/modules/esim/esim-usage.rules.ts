/** Pure helpers for Airalo GET /v2/sims/{iccid}/usage — no HTTP. */

export type EsimUsageStatus =
  | 'NOT_ACTIVE'
  | 'ACTIVE'
  | 'FINISHED'
  | 'EXPIRED'
  | 'RECYCLED'
  | 'UNKNOWN';

export interface EsimUsageSnapshot {
  status: EsimUsageStatus;
  statusLabelVi: string;
  statusLabelEn: string;
  isUnlimited: boolean;
  totalMb: number | null;
  remainingMb: number | null;
  usedMb: number | null;
  remainingPercent: number | null;
  usedPercent: number | null;
  expiredAt: string | null;
  expiresInDays: number | null;
  expiringSoon: boolean;
  canTopupHint: boolean;
}

export function normalizeEsimUsageStatus(raw: unknown): EsimUsageStatus {
  const value = String(raw ?? '')
    .trim()
    .toUpperCase();
  if (value === 'NOT_ACTIVE' || value === 'INACTIVE') return 'NOT_ACTIVE';
  if (value === 'ACTIVE') return 'ACTIVE';
  if (value === 'FINISHED') return 'FINISHED';
  if (value === 'EXPIRED') return 'EXPIRED';
  if (value === 'RECYCLED') return 'RECYCLED';
  return 'UNKNOWN';
}

export function maskEsimIccid(iccid: string | null | undefined): string | null {
  const trimmed = String(iccid ?? '').trim();
  if (trimmed.length < 10) return null;
  if (trimmed.length <= 8) return trimmed;
  return `${trimmed.slice(0, 4)}••••${trimmed.slice(-4)}`;
}

export function parseAiraloUsageBody(body: unknown, now = new Date()): EsimUsageSnapshot | null {
  const data =
    body && typeof body === 'object' && (body as { data?: unknown }).data != null
      ? (body as { data: unknown }).data
      : body;
  if (!data || typeof data !== 'object' || Array.isArray(data)) return null;
  const row = data as Record<string, unknown>;
  const status = normalizeEsimUsageStatus(row.status);
  const isUnlimited = row.is_unlimited === true;
  const total = Number(row.total);
  const remaining = Number(row.remaining);
  const hasQuota =
    !isUnlimited && Number.isFinite(total) && total > 0 && Number.isFinite(remaining) && remaining >= 0;
  const totalMb = hasQuota ? Math.round(total) : isUnlimited ? null : Number.isFinite(total) ? Math.round(total) : null;
  const remainingMb = hasQuota
    ? Math.round(remaining)
    : isUnlimited
      ? null
      : Number.isFinite(remaining)
        ? Math.round(remaining)
        : null;
  const usedMb = hasQuota && totalMb != null && remainingMb != null ? Math.max(0, totalMb - remainingMb) : null;
  const remainingPercent =
    hasQuota && totalMb != null && totalMb > 0 && remainingMb != null
      ? Math.max(0, Math.min(100, Math.round((remainingMb / totalMb) * 100)))
      : null;
  const usedPercent = remainingPercent != null ? Math.max(0, 100 - remainingPercent) : null;
  const expiredAtRaw = typeof row.expired_at === 'string' ? row.expired_at.trim() : '';
  const expiredAt = expiredAtRaw || null;
  const expiresInDays = expiredAt ? daysUntil(expiredAt, now) : null;
  const expiringSoon =
    status === 'ACTIVE' && expiresInDays != null && expiresInDays >= 0 && expiresInDays <= 3;
  const labels = statusLabels(status, expiringSoon, expiresInDays);

  return {
    status,
    statusLabelVi: labels.vi,
    statusLabelEn: labels.en,
    isUnlimited,
    totalMb: isUnlimited ? null : totalMb,
    remainingMb: isUnlimited ? null : remainingMb,
    usedMb: isUnlimited ? null : usedMb,
    remainingPercent: isUnlimited ? null : remainingPercent,
    usedPercent: isUnlimited ? null : usedPercent,
    expiredAt,
    expiresInDays,
    expiringSoon,
    canTopupHint:
      status === 'ACTIVE' ||
      status === 'FINISHED' ||
      status === 'EXPIRED' ||
      (status === 'NOT_ACTIVE' && Boolean(expiredAt)),
  };
}

function daysUntil(expiredAt: string, now: Date): number | null {
  const parsed = Date.parse(expiredAt.includes('T') ? expiredAt : expiredAt.replace(' ', 'T') + 'Z');
  if (!Number.isFinite(parsed)) return null;
  const diffMs = parsed - now.getTime();
  return Math.ceil(diffMs / (24 * 60 * 60 * 1000));
}

function statusLabels(
  status: EsimUsageStatus,
  expiringSoon: boolean,
  expiresInDays: number | null,
): { vi: string; en: string } {
  if (expiringSoon && expiresInDays != null) {
    if (expiresInDays <= 0) {
      return { vi: 'Hết hạn hôm nay', en: 'Expires today' };
    }
    if (expiresInDays === 1) {
      return { vi: 'Hết hạn trong 1 ngày', en: 'Expires in 1 day' };
    }
    return {
      vi: `Hết hạn trong ${expiresInDays} ngày`,
      en: `Expires in ${expiresInDays} days`,
    };
  }
  switch (status) {
    case 'NOT_ACTIVE':
      return { vi: 'Chưa kích hoạt', en: 'Not activated' };
    case 'ACTIVE':
      return { vi: 'Đang dùng', en: 'Active' };
    case 'FINISHED':
      return { vi: 'Hết dung lượng', en: 'Data finished' };
    case 'EXPIRED':
      return { vi: 'Đã hết hạn', en: 'Expired' };
    case 'RECYCLED':
      return { vi: 'Đã thu hồi', en: 'Recycled' };
    default:
      return { vi: 'Không xác định', en: 'Unknown' };
  }
}

export function readEsimTopupTrace(clientTrace: unknown): {
  esimLane: 'topup';
  parentOrderId: string;
  iccid: string;
  packageId: string;
} | null {
  if (!clientTrace || typeof clientTrace !== 'object' || Array.isArray(clientTrace)) return null;
  const row = clientTrace as Record<string, unknown>;
  if (row.esimLane !== 'topup') return null;
  const parentOrderId = typeof row.parentOrderId === 'string' ? row.parentOrderId.trim() : '';
  const iccid = typeof row.iccid === 'string' ? row.iccid.trim() : '';
  const packageId = typeof row.packageId === 'string' ? row.packageId.trim() : '';
  if (!parentOrderId || !iccid || !packageId) return null;
  return { esimLane: 'topup', parentOrderId, iccid, packageId };
}
