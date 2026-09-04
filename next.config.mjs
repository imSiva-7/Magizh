
// const nextConfig = {
//   reactStrictMode: false,
  
//   // Memory optimization for development
//   experimental: {
//     // Reduce memory usage during development
//     workerThreads: false,
//     cpus: 1,
//   },

//   // Webpack configuration to reduce memory usage
//   webpack: (config, { dev, isServer }) => {
//     if (dev) {
//       // Reduce memory footprint in development
//       config.optimization = {
//         ...config.optimization,
//         moduleIds: 'deterministic',
//         splitChunks: false,
//       };
      
//       // Disable source maps in development if memory is an issue
//       // Uncomment the line below if you continue to have memory issues
//       // config.devtool = false;
//     }
    
//     return config;
//   },
  
//   // ... rest of config
// };

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
    // Reduce memory usage during development
    workerThreads: false,
    cpus: 1,
  },

  // Webpack configuration to reduce memory usage
  webpack: (config, { dev, isServer }) => {
    if (dev) {
      // Reduce memory footprint in development
      config.optimization = {
        ...config.optimization,
        moduleIds: 'deterministic',
        splitChunks: false,
      };
      
      // Disable source maps in development if memory is an issue
      // Uncomment the line below if you continue to have memory issues
      // config.devtool = false;
    }
    
    return config;
  },
};

export default nextConfig;
