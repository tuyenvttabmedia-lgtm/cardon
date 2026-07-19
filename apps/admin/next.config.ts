import type { NextConfig } from 'next';
import path from 'path';

const nextConfig: NextConfig = {
  output: 'standalone',
  transpilePackages: ['@cardon/build-info'],
  outputFileTracingRoot: path.join(__dirname, '../..'),
  async redirects() {
    return [
      { source: '/settings', destination: '/configuration', permanent: false },
      { source: '/settings/order', destination: '/configuration/orders', permanent: false },
      { source: '/settings/health', destination: '/configuration/health', permanent: false },
      { source: '/settings/:slug', destination: '/configuration/:slug', permanent: false },
      { source: '/audit', destination: '/configuration/audit', permanent: false },
      { source: '/audit/:path*', destination: '/configuration/audit', permanent: false },
      { source: '/finance/agents', destination: '/agents', permanent: false },
      { source: '/finance/agents/:path*', destination: '/agents', permanent: false },
      { source: '/configuration/feature-flags', destination: '/configuration/system', permanent: false },
      { source: '/configuration/feature-flags/:path*', destination: '/configuration/system', permanent: false },
      { source: '/monitoring/partner-api-logs', destination: '/monitoring/api-logs', permanent: false },
      { source: '/monitoring/partner-api-logs/:path*', destination: '/monitoring/api-logs', permanent: false },
      { source: '/finance', destination: '/finance/dashboard', permanent: false },
      { source: '/configuration/advanced', destination: '/configuration/system', permanent: false },
      { source: '/configuration/advanced/:path*', destination: '/configuration/system', permanent: false },
      { source: '/configuration/security', destination: '/configuration/system', permanent: false },
      { source: '/configuration/security/:path*', destination: '/configuration/system', permanent: false },
      { source: '/configuration/integrations', destination: '/configuration', permanent: false },
      { source: '/configuration/integrations/:path*', destination: '/configuration', permanent: false },
      { source: '/agents', destination: '/agents/overview', permanent: false },
    ];
  },
};

export default nextConfig;
