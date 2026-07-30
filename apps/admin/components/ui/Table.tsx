import { cn } from '@/lib/utils';

export function Table({
  children,
  className,
  wrapperClassName,
}: {
  children: React.ReactNode;
  className?: string;
  wrapperClassName?: string;
}) {
  return (
    <div className={cn('-mx-1 overflow-x-auto px-1', wrapperClassName)}>
      <table className={cn('w-full text-sm', className)}>{children}</table>
    </div>
  );
}

export function THead({
  children,
  className,
}: {
  children: React.ReactNode;
  className?: string;
}) {
  return <thead className={cn(className)}>{children}</thead>;
}

export function TBody({
  children,
  className,
}: {
  children: React.ReactNode;
  className?: string;
}) {
  return <tbody className={cn(className)}>{children}</tbody>;
}

export function TR({
  children,
  className,
  onClick,
}: {
  children: React.ReactNode;
  className?: string;
  onClick?: () => void;
}) {
  return (
    <tr className={cn(onClick && 'cursor-pointer', className)} onClick={onClick}>
      {children}
    </tr>
  );
}

export function TH({
  children,
  className,
  align = 'left',
  scope = 'col',
  colSpan,
}: {
  children?: React.ReactNode;
  className?: string;
  align?: 'left' | 'right' | 'center';
  scope?: 'col' | 'row';
  colSpan?: number;
}) {
  return (
    <th
      scope={scope}
      colSpan={colSpan}
      className={cn(
        align === 'right' && 'text-right',
        align === 'center' && 'text-center',
        className,
      )}
    >
      {children}
    </th>
  );
}

export function TD({
  children,
  className,
  align = 'left',
  colSpan,
}: {
  children?: React.ReactNode;
  className?: string;
  align?: 'left' | 'right' | 'center';
  colSpan?: number;
}) {
  return (
    <td
      colSpan={colSpan}
      className={cn(
        align === 'right' && 'text-right',
        align === 'center' && 'text-center',
        className,
      )}
    >
      {children}
    </td>
  );
}

export function TableEmpty({
  colSpan,
  message = 'Không có dữ liệu',
}: {
  colSpan: number;
  message?: string;
}) {
  return (
    <tr>
      <td colSpan={colSpan} className="px-4 py-10 text-center text-sm text-slate-500">
        {message}
      </td>
    </tr>
  );
}

export function TableSkeleton({
  colSpan,
  rows = 5,
}: {
  colSpan: number;
  rows?: number;
}) {
  return (
    <>
      {Array.from({ length: rows }).map((_, rowIndex) => (
        <tr key={rowIndex} aria-hidden>
          <td colSpan={colSpan} className="px-4 py-3">
            <span className="block h-4 w-full animate-pulse rounded bg-slate-100" />
          </td>
        </tr>
      ))}
    </>
  );
}
