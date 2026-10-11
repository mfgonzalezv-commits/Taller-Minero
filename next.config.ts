import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // El build de producción solo chequea tipos de la app, no de las pruebas/auditorías
  // (esas ya se validan aparte con "npx tsc --noEmit" en el CI). Evita que un error de
  // tipos en un test rompa el build real (pasó 4 veces con auditoria/atomicidad.audit.ts).
  typescript: {
    tsconfigPath: './tsconfig.build.json',
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
