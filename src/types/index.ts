import type {
  Faena,
  Usuario,
  Tecnico,
  Equipo,
  HorometroKm,
  OrdenTrabajo,
  HistorialEstadoOT,
  RolUsuario,
  TipoEquipo,
  EstadoEquipo,
  TipoMantenimiento,
  EstadoOT,
  PrioridadOT,
} from '@prisma/client'

export type {
  Faena,
  Usuario,
  Tecnico,
  Equipo,
  HorometroKm,
  OrdenTrabajo,
  HistorialEstadoOT,
  RolUsuario,
  TipoEquipo,
  EstadoEquipo,
  TipoMantenimiento,
  EstadoOT,
  PrioridadOT,
}

export type EquipoConOTs = Equipo & {
  ots: OrdenTrabajo[]
}

export type OTConRelaciones = OrdenTrabajo & {
  equipo: Equipo
  responsable: Usuario | null
  tecnico: (Tecnico & { usuario: Usuario }) | null
  creadoPor: Usuario | null
  historial: HistorialEstadoOT[]
}

export type UsuarioConTecnico = Usuario & {
  tecnico: Tecnico | null
}

export type NavItem = {
  label: string
  href: string
  icon: string
  roles?: RolUsuario[]
}
