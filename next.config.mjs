/** @type {import('next').NextConfig} */
const nextConfig = {
  // Enable MongoDB support in Server Components
  experimental: {
    serverComponentsExternalPackages: ['mongodb']
  },
  
  // Optional: Enable if you're using other experimental features
  // serverActions: true,
  
  // Optional: Configure images if needed
  images: {
    domains: [],
  },
}

export default nextConfig