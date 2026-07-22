import { cn } from '@/lib/utils';
import { translateStatus } from '@/lib/i18n';

export function Badge({
  children,
  tone = 'default',
  status,
}: {
  children?: React.ReactNode;
  tone?: 'default' | 'success' | 'warning' | 'danger' | 'info';
  /** When set, displays translated status label instead of raw enum */
  status?: string;
}) {
  const tones = {
    default: 'bg-zinc-100 text-zinc-700',
    success: 'bg-emerald-100 text-emerald-800',
    warning: 'bg-amber-100 text-amber-800',
    danger: 'bg-red-100 text-red-800',
    info: 'bg-blue-100 text-blue-800',
  };
  const label = status ? undefined : children;
  return (
    <span className={cn('inline-flex rounded-full px-2.5 py-0.5 text-xs font-semibold', tones[tone])}>
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
}: {
  children: React.ReactNode;
  className?: string;
  id?: string;
}) {
  return (
    <div id={id} className={cn('rounded-2xl border border-zinc-200 bg-white p-6 shadow-sm', className)}>
      {children}
    </div>
  );
}

export function StatCard({ label, value, hint }: { label: string; value: string; hint?: string }) {
  return (
    <Card>
      <p className="text-sm text-zinc-500">{label}</p>
      <p className="mt-2 text-2xl font-bold">{value}</p>
      {hint && <p className="mt-1 text-xs text-zinc-400">{hint}</p>}
    </Card>
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
  return <p className="rounded-lg bg-red-50 p-3 text-sm text-red-700">{message}</p>;
}
