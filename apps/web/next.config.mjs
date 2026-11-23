import { loadWebEnvironment } from '@fomeora/env';

// Validate server-only configuration at build/startup. No value is copied into
// Next.js `env`, so API and deployment configuration cannot enter the browser bundle.
loadWebEnvironment();

/** @type {import('next').NextConfig} */
const nextConfig = {
  reactStrictMode: true,
  // The pool terminal moved from /trade to /pools; keep old links working.
  async redirects() {
    return [{ source: '/trade', destination: '/pools', permanent: true }];
  },
  transpilePackages: ['@fomeora/types', '@fomeora/sdk'],
  images: {
    remotePatterns: [
      {
        protocol: 'https',
        hostname: 'pbs.twimg.com',
      },
    ],
  },
};

export default nextConfig;
