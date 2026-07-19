import type { Metadata } from 'next';
import { Inter } from 'next/font/google';
import { PublicSiteChrome } from '@/components/layout/PublicSiteChrome';
import { CmsSeoScripts } from '@/components/seo/CmsSeoScripts';
import { AuthProvider } from '@/contexts/AuthContext';
import { getGlobalSeoSettings, getThemeSettings } from '@/lib/cms-api';
import { buildGlobalMetadata } from '@/lib/seo';
import './globals.css';

const inter = Inter({ subsets: ['latin', 'vietnamese'], variable: '--font-geist-sans' });

export async function generateMetadata(): Promise<Metadata> {
  const [theme, seo] = await Promise.all([getThemeSettings(), getGlobalSeoSettings()]);
  const icon = theme?.favicon || '/images/cardon-icon.png';
  return {
    ...buildGlobalMetadata(seo),
    icons: {
      icon,
      apple: icon,
    },
  };
}

export default async function RootLayout({ children }: { children: React.ReactNode }) {
  const seo = await getGlobalSeoSettings();

  return (
    <html lang="vi">
      <body className={`${inter.variable} font-sans`}>
        <CmsSeoScripts
          googleAnalyticsId={seo?.googleAnalyticsId}
          googleTagManagerId={seo?.googleTagManagerId}
        />
        <AuthProvider>
          <PublicSiteChrome>{children}</PublicSiteChrome>
        </AuthProvider>
      </body>
    </html>
  );
}
