# Auditoría de procesos con SIM-01 (parcial)

Rama `audit/sim01-procesos-integrales`. Todo se ejecutó solo contra `erp_minera_dev` con datos ficticios. Producción no se tocó. No se corrigió funcionalidad.

## Cobertura real

| Fase | Estado |
|---|---|
| 1 Preparación (SIM-02 + usuarios por rol) | Hecha (`scripts/auditoria/preparar-auditoria.ts`) |
| 2 Acceso y seguridad | Hecha con arnés dinámico (37 pruebas, `auditoria/acceso.audit.ts`) + matriz estática de 113 acciones (`scripts/auditoria/matriz-acciones.mjs`) |
| 3 a 8 (flujo operativo completo, mantención, bodega/compras, costos, reportes, resiliencia/responsive) | **No ejecutadas en esta entrega.** Quedan pendientes; el arnés (`vitest.auditoria.config.ts`, `auditoria/helpers.ts`) ya permite escribirlas. |

Reproducir: `npx tsx scripts/auditoria/preparar-auditoria.ts` y `npx vitest run -c vitest.auditoria.config.ts` (resultado en `auditoria/salida/acceso.json`, ignorado por git). Las pruebas dejan datos de auditoría en SIM-01 (bitácora y técnico asignado en una OT); se limpian recargando con `scripts/simulacion-tres-meses.ts --reset`.

## Hallazgos (fase 2)

| ID | Sev. | Riesgo del arreglo | Hallazgo |
|---|---|---|---|
| AUD-001 | **P0** | high | **Escalamiento de privilegios.** Un `JEFE_TALLER` de faena puede crear un usuario `ADMINISTRADOR` o `JEFE_TALLER_CENTRAL` (`crearUsuario`) y subir a un usuario existente a `PLANIFICADOR_CENTRAL` (`actualizarUsuario`). Confirmado (ACC-015, 016, 017). Con eso obtiene acceso a todas las faenas. |
| AUD-002 | **P0** | medium | **Acceso entre faenas.** Un jefe de SIM-02 pudo asignar un técnico de SIM-01 a una OT de SIM-01 (`asignarTecnico`, ACC-001) y escribir en su bitácora (`agregarBitacora`, ACC-005). No hay control de faena en ambas. |
| AUD-003 | P1 | medium | `asignarTecnico` no valida rol: OPERADOR, BODEGA y MECANICO lo ejecutan (ACC-024, 029, 034). |
| AUD-004 | P1 | medium | `crearItem` (bodega) y `crearOT` permiten a OPERADOR y MECANICO (ACC-026, 036, 037). Crear ítems debería ser de BODEGA. |
| AUD-005 | P2 | low | `actualizarDiagnostico` y `crearOT` con IDs de otra faena fallan por el filtro de Prisma con un error técnico crudo, no un mensaje de permisos. Bloquea de hecho, pero se filtra el detalle del error (ACC-002, 006). |
| AUD-006 | P2 | medium | La matriz estática marca 49 acciones que escriben sin rol explícito y 11 sin control de faena (heurística, con falsos positivos). Lista en la salida de `matriz-acciones.mjs`; conviene revisar bodega, repuestos, SR, mantenimiento, inspección, pautas, trabajadores y mano de obra. |

Confirmado como bien: anular OT, cambiar estado de OT, movimientos de bodega, horómetro, estado de equipo, informes, solicitud de repuesto y edición de usuarios entre faenas quedan bloqueados; PLANIFICADOR, MECANICO, BODEGA y OPERADOR no pueden crear usuarios; aprobar Estado de Pago exige rol.

## Decisiones pendientes de negocio
- ¿Qué roles pueden asignar técnico, crear OT y crear ítems de bodega?
- ¿El Jefe de Taller de faena puede crear cualquier rol o solo los de su faena (MECANICO, BODEGA, OPERADOR, PLANIFICADOR, JEFE_TALLER)?

## Anomalía histórica (no modificada)
En producción existe un Estado de Pago aprobado con 0 líneas y neto $0 (periodo 2026-08-26 a 2026-09-25, aprobado 2026-09-19). Solo documentado.

## Pendientes conocidos
- `AsignarTecnico` y `EditarDiagnostico` siguen sin renderizarse; roles centrales fuera de los formularios de usuario (PR de seguridad risk:high).
- El periodo 3 de SIM-01 sigue PREPARADO en dev, sin aprobar.

## Propuesta de PRs
1. **Seguridad (risk:high):** AUD-001 y AUD-002 (lista blanca de roles asignables, control de faena en `asignarTecnico` y `agregarBitacora`).
2. **Roles (risk:medium):** AUD-003, AUD-004 y AUD-006 (`requireRolPermitido` en las acciones de escritura).
3. **Calidad (risk:low):** AUD-005 (mensajes de error de acceso consistentes).
4. Completar las fases 3 a 8 con el mismo arnés.

## Agente Planificador (análisis, sin implementar)
Tareas repetitivas candidatas: priorizar reportes de falla, sugerir técnico según especialidad y carga, avisar preventivos por horómetro, detectar OT detenidas en espera de repuestos. Datos necesarios: historial de OT y estados, horómetros, stock y consumos, carga por técnico. Toda acción que cambie datos (asignar, cerrar, anular, comprar) queda con aprobación humana; cada sugerencia debe mostrar su explicación y un nivel de confianza.

## Producción
No se ejecutó ningún script contra producción; todos usan `impedirEjecucionEnProduccion()`.
