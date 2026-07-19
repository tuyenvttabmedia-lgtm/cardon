import type { ReactNode } from 'react';
import { cn } from '@/lib/utils';

/** Responsive grid for DATA package selectors only. Mobile: 2 | Tablet: 3 | Desktop: 4 */
export function CatalogDataPackageGrid({
  children,
  className,
}: {
  children: ReactNode;
  className?: string;
}) {
  return (
    <div
      className={cn(
        'grid grid-cols-2 gap-2.5 md:grid-cols-3 md:gap-3 lg:grid-cols-4',
        className,
      )}
    >
      {children}
    </div>
  );
}
