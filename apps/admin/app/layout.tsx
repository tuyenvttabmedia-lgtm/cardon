import type { Metadata } from 'next';
import { Inter } from 'next/font/google';
import { AuthProvider } from '@/contexts/AuthContext';
import { AuthGuard } from '@/components/layout/AdminShell';
import { BuildVersionComment } from '@/components/layout/BuildVersionComment';
import { ToastProvider } from '@/components/ui/Toast';
import './globals.css';

const inter = Inter({ subsets: ['latin', 'vietnamese'], variable: '--font-geist-sans' });

export const metadata: Metadata = {
  title: 'CardOn Quản trị',
  description: 'Bảng điều khiển quản trị CardOn.vn',
  icons: {
    icon: '/images/cardon-icon.png',
    apple: '/images/cardon-icon.png',
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
