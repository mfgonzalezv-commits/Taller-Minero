import { AppShell } from '@/components/layout/AppShell'
import { auth } from '@/lib/auth'
import { redirect, notFound } from 'next/navigation'
import { prisma } from '@/lib/prisma'
import { ESTADO_OT_CONFIG, PRIORIDAD_CONFIG, TRANSICIONES_OT } from '@/lib/constants'
import CambiarEstadoOT from './CambiarEstadoOT'
import RepuestosOT from './RepuestosOT'
import ManoObraOT from './ManoObraOT'
import BitacoraOT from './BitacoraOT'
import ChecklistOT from './ChecklistOT'
import ChecklistPM from './ChecklistPM'
import PrintButton from './PrintButton'
import BorrarOT from './BorrarOT'
import TiemposEstadosOT from './TiemposEstadosOT'
import Link from 'next/link'
import { ChevronRight, Clock, Wrench, User, Calendar, DollarSign, AlertCircle, ClipboardCheck, Eye, MessageSquare, CalendarDays, HelpCircle } from 'lucide-react'
import type { OrigenFalla } from '@prisma/client'

const TIPO_LABEL: Record<string, string> = {
  CORRECTIVO: 'Correctivo', PREVENTIVO: 'Preventivo', PREDICTIVO: 'Predictivo',
}

const ORIGEN_LABEL: Record<OrigenFalla, { label: string; icon: React.ReactNode }> = {
  CHECKLIST_INSPECCION:     { label: 'Checklist de inspección',  icon: <ClipboardCheck size={13} /> },
  DETECCION_VISUAL:         { label: 'Visual en operación',      icon: <Eye size={13} /> },
  REPORTE_OPERADOR:         { label: 'Reporte del operador',     icon: <MessageSquare size={13} /> },
  DETECCION_TALLER:         { label: 'Detectado en taller',      icon: <Wrench size={13} /> },
  MANTENIMIENTO_PREVENTIVO: { label: 'Mantención programada',    icon: <CalendarDays size={13} /> },
  OTRO:                     { label: 'Otro',                     icon: <HelpCircle size={13} /> },
}

