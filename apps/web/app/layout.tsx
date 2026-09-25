import type { Metadata } from 'next';
import { Inter } from 'next/font/google';
import { PublicSiteChrome } from '@/components/layout/PublicSiteChrome';
import { CmsSeoScripts } from '@/components/seo/CmsSeoScripts';
import { SiteJsonLd } from '@/components/seo/SiteJsonLd';
import { AuthProvider } from '@/contexts/AuthContext';
import { getGlobalSeoSettings, getThemeSettings } from '@/lib/cms-api';
import { buildGlobalMetadata } from '@/lib/seo';
import { getSiteUrl } from '@/lib/utils';
import './globals.css';

const inter = Inter({ subsets: ['latin', 'vietnamese'], variable: '--font-geist-sans' });

export async function generateMetadata(): Promise<Metadata> {
  const [theme, seo] = await Promise.all([getThemeSettings(), getGlobalSeoSettings()]);
  const icon = theme?.favicon || '/images/cardon-icon.png';
  const global = buildGlobalMetadata(seo);
  return {
    metadataBase: global.metadataBase ?? new URL(`${getSiteUrl()}/`),
    ...global,
    icons: {
      icon,
      apple: icon,
    },
  };
}

export default async function RootLayout({ children }: { children: React.ReactNode }) {
  const [seo, theme] = await Promise.all([getGlobalSeoSettings(), getThemeSettings()]);

  return (
    <html lang="vi">
      <body className={`${inter.variable} font-sans`}>
        <CmsSeoScripts
          googleAnalyticsId={seo?.googleAnalyticsId}
          googleTagManagerId={seo?.googleTagManagerId}
        />
        <SiteJsonLd seo={seo} logoUrl={theme?.logoDesktop || theme?.logoMobile} />
        <AuthProvider>
          <PublicSiteChrome>{children}</PublicSiteChrome>
        </AuthProvider>
      </body>
    </html>
  );
}
