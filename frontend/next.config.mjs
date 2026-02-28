/** @type {import('next').NextConfig} */
const nextConfig = {
  turbopack: {
    root: process.cwd(),
  },
  eslint: {
    ignoreDuringBuilds: true,
  },
};

export default nextConfig;
