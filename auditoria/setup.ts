// Sesión simulada por rol para invocar las Server Actions reales contra erp_minera_dev.
import 'dotenv/config'
import { vi } from 'vitest'
import { impedirEjecucionEnProduccion } from '../src/lib/db-guard'

impedirEjecucionEnProduccion('auditoria dinámica de procesos')

vi.mock('@/lib/auth', () => ({ auth: async () => (globalThis as { __SESION?: unknown }).__SESION ?? null }))
vi.mock('next/cache', () => ({ revalidatePath: () => {}, revalidateTag: () => {} }))
