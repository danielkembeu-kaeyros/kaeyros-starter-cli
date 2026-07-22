import type { NextConfig } from 'next';

const nextConfig: NextConfig = {
  reactStrictMode: true,
  eslint: {
    dirs: ['app', 'components', 'lib', 'hooks', 'stores', 'services'],
  },
};

export default nextConfig;
