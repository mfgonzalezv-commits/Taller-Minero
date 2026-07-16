import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  typescript: {
    ignoreBuildErrors: true,
  },
  eslint: {
    ignoreDuringBuilds: true,
  },
  experimental: {
    // Cachea páginas dinámicas en el cliente por 30s → navegación instantánea en visitas repetidas
    staleTimes: {
      dynamic: 30,
      static: 300,
    },
  },
};

export default nextConfig;
