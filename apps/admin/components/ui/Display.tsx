import Link from 'next/link';
import { cn } from '@/lib/utils';
import { translateStatus } from '@/lib/i18n';

export function Badge({
  children,
  tone = 'default',
  status,
  className,
}: {
  children?: React.ReactNode;
  tone?: 'default' | 'success' | 'warning' | 'danger' | 'info' | 'neutral' | 'violet';
  /** When set, displays translated status label instead of raw enum */
  status?: string;
  className?: string;
}) {
  const tones = {
    default: 'border-slate-200 bg-slate-100 text-slate-700',
    neutral: 'border-slate-200 bg-slate-100 text-slate-700',
    success: 'border-emerald-200 bg-emerald-50 text-emerald-700',
    warning: 'border-amber-200 bg-amber-50 text-amber-700',
    danger: 'border-red-200 bg-red-50 text-red-700',
    info: 'border-blue-200 bg-blue-50 text-blue-700',
    violet: 'border-violet-200 bg-violet-50 text-violet-700',
  };
  const label = status ? undefined : children;
  return (
    <span
      className={cn(
        'inline-flex items-center rounded-full border px-2.5 py-1 text-xs font-semibold leading-none',
        tones[tone],
        className,
      )}
    >
      {status ? <StatusLabel value={status} /> : label}
    </span>
  );
}

export function StatusLabel({ value }: { value: string }) {
  return <>{translateStatus(value)}</>;
}

export function statusTone(status: string): 'default' | 'success' | 'warning' | 'danger' | 'info' {
  if (['PAID', 'ACTIVE', 'APPROVED', 'SUCCESS', 'COMPLETED', 'ISSUED'].includes(status)) {
    return 'success';
  }
  if (['PENDING', 'WAITING_PAYMENT', 'PROCESSING', 'PENDING_KYC', 'SUBMITTED', 'DRAFT'].includes(status)) {
    return 'warning';
  }
  if (['FAILED', 'REJECTED', 'SUSPENDED', 'EXPIRED', 'VOID'].includes(status)) {
    return 'danger';
  }
  return 'default';
}

export function Card({
  children,
  className,
  id,
  interactive = false,
}: {
  children: React.ReactNode;
  className?: string;
  id?: string;
  interactive?: boolean;
}) {
  return (
    <div
      id={id}
      className={cn(
        'rounded-xl border border-slate-200/80 bg-white p-6 shadow-panel',
        interactive &&
          'transition-all duration-200 hover:-translate-y-0.5 hover:border-admin-200 hover:shadow-panel-hover',
        className,
      )}
    >
      {children}
    </div>
  );
}

const STAT_TONES = {
  default: 'text-slate-950',
  success: 'text-emerald-700',
  warning: 'text-amber-700',
  danger: 'text-red-700',
  accent: 'text-admin-700',
} as const;

export function StatCard({
  label,
  value,
  hint,
  tone = 'default',
  href,
  className,
}: {
  label: React.ReactNode;
  value: React.ReactNode;
  hint?: React.ReactNode;
  tone?: keyof typeof STAT_TONES;
  href?: string;
  className?: string;
}) {
  const body = (
    <Card interactive className={cn('group relative h-full overflow-hidden', className)}>
      <span className="absolute inset-y-4 left-0 w-0.5 rounded-r bg-admin-400 opacity-0 transition-opacity group-hover:opacity-100" />
      <p className="text-sm font-medium text-slate-500">{label}</p>
      <p className={cn('mt-2 text-2xl font-bold tracking-tight', STAT_TONES[tone])}>{value}</p>
      {hint && <p className="mt-1 text-xs text-slate-400">{hint}</p>}
    </Card>
  );

  if (!href) return body;
  return (
    <Link href={href} className="block h-full">
      {body}
    </Link>
  );
}

export function LoadingState({ message = 'Đang tải...' }: { message?: string }) {
  return (
    <div
      role="status"
      aria-live="polite"
      className="flex items-center justify-center gap-3 rounded-xl border border-slate-200 bg-white px-6 py-16"
    >
      <span
        aria-hidden
        className="h-4 w-4 animate-spin rounded-full border-2 border-slate-200 border-t-admin-500"
      />
      <p className="text-sm text-slate-500">{message}</p>
    </div>
  );
}

export function EmptyState({
  message = 'Không có dữ liệu',
  action,
}: {
  message?: string;
  action?: React.ReactNode;
}) {
  return (
    <div className="rounded-xl border border-dashed border-slate-200 bg-slate-50 px-6 py-12 text-center">
      <p className="text-sm text-slate-500">{message}</p>
      {action && <div className="mt-3 flex justify-center">{action}</div>}
    </div>
  );
}

export function ForbiddenMessage() {
  return (
    <Card className="border-amber-200 bg-amber-50">
      <p className="font-medium text-amber-900">Không có quyền truy cập</p>
      <p className="mt-1 text-sm text-amber-800">
        Bạn không có quyền cần thiết. Liên hệ quản trị viên nếu cần quyền.
      </p>
    </Card>
  );
}

export function ErrorMessage({ message }: { message: string }) {
  if (message.includes('403') || message.toLowerCase().includes('forbidden')) {
    return <ForbiddenMessage />;
  }
  return (
    <p className="rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm font-medium text-red-700 shadow-sm">
      {message}
    </p>
  );
}
