import { cn } from '@/lib/utils';

type BadgeTone = 'default' | 'success' | 'warning' | 'danger' | 'info';

const toneClass: Record<BadgeTone, string> = {
  default: 'bg-slate-100 text-slate-700',
  success: 'bg-emerald-100 text-emerald-800',
  warning: 'bg-amber-100 text-amber-800',
  danger: 'bg-red-100 text-red-800',
  info: 'bg-indigo-100 text-indigo-800',
};

export function Badge({
  children,
  tone = 'default',
  className,
}: {
  children: React.ReactNode;
  tone?: BadgeTone;
  className?: string;
}) {
  return (
    <span
      className={cn(
        'inline-flex rounded-full px-2.5 py-0.5 text-xs font-semibold',
        toneClass[tone],
        className,
      )}
    >
      {children}
    </span>
  );
}

export function statusToBadgeTone(status: string): BadgeTone {
  if (status === 'ACTIVE' || status === 'APPROVED' || status === 'SUCCESS') {
    return 'success';
  }
  if (
    status === 'PENDING_KYC' ||
    status === 'SUBMITTED' ||
    status === 'PENDING' ||
    status === 'PROCESSING'
  ) {
    return 'warning';
  }
  if (status === 'REJECTED' || status === 'FAILED' || status === 'SUSPENDED') {
    return 'danger';
  }
  return 'default';
}
