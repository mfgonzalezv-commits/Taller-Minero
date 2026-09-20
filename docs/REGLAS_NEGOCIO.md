# Reglas de negocio — Taller Minero

Documento de referencia para la auditoría cruzada (Codex/Gemini) y para cualquier IA que
implemente cambios. Cada regla listada aquí está **implementada y verificada en el código
actual** — no es una aspiración. Si una regla documentada aquí no coincide con el código, el
código gana y este documento debe corregirse en un PR aparte, señalando la discrepancia (no
silenciosamente).

Este documento complementa, no reemplaza, a `docs/ARQUITECTURA.md` (capas técnicas) y
`docs/AI_GOVERNANCE.md` (proceso multiagente).

## Autorización y alcance (RBAC + multi-faena)

- Toda Server Action que mute o lea datos sensibles pasa por `src/lib/authz.ts`:
  `requireSesion()` → `requireRolPermitido()` (cuando aplica) → `requireAlcanceFaena()`
  (cuando el registro pertenece a una faena) → `auditar()` (para acciones críticas).
- `Faena` es el límite de datos. Un usuario con rol de alcance de faena
  (`JEFE_TALLER`, `PLANIFICADOR`, `MECANICO`, `BODEGA`, `COMPRAS`, `GERENCIA`, `OPERADOR`) solo
  ve/opera su propia faena. Los roles de alcance central (`ADMINISTRADOR`,
  `JEFE_TALLER_CENTRAL`, `PLANIFICADOR_CENTRAL` — ver `ROLES_ALCANCE_CENTRAL` en
  `src/lib/authz-core.ts`) ven y operan sobre todas las faenas.
- El middleware (`src/middleware.ts` + `src/lib/roles.ts`) es defensa de UX (oculta
  navegación, redirige), **no** es la autorización real — la autorización real vive en cada
  Server Action. Un cambio que solo oculte un botón sin proteger la action correspondiente no
  cumple esta regla.
- `AsignacionEquipoFaena` es la fuente de verdad de a qué faena perteneció un equipo y cuándo
  (para efectos de Estado de Pago e historial); `Equipo.faenaId` es solo la "ubicación
  actual" y se mantiene en paralelo por compatibilidad.

## Trazabilidad y auditoría

- Nada se borra físicamente en el flujo normal de operación. Las OT se anulan
  (`anularOT`, con motivo obligatorio), no se eliminan.
- `RegistroAuditoria` guarda quién, cuándo, qué cambió (valor anterior/nuevo) y por qué, para
  toda acción marcada como crítica (anulaciones, cambios de estado sensibles, ediciones
  administrativas, ajustes de dinero).

## Máquina de estados de la Orden de Trabajo (OT)

Transiciones válidas (`TRANSICIONES_OT` en `src/lib/constants.ts`):

```
PROGRAMADA → ABIERTA
ABIERTA → CERRADA
EN_DIAGNOSTICO → DIAGNOSTICADO | CERRADA
DIAGNOSTICADO → EN_REPARACION | REPARACION_PROGRAMADA | ESPERA_REPUESTO
REPARACION_PROGRAMADA → EN_REPARACION | LISTO_PARA_REPARAR
LISTO_PARA_REPARAR → EN_REPARACION | REPARACION_PROGRAMADA
EN_REPARACION → ESPERA_REPUESTO | EN_VALIDACION
ESPERA_REPUESTO → LISTO_PARA_REPARAR
EN_VALIDACION → CERRADA | EN_REPARACION
CERRADA → ABIERTA
```

Un cambio de estado que no esté en esta tabla no es válido — si una tarea requiere una
transición nueva, debe actualizarse `TRANSICIONES_OT` explícitamente y quedar documentada
aquí en el mismo PR, no solo en el código.

## Bodega — costeo FIFO

- El consumo de stock se descuenta por lotes (`LoteBodega` + `ConsumoLoteBodega`,
  `src/lib/fifo.ts`), en orden de entrada (First In, First Out). Cada salida queda vinculada
  a los lotes exactos que consumió, no solo a un número agregado de stock.
- No existe una regla de costeo LIFO ni de costo promedio en este proyecto — cualquier cambio
  que se aparte de FIFO es un cambio de regla de negocio (`risk:high`), no un detalle de
  implementación.

## Estado de Pago (arriendo de equipos)

- **Periodo de facturación**: del día 26 de un mes al día 25 del mes siguiente
  (`calcularPeriodo()` en `src/lib/periodo-pago.ts`), no el mes calendario.
- **Fórmula de línea de arriendo** (`calcularLineaArriendo()` en
  `src/lib/calculo-estado-pago.ts`):
  - Modalidad `HORA`: `horasTrabajadas × tarifa` (el horómetro ya excluye el tiempo
    detenido; sin descuento adicional por detención).
  - Modalidad `DIA`: `díasVigentes × tarifa`.
  - Modalidad `MES`, periodo **completo** (el equipo estuvo asignado todo el periodo):
    siempre cobra la tarifa mensual exacta, sea cual sea el largo real del mes calendario
    (28 a 31 días), bajo cualquiera de las dos políticas de abajo.
  - Modalidad `MES`, periodo **parcial**: se prorratea según
    `AsignacionEquipoFaena.politicaProrateo`, configurable por contrato:
    - `DIAS_REALES`: tarifa diaria implícita = `tarifa / díasReales del periodo`.
    - `BASE_30`: tarifa diaria implícita = `tarifa / 30` (base comercial fija).
  - **Detención del periodo** (`src/lib/detencion-periodo.ts`): por equipo y asignación, solo OT de la misma faena no anuladas;
    cada OT detiene de `fechaCreacion` a `fechaTerminoTrabajo` (abierta: hasta el límite del periodo; cerrada sin término técnico: hasta `fechaCierre`);
    las ventanas se recortan a periodo ∩ vigencia de la asignación y se unen (cada minuto cuenta una vez). En HORA no hay descuento adicional.
  - El descuento por detención usa siempre la **misma** tarifa diaria implícita que generó el
    monto bruto, para que bruto y descuento queden coherentes entre sí bajo cualquier
    política.
