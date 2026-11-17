import type { Metadata } from 'next';
import { Inter } from 'next/font/google';
import { AuthProvider } from '@/contexts/AuthContext';
import { AuthGuard } from '@/components/layout/AdminShell';
import { BuildVersionComment } from '@/components/layout/BuildVersionComment';
import { ToastProvider } from '@/components/ui/Toast';
import './globals.css';

const inter = Inter({ subsets: ['latin', 'vietnamese'], variable: '--font-geist-sans' });

/**
 * Same-origin only. Do not point icons at cardon.vn/uploads — API serves uploads with
 * Cross-Origin-Resource-Policy: same-origin, so admin.cardon.vn cannot load them as favicons.
 * Bundled public/favicon.png is the CMS favicon snapshot (not the brand logo mark).
 */
const ADMIN_FAVICON = '/favicon.png';

export const metadata: Metadata = {
  title: 'CardOn Quản trị',
  description: 'Bảng điều khiển quản trị CardOn.vn',
  icons: {
    icon: [{ url: ADMIN_FAVICON, type: 'image/png' }],
    shortcut: ADMIN_FAVICON,
    apple: ADMIN_FAVICON,
  },
};

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
