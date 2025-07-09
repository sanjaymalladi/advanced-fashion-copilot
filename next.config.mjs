/** @type {import('next').NextConfig} */
import path from 'path';

// Workaround to get __dirname in ES module context
const __dirname = path.dirname(new URL(import.meta.url).pathname);

const nextConfig = {
  eslint: {
    ignoreDuringBuilds: true,
  },
  typescript: {
    ignoreBuildErrors: true,
  },
  images: {
    unoptimized: true,
  },
  webpack(config) {
    config.resolve = config.resolve || {};
    config.resolve.alias = config.resolve.alias || {};
    config.resolve.alias['@/services'] = path.resolve(__dirname, 'services');
    return config;
  },
};

export default nextConfig;
