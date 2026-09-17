# Arquitectura — Taller Minero

Actualizado en la rama `feat/plan-maestro-fase1` (plan maestro, Fases 1-11).

## Stack

Next.js 16 (App Router) + React 19 + TypeScript, Server Actions como única capa de API real
(no hay backend separado), Prisma 7 + PostgreSQL (Neon serverless), NextAuth 5 beta
(Credentials), Tailwind CSS 4, Vitest para pruebas.

## Capas

```
src/app/**              Páginas (server components) + componentes cliente por módulo
src/actions/**          Server Actions — toda la lógica de negocio y acceso a datos vive acá
src/lib/authz.ts        Punto único de autorización: requireSesion, requireRolPermitido,
                         requireAlcanceFaena, auditar
src/lib/authz-core.ts   Lógica pura de authz (sin Prisma/NextAuth) — testeable aislada
src/lib/auth.config.ts  Config de NextAuth SIN Prisma — la usa el middleware (Edge runtime)
src/lib/auth.ts         Config completa de NextAuth CON Prisma — solo para el login real
src/lib/fifo.ts         Consumo FIFO de lotes de bodega (compartido entre bodega.ts y sr.ts)
src/lib/correo.ts       Adaptador de correo saliente (bandeja de salida, sin proveedor real)
src/lib/periodo-pago.ts Cálculo del periodo de facturación (26 a 25) — lógica pura, testeada
src/lib/mantenimiento-guard.ts  Evita OT preventivas duplicadas entre los dos sistemas de PM
prisma/schema.prisma    Fuente de verdad del modelo de datos
tests/**                Pruebas con Vitest (RBAC, aislamiento multi-faena, período de pago,
                         regresión de seguridad de seed-pautas)
```

## Autenticación y autorización

- **Sesión**: NextAuth con JWT, `session.user.{id, rol, faenaId}`.
- **Middleware** (`src/middleware.ts`): redirige según autenticación y rol/ruta
  (`src/lib/roles.ts`). Es defensa de UX, no de seguridad — la autorización real vive en
  cada Server Action.
- **Toda Server Action que mute o lea datos sensibles debe**:
  1. `const sesion = await requireSesion()` — falla si no hay sesión válida.
  2. `requireRolPermitido(sesion, [...])` cuando la acción requiere un rol específico.
  3. `requireAlcanceFaena(sesion, faenaIdDelRegistro)` cuando el registro pertenece a una
     faena — bloquea acceso cruzado entre faenas salvo rol central.
  4. `auditar({...})` para acciones críticas (anulaciones, cambios de estado sensibles,
     ediciones administrativas, ajustes de dinero).

### Roles

`ADMINISTRADOR` (config técnica, alcance central), `JEFE_TALLER_CENTRAL`,
`PLANIFICADOR_CENTRAL` (alcance sobre todas las faenas — Fase 2), `JEFE_TALLER`,
`PLANIFICADOR`, `MECANICO`, `BODEGA`, `COMPRAS`, `GERENCIA`, `OPERADOR` (alcance limitado a
su propia faena).

`ROLES_ALCANCE_CENTRAL` en `src/lib/authz-core.ts` es la única lista que define quién ve
todas las faenas — cambiar el alcance de un rol se hace ahí, no repartido por el código.

## Multi-faena

`Faena` es el límite de datos. Todo registro que pertenece a una faena debe filtrarse por
`faenaId` en cada lectura y validarse con `requireAlcanceFaena` en cada mutación. El
historial de asignación de equipos (`AsignacionEquipoFaena`, Fase 2) es la fuente de verdad
para saber a qué faena perteneció un equipo y cuándo — `Equipo.faenaId` es solo la
"ubicación actual", mantenida en paralelo por compatibilidad con el resto del código.

## Trazabilidad y auditoría

- Nada se borra físicamente: OT se anulan (`anularOT`), no se eliminan.
- `RegistroAuditoria` (Fase 1) guarda quién, cuándo, qué cambió (valor anterior/nuevo) y por
  qué, para toda acción marcada como crítica.
- Bodega usa lotes FIFO (`LoteBodega` + `ConsumoLoteBodega`, Fase 6): cada salida de stock
  queda vinculada a los lotes exactos que consumió, no solo a un número de stock.

## Variables de entorno

| Variable | Uso |
|---|---|
| `DATABASE_URL` | Conexión Postgres (Neon) |
| `NEXTAUTH_SECRET` | Firma de sesión JWT |
| `NEXTAUTH_URL` | URL pública del sitio (NextAuth) |
| `NEXT_PUBLIC_APP_NAME` | Nombre mostrado en la UI |
| `NEXT_PUBLIC_APP_ENV` | Entorno (dev/prod) |
| `SMTP_PROVIDER_URL` *(no configurada aún)* | Activaría el envío real de correo en `src/lib/correo.ts` — sin ella, los correos quedan en bandeja de salida (`CorreoSaliente`, estado PENDIENTE) |

No hay variables nuevas que contengan secretos — el adaptador de correo y el de WhatsApp
(pendiente) están diseñados para activarse agregando variables de entorno sin tocar el
código que ya los usa.

## Cómo operar

- **Desarrollo**: `npm run dev` (usa la base de datos de `.env`, hoy una Neon de desarrollo
  separada de producción).
- **Build**: `npm run build` — ya NO ignora errores de TypeScript ni de ESLint (Fase 11
  retiró `ignoreBuildErrors`/`ignoreDuringBuilds` de `next.config.ts` tras dejar el proyecto
  en cero errores).
- **Pruebas**: `npm test` (Vitest).
- **Migraciones de schema**: `npx prisma db push` contra desarrollo. Contra producción NO se
  ha ejecutado ninguna migración de este plan — queda pendiente de aprobación explícita
  antes de aplicarse (ver informe final).
- **Seed de pautas de mantenimiento**: `npm run seed:pautas -- <faena> <km.xlsm> <hrs.xlsm>`
  — solo local, ya no es una ruta HTTP (ver hotfix `protect-seed-pautas`).

## Deuda técnica documentada

- **Dos sistemas de mantenimiento preventivo** (`PlanMantenimiento` y `PautaMantenimiento`)
  siguen sin unificar — `PautaMantenimiento` tiene datos reales de producción (107 pautas).
  `src/lib/mantenimiento-guard.ts` evita que generen OT duplicadas mientras se decide si
  unificar. Ver Fase 7 del plan.
- **Dependencias con vulnerabilidades conocidas** (`next`, `next-auth`, `prisma`, `vitest`)
  no se actualizaron en esta rama — requieren su propia tanda de pruebas dedicada, separada
  de este plan de 11 fases. Ver `npm audit` para el detalle completo.
- **`equipos/[id]/page.tsx` y otras páginas** usaban `prisma.faena.findFirst()` en vez de la
  faena de la sesión en algunos puntos — se corrigió en el dashboard (Fase 4); vale la pena
  auditar el resto de las páginas server component con el mismo patrón.
