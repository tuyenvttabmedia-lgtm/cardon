import type { NextConfig } from 'next';
import path from 'path';

const nextConfig: NextConfig = {
  output: 'standalone',
  transpilePackages: ['@cardon/build-info'],
  outputFileTracingRoot: path.join(__dirname, '../..'),
  async redirects() {
    return [
      { source: '/balance', destination: '/wallet', permanent: false },
      { source: '/balance/:path*', destination: '/wallet/:path*', permanent: false },
      { source: '/transactions', destination: '/orders', permanent: false },
      { source: '/api-keys', destination: '/api', permanent: false },
      { source: '/kyc', destination: '/account/kyc', permanent: false },
      { source: '/wallet/transactions', destination: '/wallet/ledger', permanent: false },
      { source: '/wallet/transactions/:path*', destination: '/wallet/ledger', permanent: false },
      { source: '/wallet/deposits', destination: '/finance/deposits', permanent: false },
      { source: '/wallet/deposits/:path*', destination: '/finance/deposits', permanent: false },
      { source: '/wallet/withdraws', destination: '/wallet', permanent: false },
      { source: '/wallet/withdraws/:path*', destination: '/wallet', permanent: false },
      { source: '/finance/withdraws', destination: '/wallet', permanent: false },
      { source: '/finance/withdraws/:path*', destination: '/wallet', permanent: false },
      { source: '/wallet/limits', destination: '/finance/credit', permanent: false },
      { source: '/settlement', destination: '/finance/settlements', permanent: false },
      { source: '/settlement/:path*', destination: '/finance/settlements', permanent: false },
      { source: '/settings', destination: '/account', permanent: false },
      { source: '/settings/:path*', destination: '/account/:path*', permanent: false },
    ];
  },
};

export default nextConfig;
