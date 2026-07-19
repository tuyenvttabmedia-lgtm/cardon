import { cn } from '@/lib/utils';

export function Badge({
  children,
  tone = 'default',
}: {
  children: React.ReactNode;
  tone?: 'default' | 'success' | 'warning' | 'danger';
}) {
  return (
    <span
      className={cn(
        'inline-flex rounded-full px-2.5 py-0.5 text-xs font-medium',
        tone === 'default' && 'bg-gray-100 text-gray-700',
        tone === 'success' && 'bg-green-100 text-green-800',
        tone === 'warning' && 'bg-amber-100 text-amber-800',
        tone === 'danger' && 'bg-red-100 text-red-800',
      )}
    >
      {children}
    </span>
  );
}
