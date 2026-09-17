import { prisma } from './prisma'

// Fase 7 — el sistema tiene dos vías para generar OT preventivas
// (PlanMantenimiento por horómetro/km/fecha, y PautaMantenimiento por
// marca/modelo con ciclos). No se unificaron todavía porque PautaMantenimiento
// ya tiene datos reales de producción (107 pautas cargadas) y migrar sin
// verificar uso real es riesgoso — ver docs/SECURITY_BASELINE.md. Mientras
// tanto, esta función es el único punto de guarda: antes de generar una OT
// preventiva desde CUALQUIERA de los dos sistemas, se verifica que el equipo
// no tenga ya una OT preventiva abierta (evita duplicados entre sistemas).
export async function hayOTPreventivaActiva(equipoId: string): Promise<boolean> {
  const existente = await prisma.ordenTrabajo.findFirst({
    where: {
      equipoId,
      tipoMantenimiento: 'PREVENTIVO',
      estado: { notIn: ['CERRADA', 'ANULADA'] },
    },
    select: { id: true },
  })
  return !!existente
}
