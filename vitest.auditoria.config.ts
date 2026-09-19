// Config de la auditoría dinámica (NO corre en CI): npx vitest run -c vitest.auditoria.config.ts
import { defineConfig } from 'vitest/config'
import path from 'path'

export default defineConfig({
  resolve: { alias: { '@': path.resolve(__dirname, './src') } },
  test: { include: ['auditoria/**/*.audit.ts'], setupFiles: ['auditoria/setup.ts'], testTimeout: 60_000, fileParallelism: false },
})
