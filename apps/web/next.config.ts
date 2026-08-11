import type { NextConfig } from 'next';
import path from 'path';
import { ACCOUNT_PATHS, REMOVED_CUSTOMER_PORTAL_REDIRECTS } from './lib/account-routes';

const nextConfig: NextConfig = {
  output: 'standalone',
  transpilePackages: ['@cardon/build-info'],
  outputFileTracingRoot: path.join(__dirname, '../..'),
  images: {
    remotePatterns: [
      { protocol: 'https', hostname: 'qr.sepay.vn' },
      { protocol: 'https', hostname: '**.sepay.vn' },
    ],
  },
  async redirects() {
    return [
      { source: '/partner/register', destination: '/dang-ky-dai-ly', permanent: false },
      { source: '/account', destination: ACCOUNT_PATHS.profile, permanent: true },
      { source: '/account/orders', destination: ACCOUNT_PATHS.orders, permanent: true },
      { source: '/account/cards', destination: ACCOUNT_PATHS.cards, permanent: true },
      { source: '/account/topups', destination: ACCOUNT_PATHS.topups, permanent: true },
      { source: '/account/data', destination: ACCOUNT_PATHS.data, permanent: true },
      { source: '/account/support', destination: ACCOUNT_PATHS.support, permanent: true },
      { source: '/account/password', destination: ACCOUNT_PATHS.password, permanent: true },
      { source: '/tai-khoan/don-hang', destination: ACCOUNT_PATHS.orders, permanent: true },
      { source: '/tai-khoan/kho-pin', destination: ACCOUNT_PATHS.cards, permanent: true },
      { source: '/tai-khoan/bao-mat', destination: ACCOUNT_PATHS.password, permanent: true },
      { source: '/tai-khoan/thong-bao', destination: '/', permanent: true },
      ...Object.entries(REMOVED_CUSTOMER_PORTAL_REDIRECTS).map(([source, destination]) => ({
        source,
        destination,
        permanent: true,
      })),
      { source: '/huong-dan', destination: '/tin-tuc/huong-dan', permanent: true },
      { source: '/khuyen-mai', destination: '/tin-tuc/khuyen-mai', permanent: true },
    ];
  },
};

export default nextConfig;
