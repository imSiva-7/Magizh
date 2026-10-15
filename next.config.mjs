/** @type {import('next').NextConfig} */
const nextConfig = {
  reactStrictMode: false,
  
  // Keep legacy device URLs pointed at the actual hardware route.
  async rewrites() {
    return [
      {
        source: '/api/attendance/iclock/cdata',
        destination: '/iclock/cdata',
      },
      {
        source: '/iclock/cdata.aspx',
        destination: '/iclock/cdata',
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
