import type { Metadata } from 'next';
import { Inter } from 'next/font/google';
import './globals.css';

const inter = Inter({ subsets: ['latin', 'vietnamese'], variable: '--font-geist-sans' });

export const metadata: Metadata = {
  title: 'CardOn Agent Platform',
  description: 'Enterprise agent platform — wallet, orders, API, settlement, and reports',
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="vi">
      <body className={`${inter.variable} font-sans`}>{children}</body>
    </html>
  );
}