export default async function OTDetallePage({ params }: { params: Promise<{ id: string }> }) {
  const session = await auth()
  if (!session) redirect('/login')

  const { id } = await params
  const faena = await prisma.faena.findFirst()

  const [itemsBodega, trabajadoresDirectos] = await Promise.all([
    prisma.itemBodega.findMany({
      where: { faenaId: faena?.id, activo: true },
      select: { id: true, codigo: true, descripcion: true, unidad: true, stockActual: true, precioRef: true },
      orderBy: { descripcion: 'asc' },
    }),
    prisma.trabajador.findMany({
      where: { faenaId: faena?.id, activo: true, tipo: 'DIRECTO' },
      orderBy: { nombre: 'asc' },
    }),
  ])

  const ot = await prisma.ordenTrabajo.findFirst({
    where: { id },
    include: {
      equipo: true,
      faena: true,
      responsable: { select: { nombre: true, rol: true } },
      tecnico: { include: { usuario: { select: { nombre: true } } } },
      creadoPor: { select: { nombre: true } },
      historial: {
        include: { usuario: { select: { nombre: true } } },
        orderBy: { fechaCambio: 'asc' },
      },
      bitacora: {
        include: {
          usuario: { select: { nombre: true } },
          repuestos: { orderBy: { createdAt: 'asc' } },
        },
        orderBy: { fechaHora: 'asc' },
      },
      repuestos: { orderBy: { createdAt: 'asc' } },
      manoObra: { orderBy: { createdAt: 'asc' } },
      checklist: {
        orderBy: { orden: 'asc' },
        include: { usuario: { select: { nombre: true } } },
      },
      solicitudesRepuesto: {
        include: {
          items: { include: { itemBodega: { select: { codigo: true, stockActual: true } } } },
          creadoPor: { select: { nombre: true } },
          gestionadoPor: { select: { nombre: true } },
          historial: { include: { usuario: { select: { nombre: true } } }, orderBy: { fechaCambio: 'asc' } },
        },
        orderBy: { createdAt: 'desc' },
      },
    },
  })

  if (!ot) notFound()

  const ec = ESTADO_OT_CONFIG[ot.estado]
  const pc = PRIORIDAD_CONFIG[ot.prioridad]
  const rolUsuario = session.user?.rol
  const ESTADOS_REQUIEREN_AUTORIZACION = ['DIAGNOSTICADO', 'REPARACION_PROGRAMADA', 'LISTO_PARA_REPARAR']
  const transiciones = ESTADOS_REQUIEREN_AUTORIZACION.includes(ot.estado) && rolUsuario === 'MECANICO'
    ? []
    : TRANSICIONES_OT[ot.estado] ?? []

  // Costo detención en tiempo real: acumulado guardado + tiempo en estado actual
  const estaAbierta = ot.estado !== 'CERRADA'
  const ultimoCambioEstado = ot.historial.at(-1)?.fechaCambio ?? ot.fechaCreacion
  const minutosEnEstadoActual = estaAbierta
    ? Math.max(0, Math.round((new Date().getTime() - ultimoCambioEstado.getTime()) / 60000))
    : 0
  const tiempoTotalMin = ot.tiempoDetenidoMin + minutosEnEstadoActual
  const costoDetenccion = (Number(ot.costoHoraSnapshot) * tiempoTotalMin) / 60
  const horasDetencion = (tiempoTotalMin / 60).toFixed(1)

  const totalRepuestos = ot.repuestos
    .filter(r => r.estadoSolicitud === 'ENTREGADO' || r.estadoSolicitud === 'EXTERNO')
    .reduce((acc, r) => acc + Number(r.total), 0)
  const costoManoObra = ot.manoObra.reduce((acc, m) => acc + Number(m.total), 0)
  const costoOverhead = Number(ot.costoOverhead)
  const costoTotal = costoDetenccion + totalRepuestos + costoManoObra + costoOverhead
  const fmt = (n: number) =>
    new Intl.NumberFormat('es-CL', { style: 'currency', currency: 'CLP', maximumFractionDigits: 0 }).format(n)

  // Serialización
  const historialSerial = ot.historial.map(h => ({
    id: h.id, fechaCambio: h.fechaCambio.toISOString(),
    estadoNuevo: h.estadoNuevo, estadoAnterior: h.estadoAnterior,
    observacion: h.observacion, tiempoEnEstadoMin: h.tiempoEnEstadoMin,
    usuario: h.usuario, tipo: 'historial' as const,
  }))
  const bitacoraSerial = ot.bitacora.map(b => ({
    id: b.id, fechaHora: b.fechaHora.toISOString(),
    createdAt: b.createdAt.toISOString(),
    descripcion: b.descripcion,
    horaInicio: b.horaInicio, horaTermino: b.horaTermino,
    personal: b.personal,
    tipoIntervencion: b.tipoIntervencion,
    notaRepuesto: b.notaRepuesto,
    estado: b.estado, setEspera: b.setEspera,
    usuario: b.usuario,
    tipo: 'bitacora' as const,
    repuestos: b.repuestos.map(r => ({
      id: r.id,
      descripcion: r.descripcion,
      cantidad: Number(r.cantidad),
      unidad: r.unidad,
      estadoSolicitud: r.estadoSolicitud as string,
    })),
  }))
  const trabajadoresSerial = trabajadoresDirectos.map(t => ({
    id: t.id, nombre: t.nombre, cargo: t.cargo,
    sueldoBruto: Number(t.sueldoBruto),
    horasMensuales: t.horasMensuales,
    tasaLeyesSociales: Number(t.tasaLeyesSociales),
  }))
  const repuestosSerial = ot.repuestos.map(r => ({
    id: r.id, descripcion: r.descripcion, unidad: r.unidad,
    cantidad: Number(r.cantidad), precioUnit: Number(r.precioUnit), total: Number(r.total),
    estadoSolicitud: r.estadoSolicitud as 'SOLICITADO' | 'AUTORIZADO' | 'EN_COMPRAS' | 'RECHAZADO' | 'ENTREGADO' | 'EXTERNO',
    itemBodegaId: r.itemBodegaId,
  }))
  const manoObraSerial = ot.manoObra.map(m => ({
    id: m.id, nombre: m.nombre, horasNormales: Number(m.horasNormales),
    horasExtra: Number(m.horasExtra), tarifaNormal: Number(m.tarifaNormal),
    tarifaExtra: Number(m.tarifaExtra), total: Number(m.total),
    trabajadorId: m.trabajadorId,
  }))
  const itemsBodegaSerial = itemsBodega.map(i => ({
    id: i.id, codigo: i.codigo, descripcion: i.descripcion,
    unidad: i.unidad, stockActual: Number(i.stockActual), precioRef: Number(i.precioRef),
  }))
  const checklistSerial = ot.checklist.map(c => ({
    id: c.id, descripcion: c.descripcion, codigo: c.codigo,
    cantidad: c.cantidad ? Number(c.cantidad) : null,
    unidad: c.unidad, obligatorio: c.obligatorio, completado: c.completado,
    completadoAt: c.completadoAt?.toISOString() ?? null,
    completadoPor: c.usuario?.nombre ?? null, orden: c.orden,
    resultado: (c as any).resultado ?? null,
    observacion: (c as any).observacion ?? null,
  }))

  const solicitudesSerial = ot.solicitudesRepuesto.map(sr => ({
    id: sr.id,
    numeroSr: sr.numeroSr,
    estado: sr.estado,
    urgente: sr.urgente,
    observacion: sr.observacion,
    fechaEstimadaLlegada: sr.fechaEstimadaLlegada?.toISOString() ?? null,
    creadoPor: sr.creadoPor,
    gestionadoPor: sr.gestionadoPor,
    createdAt: sr.createdAt.toISOString(),
    items: sr.items.map(i => ({
      id: i.id,
      descripcion: i.descripcion,
      cantidad: Number(i.cantidad),
      unidad: i.unidad,
      itemBodegaId: i.itemBodegaId,
      precioEstimado: i.precioEstimado ? Number(i.precioEstimado) : null,
      cantidadEntregada: Number(i.cantidadEntregada),
      itemBodega: i.itemBodega ? { codigo: i.itemBodega.codigo, stockActual: Number(i.itemBodega.stockActual) } : null,
    })),
    historial: sr.historial.map(h => ({
      id: h.id,
      estadoAnterior: h.estadoAnterior,
      estadoNuevo: h.estadoNuevo,
      observacion: h.observacion,
      usuario: h.usuario,
      fechaCambio: h.fechaCambio.toISOString(),
    })),
  }))

  const origenCfg = ot.origenFalla ? ORIGEN_LABEL[ot.origenFalla] : null

  return (
    <AppShell>
      {/* Breadcrumb — solo pantalla */}
      <div className="no-print flex items-center gap-1.5 mb-5 text-xs font-medium" style={{ color: 'var(--n-text-lt)' }}>
        <Link href="/ot" className="hover:text-white transition-colors">OTs</Link>
        <ChevronRight size={13} />
        <span className="text-white">OT #{ot.numeroOt}</span>
      </div>

      {/* ── CABECERA PRINT ── Solo aparece al imprimir */}
      <div className="hidden print:block mb-6">
        <div className="mb-3 pb-3" style={{ borderBottom: '2px solid #000' }}>
          {ot.faena.empresa && (
            <p className="text-base font-black uppercase">{ot.faena.empresa}</p>
          )}
          <p className="text-xs font-bold uppercase tracking-widest" style={{ color: '#555' }}>
            {ot.faena.nombre}{ot.faena.ubicacion ? ` · ${ot.faena.ubicacion}` : ''}
          </p>
        </div>
        <div className="flex items-start justify-between">
          <div>
            <h1 className="text-2xl font-black uppercase">OT #{ot.numeroOt}</h1>
            <p className="text-base font-semibold mt-0.5">{ot.equipo.codigo} — {ot.equipo.nombre}</p>
          </div>
          <div className="text-right text-sm">
            <p><strong>Estado:</strong> {ec.label}</p>
            <p><strong>Prioridad:</strong> {pc.label}</p>
            <p><strong>Tipo:</strong> {TIPO_LABEL[ot.tipoMantenimiento]}</p>
            <p><strong>Creada:</strong> {new Date(ot.fechaCreacion).toLocaleDateString('es-CL')}</p>
            {ot.fechaCierre && <p><strong>Cerrada:</strong> {new Date(ot.fechaCierre).toLocaleDateString('es-CL')}</p>}
          </div>
        </div>
      </div>

      {/* ── SECCIÓN PRINT: Falla + Diagnóstico + Trabajo ── */}
      <div className="hidden print:block mb-5 border rounded p-4 space-y-4">
        <div>
          <p className="text-xs font-bold uppercase tracking-widest mb-1">Falla reportada</p>
          {origenCfg && (
            <p className="text-xs mb-1" style={{ color: '#555' }}>
              Origen: {origenCfg.label}{ot.reportadaPorNombre ? ` · Reportó: ${ot.reportadaPorNombre}` : ''}
            </p>
          )}
          <p className="text-sm">{ot.descripcionFalla}</p>
        </div>
        {ot.diagnostico && (
          <div>
            <p className="text-xs font-bold uppercase tracking-widest mb-1">Diagnóstico</p>
            <p className="text-sm">{ot.diagnostico}</p>
          </div>
        )}
        {ot.trabajoEjecutado && (
          <div>
            <p className="text-xs font-bold uppercase tracking-widest mb-1">Trabajo ejecutado</p>
            <p className="text-sm">{ot.trabajoEjecutado}</p>
          </div>
        )}
        {(() => {
          const nombres = [...new Set(bitacoraSerial.flatMap(b => b.personal))]
          return nombres.length > 0 ? (
            <div>
              <p className="text-xs font-bold uppercase tracking-widest mb-1">Personal que intervino</p>
              <p className="text-sm">{nombres.join(', ')}</p>
            </div>
          ) : null
        })()}
      </div>

      {/* ── SECCIÓN PRINT: Materiales ── */}
      {repuestosSerial.length > 0 && (
        <div className="hidden print:block mb-5 border rounded p-4">
          <p className="text-xs font-bold uppercase tracking-widest mb-3">Materiales y repuestos</p>
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b text-left">
                <th className="pb-1 font-bold">Descripción</th>
                <th className="pb-1 font-bold text-center">Cant.</th>
                <th className="pb-1 font-bold text-right">P. Unit.</th>
                <th className="pb-1 font-bold text-right">Total</th>
              </tr>
            </thead>
            <tbody>
              {repuestosSerial.map(r => (
                <tr key={r.id} className="border-b">
                  <td className="py-1">{r.descripcion}</td>
                  <td className="py-1 text-center">{r.cantidad} {r.unidad}</td>
                  <td className="py-1 text-right">{fmt(r.precioUnit)}</td>
                  <td className="py-1 text-right">{fmt(r.total)}</td>
                </tr>
              ))}
              <tr>
                <td colSpan={3} className="pt-2 font-bold text-right">Subtotal materiales:</td>
                <td className="pt-2 font-bold text-right">{fmt(totalRepuestos)}</td>
              </tr>
            </tbody>
          </table>
        </div>
      )}

      {/* ── SECCIÓN PRINT: Mano de obra ── */}
      {manoObraSerial.length > 0 && (() => {
        const agrupado = Object.values(
          manoObraSerial.reduce((acc, m) => {
            if (!acc[m.nombre]) acc[m.nombre] = { nombre: m.nombre, horasNormales: 0, horasExtra: 0, total: 0 }
            acc[m.nombre].horasNormales += m.horasNormales
            acc[m.nombre].horasExtra   += m.horasExtra
            acc[m.nombre].total        += m.total
            return acc
          }, {} as Record<string, { nombre: string; horasNormales: number; horasExtra: number; total: number }>)
        )
        return (
          <div className="hidden print:block mb-5 border rounded p-4">
            <p className="text-xs font-bold uppercase tracking-widest mb-3">Mano de obra</p>
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b text-left">
                  <th className="pb-1 font-bold">Nombre</th>
                  <th className="pb-1 font-bold text-center">H. normales</th>
                  <th className="pb-1 font-bold text-center">H. extra</th>
                  <th className="pb-1 font-bold text-right">Total</th>
                </tr>
              </thead>
              <tbody>
                {agrupado.map(m => (
                  <tr key={m.nombre} className="border-b">
                    <td className="py-1">{m.nombre}</td>
                    <td className="py-1 text-center">{m.horasNormales.toFixed(1)}</td>
                    <td className="py-1 text-center">{m.horasExtra.toFixed(1)}</td>
                    <td className="py-1 text-right">{fmt(m.total)}</td>
                  </tr>
                ))}
                <tr>
                  <td colSpan={3} className="pt-2 font-bold text-right">Subtotal mano de obra:</td>
                  <td className="pt-2 font-bold text-right">{fmt(costoManoObra)}</td>
                </tr>
              </tbody>
            </table>
          </div>
        )
      })()}

      {/* ── SECCIÓN PRINT: Resumen costos ── */}
      <div className="hidden print:block mb-5 border rounded p-4">
        <p className="text-xs font-bold uppercase tracking-widest mb-3">Resumen de costos</p>
        <table className="w-full text-sm">
          <tbody>
            {[
              { label: `Detención (${horasDetencion} h)`, value: fmt(costoDetenccion) },
              { label: 'Materiales y repuestos', value: fmt(totalRepuestos) },
              { label: 'Mano de obra', value: fmt(costoManoObra) },
              { label: 'Overhead', value: fmt(costoOverhead) },
            ].map(row => (
              <tr key={row.label} className="border-b">
                <td className="py-1">{row.label}</td>
                <td className="py-1 text-right">{row.value}</td>
              </tr>
            ))}
            <tr>
              <td className="pt-2 font-black text-base">TOTAL OT</td>
              <td className="pt-2 font-black text-base text-right">{fmt(costoTotal)}</td>
            </tr>
          </tbody>
        </table>
      </div>

      {/* ── SECCIÓN PRINT: Bitácora (solo modo full — página nueva) ── */}
      {bitacoraSerial.length > 0 && (
        <div className="print-bitacora hidden print:block mb-5 border rounded p-4 print-break-before">
          <p className="text-xs font-bold uppercase tracking-widest mb-3">Bitácora de intervenciones</p>
          <div className="space-y-3">
            {bitacoraSerial.map((b, i) => (
              <div key={b.id} className="print-avoid-break border-b pb-3">
                <div className="flex items-start justify-between mb-1">
                  <div className="flex items-center gap-2">
                    <span className="text-xs font-bold" style={{ color: '#555' }}>#{i + 1}</span>
                    <span className="text-xs font-bold uppercase">
                      {b.tipoIntervencion?.replace(/_/g, ' ') ?? 'Nota'}
                    </span>
                  </div>
                  <span className="text-xs" style={{ color: '#555' }}>
                    {new Date(b.fechaHora).toLocaleString('es-CL', { dateStyle: 'short', timeStyle: 'short' })}
                    {b.horaInicio && b.horaTermino ? ` · ${b.horaInicio}–${b.horaTermino}` : ''}
                  </span>
                </div>
                {b.personal.length > 0 && (
                  <p className="text-xs mb-1" style={{ color: '#555' }}>
                    Personal: {b.personal.join(', ')}
                  </p>
                )}
                <p className="text-sm" style={{ whiteSpace: 'pre-line' }}>{b.descripcion}</p>
                {b.repuestos.length > 0 && (
                  <p className="text-xs mt-1" style={{ color: '#555' }}>
                    Repuestos solicitados: {b.repuestos.map(r => `${r.descripcion} ×${r.cantidad} ${r.unidad}`).join(' / ')}
                  </p>
                )}
              </div>
            ))}
          </div>
        </div>
      )}

      {/* ══════════════════════════════════════════════════════
          LAYOUT PANTALLA (oculto en impresión)
         ══════════════════════════════════════════════════════ */}
      <div className="no-print">

        {/* Título */}
        <div className="mb-6">
          <div className="flex items-start justify-between mb-3">
            <div>
              <h1 className="text-2xl font-black text-white uppercase tracking-tight">OT #{ot.numeroOt}</h1>
              <p className="text-sm mt-0.5 font-semibold" style={{ color: 'var(--n-yellow)' }}>
                {ot.equipo.codigo} — {ot.equipo.nombre}
              </p>
            </div>
            <div className="flex flex-wrap gap-2 items-center">
              <span className={`rounded px-2.5 py-1 text-xs font-bold ${pc.color}`}>{pc.label}</span>
              <span className={`inline-flex items-center gap-1.5 rounded px-2.5 py-1 text-xs font-bold ${ec.color}`}>
                <span className={`h-1.5 w-1.5 rounded-full ${ec.dot}`} />
                {ec.label}
              </span>
              {ot.enEsperaRepuesto && ot.estado !== 'ESPERA_REPUESTO' && (
                <span className="rounded px-2.5 py-1 text-xs font-bold bg-orange-900/60 text-orange-300">
                  ⏳ Espera repuesto
                </span>
              )}
              <PrintButton />
              <BorrarOT otId={ot.id} />
            </div>
          </div>
          {transiciones.length > 0 && (
            <CambiarEstadoOT
              otId={ot.id}
              transiciones={transiciones}
              horizontal
              advertenciaCierre={(() => {
                if (!transiciones.includes('CERRADA')) return undefined
                const problemas: string[] = []
                if (!ot.diagnostico || !ot.trabajoEjecutado) problemas.push('falta diagnóstico o trabajo ejecutado')
                const checkPendientes = ot.checklist.filter(c => c.obligatorio && !c.completado).length
                if (checkPendientes > 0) problemas.push(`${checkPendientes} ítem${checkPendientes > 1 ? 's' : ''} del checklist sin completar`)
                return problemas.length ? problemas.join(' · ') : undefined
              })()}
            />
          )}
        </div>

        {/* Grid principal: bitácora | detalle */}
        <div className="grid gap-4" style={{ gridTemplateColumns: '1fr 2fr' }}>

          {/* Columna izquierda: Bitácora */}
          <div>
            <BitacoraOT
              otId={ot.id}
              estadoActual={ot.estado}
              historial={historialSerial}
              bitacora={bitacoraSerial}
              trabajadores={trabajadoresSerial}
              editable={ot.estado !== 'CERRADA'}
              solicitudes={solicitudesSerial}
              itemsBodega={itemsBodegaSerial}
            />
          </div>

          {/* Columna derecha */}
          <div className="space-y-4">

            {/* Falla + Diagnóstico + Trabajo */}
            <div className="rounded-xl p-6 space-y-4" style={{ backgroundColor: 'var(--n-surface)', border: '1px solid var(--n-border)' }}>

              {/* Falla reportada */}
              <div>
                <div className="flex items-center justify-between mb-1.5">
                  <p className="text-xs font-bold uppercase tracking-widest" style={{ color: 'var(--n-text-lt)' }}>Falla reportada</p>
                  <p className="text-xs" style={{ color: 'var(--n-text-lt)' }}>
                    {new Date(ot.fechaCreacion).toLocaleString('es-CL', { dateStyle: 'short', timeStyle: 'short' })}
                  </p>
                </div>
                {origenCfg ? (
                  <div className="flex items-center gap-2 mb-2 text-xs font-bold rounded-md px-3 py-1.5 w-fit"
                    style={{ backgroundColor: 'var(--n-bg)', border: '1px solid var(--n-border)', color: 'var(--n-text-mid)' }}>
                    {origenCfg.icon}
                    <span>{origenCfg.label}</span>
                    {ot.reportadaPorNombre && <span style={{ color: 'var(--n-text-lt)' }}>· {ot.reportadaPorNombre}</span>}
                  </div>
                ) : (
                  <p className="text-xs italic mb-1" style={{ color: 'var(--n-text-lt)' }}>Origen no registrado</p>
                )}
                <p className="text-sm font-medium text-white">{ot.descripcionFalla}</p>
              </div>

            </div>

            {checklistSerial.length > 0 && (
              (ot as any).pautaId
                ? <ChecklistPM otId={ot.id} items={checklistSerial} cicloPM={(ot as any).cicloPM} editable={ot.estado !== 'CERRADA'} />
                : <ChecklistOT otId={ot.id} items={checklistSerial} editable={ot.estado !== 'CERRADA'} />
            )}
            <TiemposEstadosOT
              historial={historialSerial}
              estadoActual={ot.estado}
              fechaCreacion={ot.fechaCreacion.toISOString()}
            />
            <RepuestosOT otId={ot.id} repuestos={repuestosSerial} editable={ot.estado !== 'CERRADA'} itemsBodega={itemsBodegaSerial} />
            <ManoObraOT otId={ot.id} entradas={manoObraSerial} trabajadores={trabajadoresSerial} editable={ot.estado !== 'CERRADA'} />
          </div>
        </div>

        {/* Panel inferior: costos, detalles, técnico */}
        <div className="grid gap-4 lg:grid-cols-3 mt-4">

          {/* Costos */}
          <div className="rounded-xl p-5" style={{ backgroundColor: 'var(--n-surface)', border: '1px solid var(--n-border)' }}>
            <div className="flex items-center gap-2 mb-4">
              <DollarSign size={15} color="var(--n-yellow)" />
              <p className="text-xs font-bold uppercase tracking-widest" style={{ color: 'var(--n-text-lt)' }}>Costos OT</p>
            </div>
            <div className="space-y-2.5">
              {[
                { label: `Detención (${horasDetencion} h)`, value: fmt(costoDetenccion) },
                { label: 'Repuestos', value: fmt(totalRepuestos) },
                { label: 'Mano de obra directa', value: fmt(costoManoObra) },
                { label: 'Overhead (jefatura/admin)', value: fmt(costoOverhead) },
              ].map(item => (
                <div key={item.label} className="flex justify-between text-sm">
                  <span style={{ color: 'var(--n-text-mid)' }}>{item.label}</span>
                  <span className="font-bold text-white">{item.value}</span>
                </div>
              ))}
              <div className="flex justify-between text-sm pt-2.5" style={{ borderTop: '1px solid var(--n-border)' }}>
                <span className="font-bold text-white">Total</span>
                <span className="font-black text-lg" style={{ color: 'var(--n-red)' }}>{fmt(costoTotal)}</span>
              </div>
            </div>
          </div>

          {/* Detalles */}
          <div className="rounded-xl p-5 space-y-3" style={{ backgroundColor: 'var(--n-surface)', border: '1px solid var(--n-border)' }}>
            {[
              { icon: Wrench,       label: 'Tipo',         value: TIPO_LABEL[ot.tipoMantenimiento] },
              { icon: Wrench,       label: 'Técnico',      value: ot.tecnico?.usuario.nombre },
              { icon: User,         label: 'Responsable',  value: ot.responsable?.nombre },
              { icon: Calendar,     label: 'Creada',       value: `${new Date(ot.fechaCreacion).toLocaleDateString('es-CL')}${ot.creadoPor ? ` · ${ot.creadoPor.nombre}` : ''}` },
              { icon: AlertCircle,  label: 'Compromiso',   value: ot.fechaCompromiso ? new Date(ot.fechaCompromiso).toLocaleDateString('es-CL') : null, urgente: ot.fechaCompromiso ? new Date(ot.fechaCompromiso) < new Date() && ot.estado !== 'CERRADA' : false },
              { icon: Clock,        label: 'Tiempo det.',  value: `${horasDetencion} horas` },
            ].filter(i => i.value).map(item => {
              const Icon = item.icon
              return (
                <div key={item.label} className="flex items-start gap-2.5">
                  <Icon size={13} className="mt-0.5 shrink-0" style={{ color: (item as any).urgente ? 'var(--n-red)' : 'var(--n-text-lt)' }} />
                  <div>
                    <p className="text-xs font-bold uppercase tracking-wider" style={{ color: 'var(--n-text-lt)' }}>{item.label}</p>
                    <p className="text-sm font-semibold" style={{ color: (item as any).urgente ? 'var(--n-red)' : 'white' }}>
                      {item.value}{(item as any).urgente ? ' — VENCIDA' : ''}
                    </p>
                  </div>
                </div>
              )
            })}
          </div>


        </div>

      </div>{/* fin no-print */}
    </AppShell>
  )
}
