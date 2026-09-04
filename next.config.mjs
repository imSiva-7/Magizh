/** @type {import('next').NextConfig} */
const nextConfig = {
  reactStrictMode: false,
  
  // Intercept ZKTeco hardware requests and route them to your API folder
  async rewrites() {
    return [
      {
        source: '/iclock/:path*',
        destination: '/api/attendance/iclock/:path*',
      },
    ];
  },

  // Memory optimization for development
  experimental: {
    workerThreads: false,
    cpus: 1,
  },
};

// Use export default for .mjs, or module.exports = nextConfig; for .js
export default nextConfig;
