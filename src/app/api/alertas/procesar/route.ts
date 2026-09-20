import { NextResponse } from 'next/server'
import { timingSafeEqual } from 'crypto'
import { prisma } from '@/lib/prisma'
import { procesarAlertas } from '@/lib/alertas-servicio'

// Lo llama un proceso periódico (cron de Railway, cada minuto o cada pocos minutos) con
// `Authorization: Bearer <ALERTAS_CRON_SECRET>`. Sin el secreto configurado, el endpoint está apagado.
function autorizado(req: Request): boolean {
  const secreto = process.env.ALERTAS_CRON_SECRET
  if (!secreto || secreto.length < 16) return false
  const dado = (req.headers.get('authorization') ?? '').replace(/^Bearer /, '')
  const a = Buffer.from(dado), b = Buffer.from(secreto)
  return a.length === b.length && timingSafeEqual(a, b)
}

async function manejar(req: Request) {
  if (!process.env.ALERTAS_CRON_SECRET) return NextResponse.json({ error: 'Alertas no habilitadas' }, { status: 503 })
  if (!autorizado(req)) return NextResponse.json({ error: 'No autorizado' }, { status: 401 })
  const r = await procesarAlertas(prisma)
  return NextResponse.json({ generadas: r.generadas, nuevas: r.nuevas })
}
export const POST = manejar
export const GET = manejar
export const dynamic = 'force-dynamic'
