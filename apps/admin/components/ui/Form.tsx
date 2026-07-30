import { cn } from '@/lib/utils';

export function Button({
  className,
  variant = 'primary',
  size = 'md',
  ...props
}: React.ButtonHTMLAttributes<HTMLButtonElement> & {
  variant?: 'primary' | 'secondary' | 'ghost' | 'danger';
  size?: 'sm' | 'md' | 'lg';
}) {
  const variants = {
    primary:
      'border border-admin-600 bg-admin-600 text-white shadow-sm hover:-translate-y-px hover:border-admin-700 hover:bg-admin-700 hover:shadow-md active:translate-y-0 active:shadow-sm',
    secondary:
      'border border-slate-300 bg-white text-slate-700 shadow-sm hover:-translate-y-px hover:border-admin-200 hover:bg-admin-50 hover:text-admin-700 active:translate-y-0',
    ghost: 'border border-transparent text-slate-600 hover:bg-slate-100 hover:text-slate-950 active:bg-slate-200',
    danger:
      'border border-red-600 bg-red-600 text-white shadow-sm hover:-translate-y-px hover:bg-red-700 hover:shadow-md active:translate-y-0',
  };
  const sizes = {
    sm: 'min-h-8 px-3 py-1.5 text-sm',
    md: 'min-h-10 px-4 py-2 text-sm',
    lg: 'min-h-12 px-6 py-3 text-base',
  };
  return (
    <button
      className={cn(
        'inline-flex items-center justify-center gap-2 rounded-lg font-semibold transition-all duration-150 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-admin-500/40 focus-visible:ring-offset-2 disabled:pointer-events-none disabled:translate-y-0 disabled:cursor-not-allowed disabled:opacity-50',
        variants[variant],
        sizes[size],
        className,
      )}
      {...props}
    />
  );
}

export function Input({
  className,
  ...props
}: React.InputHTMLAttributes<HTMLInputElement>) {
  return (
    <input
      className={cn(
        'w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm text-slate-900 shadow-sm transition-all duration-150 hover:border-slate-400 focus-visible:border-admin-500 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-admin-500/20 focus-visible:ring-offset-0 disabled:cursor-not-allowed disabled:bg-slate-100 disabled:text-slate-500',
        className,
      )}
      {...props}
    />
  );
}

export function Label({
  className,
  ...props
}: React.LabelHTMLAttributes<HTMLLabelElement>) {
  return <label className={cn('block text-sm font-semibold text-slate-700', className)} {...props} />;
}

export function Select({
  className,
  ...props
}: React.SelectHTMLAttributes<HTMLSelectElement>) {
  return (
    <select
      className={cn(
        'w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm text-slate-900 shadow-sm transition-all duration-150 hover:border-slate-400 focus-visible:border-admin-500 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-admin-500/20 focus-visible:ring-offset-0 disabled:cursor-not-allowed disabled:bg-slate-100',
        className,
      )}
      {...props}
    />
  );
}

export function Textarea({
  className,
  ...props
}: React.TextareaHTMLAttributes<HTMLTextAreaElement>) {
  return (
    <textarea
      className={cn(
        'w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm text-slate-900 shadow-sm transition-all duration-150 hover:border-slate-400 focus-visible:border-admin-500 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-admin-500/20 focus-visible:ring-offset-0 disabled:cursor-not-allowed disabled:bg-slate-100',
        className,
      )}
      {...props}
    />
  );
}
