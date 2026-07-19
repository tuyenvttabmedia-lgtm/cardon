'use client';

import { CatalogLogoCard } from '@/components/catalog/CatalogSelectCard';

/** @deprecated use CatalogLogoCard */
export function ProductSelectorCard({
  name,
  slug,
  logoUrl,
  kind = 'card',
  fallbackLabel,
  selected = false,
  disabled = false,
  onClick,
  className,
}: {
  name: string;
  slug: string;
  logoUrl?: string | null;
  kind?: 'card' | 'topup' | 'data';
  fallbackLabel?: string;
  selected?: boolean;
  disabled?: boolean;
  onClick?: () => void;
  className?: string;
}) {
  return (
    <CatalogLogoCard
      name={name}
      slug={slug}
      logoUrl={logoUrl}
      kind={kind}
      fallbackLabel={fallbackLabel}
      selected={selected}
      disabled={disabled}
      onClick={onClick}
      className={className}
    />
  );
}
