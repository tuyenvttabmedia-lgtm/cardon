import type { Metadata } from 'next';
import { headers } from 'next/headers';
import { LocaleProvider } from '@/components/i18n/LocaleProvider';
import { PublicSiteChrome } from '@/components/layout/PublicSiteChrome';
import { CmsSeoScripts } from '@/components/seo/CmsSeoScripts';
import { SiteJsonLd } from '@/components/seo/SiteJsonLd';
import { AuthProvider } from '@/contexts/AuthContext';
import { getGlobalSeoSettings, getThemeSettings } from '@/lib/cms-api';
import { buildGlobalMetadata } from '@/lib/seo';
import { getSiteUrl } from '@/lib/utils';
import type { Locale } from '@/lib/i18n/locale';
import './globals.css';

export async function generateMetadata(): Promise<Metadata> {
  const [theme, seo] = await Promise.all([getThemeSettings(), getGlobalSeoSettings()]);
  const headerList = await headers();
  const locale: Locale = headerList.get('x-cardon-locale') === 'en' ? 'en' : 'vi';
  const icon = theme?.favicon || '/images/cardon-icon.png';
  const global = buildGlobalMetadata(seo, locale);
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
  const headerList = await headers();
  const locale: Locale = headerList.get('x-cardon-locale') === 'en' ? 'en' : 'vi';

  return (
    <html lang={locale}>
      <body className="font-sans">
        <CmsSeoScripts
          googleAnalyticsId={seo?.googleAnalyticsId}
          googleTagManagerId={seo?.googleTagManagerId}
        />
        <SiteJsonLd seo={seo} logoUrl={theme?.logoDesktop || theme?.logoMobile} />
        <AuthProvider>
          <LocaleProvider initialLocale={locale}>
            <PublicSiteChrome>{children}</PublicSiteChrome>
          </LocaleProvider>
        </AuthProvider>
      </body>
    </html>
  );
}
