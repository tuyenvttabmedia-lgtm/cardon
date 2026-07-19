import type { ReactNode } from 'react';
import { HeroBanner, type HeroBannerVariant } from '@/components/home/HeroBanner';
import { cn } from '@/lib/utils';

export function ServiceCheckoutPageLayout({
  heroVariant,
  children,
  className,
}: {
  heroVariant: HeroBannerVariant;
  children: ReactNode;
  className?: string;
}) {
  return (
    <div className={cn(className)}>
      <div className="site-container space-y-6 py-6 md:py-8">
        <HeroBanner variant={heroVariant} />
        {children}
      </div>
    </div>
  );
}
