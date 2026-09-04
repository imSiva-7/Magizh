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

  // Webpack configuration with safe undefined check
  webpack: (config, { dev }) => {
    if (dev) {
      // Ensure optimization object exists before spreading it
      config.optimization = {
        ...(config.optimization || {}),
        moduleIds: 'deterministic',
        splitChunks: false,
      };
    }
    return config;
  },
};

// SAFE EXPORT CHECK:
// If your file is next.config.mjs, keep the line below.
// If your file is next.config.js, change it to: module.exports = nextConfig;
export default nextConfig;
