import type { ReactNode } from 'react';
import { cn } from '@/lib/utils';

/**
 * Single responsive grid for card/topup denomination selectors.
 * Mobile: 3 cols | Tablet (md): 4 cols | Desktop (lg): 5 cols
 */
export function CatalogSelectorGrid({
  children,
  className,
}: {
  children: ReactNode;
  className?: string;
}) {
  return (
    <div
      className={cn(
        'grid grid-cols-3 gap-2 md:grid-cols-4 lg:grid-cols-5 lg:gap-3',
        className,
      )}
    >
      {children}
    </div>
  );
}
