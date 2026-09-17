import { prisma } from './prisma'

// Adaptador de correo saliente. Sin proveedor real configurado (SendGrid,
// SES, etc. — pendiente de que se elija y se agregue como variable de
// entorno), esto solo deja el correo listo en una bandeja de salida
// (CorreoSaliente, estado PENDIENTE) para copiar/descargar manualmente.
// Nunca envía nada de verdad. Cuando se configure un proveedor real, basta
// con reemplazar el cuerpo de `intentarEnvio` — el resto del sistema no
// necesita cambiar.
export async function encolarCorreo(data: {
  faenaId?: string | null
  tipo: string
  entidadId?: string | null
  destinatarios: string[]
  asunto: string
  cuerpo: string
  adjuntos?: string[]
}) {
  return prisma.correoSaliente.create({
    data: {
      faenaId: data.faenaId ?? null,
      tipo: data.tipo,
      entidadId: data.entidadId ?? null,
      destinatarios: data.destinatarios,
      asunto: data.asunto,
      cuerpo: data.cuerpo,
      adjuntos: data.adjuntos ?? [],
    },
  })
}

// No hay proveedor real configurado todavía — queda pendiente y marcado
// como tal en vez de fingir que se envió.
export async function intentarEnvio(correoId: string) {
  const proveedorConfigurado = !!process.env.SMTP_PROVIDER_URL
  if (!proveedorConfigurado) {
    await prisma.correoSaliente.update({
      where: { id: correoId },
      data: { intentos: { increment: 1 } },
    })
    return { ok: false, motivo: 'Sin proveedor de correo configurado (SMTP_PROVIDER_URL)' }
  }
  // TODO: cuando exista un proveedor real, implementar el envío aquí y
  // marcar estado ENVIADO/ERROR según corresponda.
  return { ok: false, motivo: 'Envío real no implementado' }
}