- Un Estado de Pago no se aprueba (`aprobarEstadoPago`) más de una vez ni se reabre para
  edición después de aprobado — los ajustes posteriores usan `agregarAjusteManual` con motivo
  obligatorio, quedando registrados aparte del monto original.
- Cualquier cambio a estas fórmulas es `risk:high` por definición (ver tabla en `AGENTS.md`)
  y requiere pruebas automatizadas nuevas para los casos de 28/29/30/31 días y detenciones
  parciales, siguiendo el patrón ya existente en `tests/calculo-estado-pago.test.ts`.

## Mantenimiento preventivo

- Coexisten dos sistemas sin unificar: `PautaMantenimiento` (con datos reales de catálogo,
  el vigente) y `PlanMantenimiento` (sistema anterior/manual, aún con datos históricos).
  `src/lib/mantenimiento-guard.ts` evita que ambos generen una OT preventiva duplicada para
  el mismo equipo/ciclo mientras no se decida unificarlos — no eliminar esta protección al
  tocar cualquiera de los dos sistemas.

## Deuda técnica documentada (no son bugs a "corregir sorpresivamente" sin issue)

- **Resuelto:** las páginas que usaban `prisma.faena.findFirst()` ahora usan la faena de la sesión (necesario para operar más de una faena, como San Ramón).
- Dependencias con vulnerabilidades conocidas (`next`, `next-auth`, `prisma`, `vitest`) no se
  han actualizado — requieren su propia tanda de pruebas dedicada (ver `npm audit`).
- **Resuelto (PR de seguridad `fix/seguridad-roles-faena`):** `AsignarTecnico` y
  `EditarDiagnostico` vuelven a la ficha de OT, con sus Server Actions protegidas (rol, faena
  de la OT y faena del técnico). Los selectores de rol de `/usuarios` muestran solo los roles
  que el usuario actual puede otorgar, y el backend lo impone (`src/lib/permisos-roles.ts`).
- **Pendiente de negocio:** un Estado de Pago RECHAZADO es terminal y el periodo ya tiene su
  registro (restricción única faena+periodo), así que hoy no puede volver a prepararse. Hace
  falta un procedimiento de reemplazo/anulación con motivo, documento reemplazante y auditoría.

## Matriz de roles (decisión definitiva, implementada en `src/lib/permisos-roles.ts`)

| Acción | Roles |
|---|---|
| Asignar técnico, crear OT, autorizar solicitudes de repuesto, crear planes de mantención | ADMINISTRADOR, JEFE_TALLER_CENTRAL, PLANIFICADOR_CENTRAL, JEFE_TALLER, PLANIFICADOR |
| Bitácora y diagnóstico | Los anteriores + MECANICO solo si está asignado a la OT (misma faena) |
| Crear/editar ítems del maestro de bodega | ADMINISTRADOR, BODEGA |
| Otorgar ADMINISTRADOR, roles centrales, GERENCIA | Solo ADMINISTRADOR |
| Administrar usuarios de faena | JEFE_TALLER_CENTRAL (todos los roles de faena); JEFE_TALLER (PLANIFICADOR, MECANICO, BODEGA, COMPRAS, OPERADOR, solo su faena) |
| Estado de Pago | PREPARADO → APROBADO o RECHAZADO; ambos terminales |

OPERADOR y MECANICO reportan fallas; no crean OT. Nadie eleva su propio rol.

## Estados de la OT, horómetro y bodega (decisiones definitivas)

- **OT:** la máquina de estados vive en `src/lib/maquina-ot.ts`. No se cierra sin pasar por
  `EN_VALIDACION` y sin la validación técnica del Jefe; el cierre administrativo lo hace Jefe o
  Planificador después. `EN_REPARACION → ABIERTA` no existe. Una OT cerrada solo se reabre con
  `reabrirOT` (Jefe/Admin, motivo obligatorio, auditoría con valor anterior y nuevo). La
  bitácora no puede cerrar ni saltarse estados: si el tipo de intervención propone un estado no
  válido, la entrada se guarda y el estado no cambia.
- **Horómetro** (`src/lib/horometro-politica.ts`): una lectura menor queda bloqueada y se
  corrige solo con `corregirLecturaHorometro` (rol autorizado, motivo, auditoría). Un salto
  anómalo (umbral actual: 3 por hora real, parametrizable a futuro por faena/equipo) queda
  pendiente (`validado = false`) y no se usa —ni en el equipo ni en el Estado de Pago— hasta que
  un Jefe o Planificador lo confirme.
- **Bodega:** toda salida por OT consume lotes FIFO dentro de una transacción
  (`src/lib/stock.ts`); el costo del repuesto es el costo FIFO real. Devoluciones y ajustes
  también mantienen los lotes alineados con el stock.

Ver también `docs/DECISIONES_OPERACIONALES_SR01.md` (permisos, Estados de Pago versionados, liberación, pautas, turnos y alertas del piloto San Ramón).
