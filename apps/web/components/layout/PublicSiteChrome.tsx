'use client';

import { Footer } from '@/components/layout/Footer';
import { BuildVersionComment } from '@/components/layout/BuildVersionComment';
import { Header } from '@/components/layout/Header';
import { MobileBottomNav } from '@/components/layout/MobileBottomNav';

export function PublicSiteChrome({ children }: { children: React.ReactNode }) {
  return (
    <div className="flex min-h-screen flex-col overflow-x-hidden">
      <Header />
      <main className="page-footer-gap w-full overflow-x-hidden md:pb-0">{children}</main>
      <Footer />
      <BuildVersionComment />
      <MobileBottomNav />
    </div>
  );
}
