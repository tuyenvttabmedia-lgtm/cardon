'use client';

import { usePathname } from 'next/navigation';
import { Footer } from '@/components/layout/Footer';
import { BuildVersionComment } from '@/components/layout/BuildVersionComment';
import { ContactSpeedDial } from '@/components/layout/ContactSpeedDial';
import { Header } from '@/components/layout/Header';
import { MobileBottomNav } from '@/components/layout/MobileBottomNav';
import { cn } from '@/lib/utils';

export function PublicSiteChrome({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();
  const esimDetail = /^\/esim\/esim-/.test(pathname);

  return (
    <div
      className={cn(
        // Do not put overflow-x-hidden on this wrapper — it breaks header `position: sticky`
        // (desktop nav disappears while scrolling product/checkout pages).
        'flex min-h-screen flex-col',
        esimDetail && 'max-md:pb-[calc(9rem+env(safe-area-inset-bottom))]',
      )}
    >
      <Header />
      <main className="page-footer-gap w-full overflow-x-hidden md:pb-0">{children}</main>
      <Footer />
      <BuildVersionComment />
      <MobileBottomNav />
      <ContactSpeedDial />
    </div>
  );
}
