import Link from 'next/link';
import { cn } from '@/lib/utils';

export type SectionNavItem = {
  href: string;
  label: string;
  active: boolean;
};

export function SectionNav({
  items,
  ariaLabel = 'Điều hướng khu vực',
  className,
}: {
  items: SectionNavItem[];
  ariaLabel?: string;
  className?: string;
}) {
  return (
    <nav aria-label={ariaLabel} className={cn('admin-section-nav', className)}>
      {items.map((item) => (
        <Link
          key={item.href}
          href={item.href}
          aria-current={item.active ? 'page' : undefined}
          className={cn(
            'admin-section-nav-item',
            item.active && 'admin-section-nav-item-active',
          )}
        >
          {item.label}
        </Link>
      ))}
    </nav>
  );
}

export function TabStrip<Item extends string>({
  items,
  active,
  onSelect,
  ariaLabel = 'Các tab',
  className,
}: {
  items: Array<{ id: Item; label: string }>;
  active: Item;
  onSelect: (id: Item) => void;
  ariaLabel?: string;
  className?: string;
}) {
  return (
    <div
      role="tablist"
      aria-label={ariaLabel}
      className={cn('admin-section-nav', className)}
    >
      {items.map((item) => {
        const selected = active === item.id;
        return (
          <button
            key={item.id}
            type="button"
            role="tab"
            aria-selected={selected}
            onClick={() => onSelect(item.id)}
            className={cn(
              'admin-section-nav-item',
              selected && 'admin-section-nav-item-active',
            )}
          >
            {item.label}
          </button>
        );
      })}
    </div>
  );
}
