'use client';

import { CustomerProductLogo, type CustomerProductKind } from '@/components/product/CustomerProductLogo';
import { cn } from '@/lib/utils';

const INTERACTION =
  'transition-all duration-200 hover:-translate-y-px hover:shadow-md disabled:cursor-not-allowed disabled:opacity-40 disabled:hover:translate-y-0 disabled:hover:shadow-none';

const SELECTED = 'border-cardon-blue bg-blue-50 scale-[1.01] shadow-sm';
const UNSELECTED = 'border-gray-100 bg-white hover:border-cardon-blue/40';

function SelectedCheckBadge() {
  return (
    <span className="absolute right-1.5 top-1.5 flex h-4 w-4 items-center justify-center rounded-full bg-cardon-blue text-[9px] text-white">
      ✓
    </span>
  );
}

type CatalogSelectCardBase = {
  selected?: boolean;
  disabled?: boolean;
  onClick?: () => void;
  className?: string;
  'aria-label'?: string;
};

export function CatalogSelectCard({
  kind,
  selected = false,
  disabled = false,
  onClick,
  className,
  children,
  ...a11y
}: CatalogSelectCardBase & {
  kind: 'logo' | 'denomination' | 'data';
  children: React.ReactNode;
}) {
  const heightClass =
    kind === 'logo'
      ? 'h-16 md:h-[72px]'
      : kind === 'denomination'
        ? 'h-[72px]'
        : 'min-h-[116px] h-auto';

  return (
    <button
      type="button"
      aria-pressed={selected}
      disabled={disabled}
      onClick={onClick}
      className={cn(
        'relative flex w-full min-w-0 items-center justify-center rounded-xl border-2 px-2',
        heightClass,
        INTERACTION,
        selected
          ? kind === 'denomination'
            ? 'scale-[1.01] border-cardon-blue bg-cardon-blue text-white shadow-sm'
            : SELECTED
          : UNSELECTED,
        className,
      )}
      {...a11y}
    >
      {selected && kind !== 'denomination' && <SelectedCheckBadge />}
      {children}
    </button>
  );
}

export function CatalogLogoCard({
  name,
  slug,
  logoUrl,
  kind = 'card',
  fallbackLabel,
  selected,
  disabled,
  onClick,
  className,
}: CatalogSelectCardBase & {
  name: string;
  slug: string;
  logoUrl?: string | null;
  kind?: CustomerProductKind;
  fallbackLabel?: string;
}) {
  return (
    <CatalogSelectCard
      kind="logo"
      selected={selected}
      disabled={disabled}
      onClick={onClick}
      className={className}
      aria-label={name}
    >
      <CustomerProductLogo
        name={name}
        slug={slug}
        logoUrl={logoUrl}
        kind={kind}
        fallbackLabel={fallbackLabel}
      />
    </CatalogSelectCard>
  );
}

export function CatalogDenomCard({
  faceValueLabel,
  sellPriceLabel,
  selected,
  disabled,
  onClick,
  className,
}: CatalogSelectCardBase & {
  faceValueLabel: string;
  sellPriceLabel: string;
}) {
  return (
    <CatalogSelectCard
      kind="denomination"
      selected={selected}
      disabled={disabled}
      onClick={onClick}
      className={cn('flex-col items-start justify-center px-3 text-left', className)}
    >
      {selected && (
        <span className="absolute right-1.5 top-1.5 flex h-4 w-4 items-center justify-center rounded-full bg-white/20 text-[9px] text-white">
          ✓
        </span>
      )}
      <p className="text-base font-bold leading-tight md:text-lg">{faceValueLabel}</p>
      <p
        className={cn(
          'mt-0.5 text-[11px] leading-tight md:text-xs',
          selected ? 'text-white/85' : 'text-cardon-gray',
        )}
      >
        Giá bán: {sellPriceLabel}
      </p>
    </CatalogSelectCard>
  );
}

export function CatalogDataPackageCard({
  packageName,
  quotaLabel,
  faceValueLabel,
  sellPriceLabel,
  selected,
  disabled,
  onClick,
  className,
}: CatalogSelectCardBase & {
  packageName: string;
  quotaLabel: string;
  faceValueLabel: string;
  sellPriceLabel: string;
}) {
  return (
    <CatalogSelectCard
      kind="data"
      selected={selected}
      disabled={disabled}
      onClick={onClick}
      className={cn('flex-col items-stretch justify-start gap-2.5 px-3 py-3 text-left', className)}
      aria-label={packageName}
    >
      <p className="break-words text-sm font-bold leading-snug text-cardon-navy md:text-base">
        {packageName}
      </p>

      <div className="space-y-2 border-t border-gray-100 pt-2.5">
        <p className="text-xs leading-relaxed text-cardon-gray md:text-sm">{quotaLabel}</p>
        <p className="text-xs leading-relaxed text-cardon-gray">
          Giá trị:{' '}
          <span className="font-medium text-cardon-navy">{faceValueLabel}</span>
        </p>
        <p className="text-xs font-semibold leading-relaxed text-cardon-navy md:text-sm">
          Giá bán: {sellPriceLabel}
        </p>
      </div>
    </CatalogSelectCard>
  );
}
