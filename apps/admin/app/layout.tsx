import type { Metadata } from 'next';
import { Inter } from 'next/font/google';
import { AuthProvider } from '@/contexts/AuthContext';
import { AuthGuard } from '@/components/layout/AdminShell';
import { BuildVersionComment } from '@/components/layout/BuildVersionComment';
import { ToastProvider } from '@/components/ui/Toast';
import { resolvePublicUrl } from '@/lib/public-url';
import { getApiBaseUrl } from '@/lib/utils';
import './globals.css';

const inter = Inter({ subsets: ['latin', 'vietnamese'], variable: '--font-geist-sans' });

/** Same CMS favicon as customer web — never use the brand logo mark. */
async function resolveAdminFavicon(): Promise<string> {
  try {
    const res = await fetch(`${getApiBaseUrl()}/cms/theme`, {
      next: { revalidate: 300, tags: ['cms-theme'] },
    });
    if (res.ok) {
      const payload = (await res.json()) as { success?: boolean; data?: { favicon?: string } };
      const path = payload.data?.favicon?.trim();
      if (path) return resolvePublicUrl(path);
    }
  } catch {
    // Fall through to bundled CMS favicon snapshot.
  }
  return '/favicon.png';
}

export async function generateMetadata(): Promise<Metadata> {
  const icon = await resolveAdminFavicon();
  return {
    title: 'CardOn Quản trị',
    description: 'Bảng điều khiển quản trị CardOn.vn',
    icons: {
      icon,
      apple: icon,
    },
  };
}

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="vi">
      <body className={`${inter.variable} font-sans`}>
        <BuildVersionComment />
        <ToastProvider>
          <AuthProvider>
            <AuthGuard>{children}</AuthGuard>
          </AuthProvider>
        </ToastProvider>
      </body>
    </html>
  );
}
