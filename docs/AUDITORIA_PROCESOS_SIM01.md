# Auditoría de procesos con SIM-01 / SIM-02

Rama `audit/sim01-procesos-integrales`. Todo se ejecutó contra `erp_minera_dev` con datos ficticios. Producción no se tocó. No se corrigió funcionalidad. Los P0 de seguridad se probaron solo con la evidencia mínima y no se explotaron más.

## Cómo reproducir
```
npx tsx scripts/auditoria/preparar-auditoria.ts        # SIM-02 + usuarios por rol (idempotente, solo dev)
npx vitest run -c vitest.auditoria.config.ts           # acceso, flujo, costos y mantención
node scripts/auditoria/matriz-acciones.mjs             # matriz estática de las 113 Server Actions
```
Evidencia en `docs/evidencia-auditoria/` (JSON de cada corrida y capturas a 390/768/1440 px). Las pruebas dejan datos de auditoría en SIM-01 (una bitácora y un técnico asignado en una OT); se limpian con `scripts/simulacion-tres-meses.ts --reset`.

## Cobertura
| Fase | Resultado |
|---|---|
| 1 Preparación | SIM-01 íntegra (12 equipos, 68 OT, 3 EP); SIM-02 y usuarios por rol creados |
| 2 Acceso y seguridad | 37 pruebas cruzadas entre faenas y roles + matriz estática |
| 3 Flujo operativo | Falla → OT → técnico → bitácora → repuesto → entrega → validación → cierre → reapertura, 17 pasos |
| 4 Mantención e inspecciones | Plan preventivo, duplicado de OT, horómetro anómalo. **Inspecciones diarias y alertas no se ejecutaron dinámicamente.** |
| 5 Bodega/compras | Entrega de repuesto, stock negativo, lotes. **Cotizaciones y compra directa regularizada no se ejecutaron.** |
| 6 Estado de Pago | Roles de preparar/aprobar, duplicados, ajustes, aprobación repetida |
| 7 Reportes | Informe diario contra tablas fuente; 0 correos en cola (no se envió ninguno) |
| 8 Resiliencia | Responsive y consola (3 anchos x 8 pantallas), acceso por URL directa, tests en UTC y America/Santiago |

## Hallazgos priorizados
| ID | Sev. | Riesgo del arreglo | Hallazgo y evidencia |
|---|---|---|---|
| AUD-001 | **P0** | high | **Escalamiento de privilegios.** Un JEFE_TALLER de faena crea usuarios ADMINISTRADOR o JEFE_TALLER_CENTRAL (`crearUsuario`) y sube usuarios a PLANIFICADOR_CENTRAL (`actualizarUsuario`). ACC-015, 016, 017. |
| AUD-002 | **P0** | medium | **Acceso entre faenas.** Un jefe de SIM-02 asignó técnico (`asignarTecnico`) y escribió bitácora (`agregarBitacora`) en una OT de SIM-01. ACC-001, ACC-005. |
| AUD-003 | P1 | high | **Estado de Pago sin control de estado.** `aprobarEstadoPago` se puede repetir (pisa aprobador y fecha) y `rechazarEstadoPago` acepta un EP ya APROBADO. Evidencia: pasos «Doble aprobación» y «Rechazar EP ya aprobado». |
| AUD-004 | P1 | medium | **Entrega de repuesto rompe el stock por lotes.** `entregarSolicitud` descuenta `stockActual` sin pasar por FIFO: stock 18, lotes 20. Los costos FIFO y el stock quedan desalineados. |
| AUD-005 | P1 | medium | **Sin validación de rol** en acciones de escritura: `asignarTecnico` (OPERADOR, BODEGA y MECANICO pueden), `autorizarSolicitud` (OPERADOR autorizó), `crearItem` de bodega y `crearOT` (OPERADOR y MECANICO), `crearPlan` de mantención (OPERADOR). ACC-024, 026, 029, 034, 036, 037. |
| AUD-006 | P2 | medium | **Horómetro sin bloqueo.** Acepta una lectura menor a la anterior (500 tras 1010) y un salto de +899.500 h. Guarda y solo advierte. |
| AUD-007 | P2 | low | **Doble clic duplica historial.** Dos `cambiarEstadoOT` simultáneos al mismo estado crean 2 registros de historial. |
| AUD-008 | P2 | medium | **OT sin máquina de estados.** Permite volver de EN_REPARACION a ABIERTA y cerrar sin pasar por EN_VALIDACION. Puede ser intencional: ver decisiones. |
| AUD-009 | P2 | low | **`/arriendos` lanza error de consola** «Only plain objects can be passed to Client Components» (valores Decimal sin serializar) a los 3 anchos. |
| AUD-010 | P2 | low | Con IDs de otra faena, `actualizarDiagnostico` y `crearOT` fallan con el error crudo de Prisma en vez de un mensaje de permisos. Bloquea de hecho, pero filtra detalle técnico. |
| AUD-011 | P2 | medium | La matriz estática marca 49 escrituras sin rol explícito y 11 sin control de faena (heurística con falsos positivos): bodega, repuestos, SR, mantenimiento, inspección, pautas, trabajadores, mano de obra. |
| AUD-012 | P3 | low | Dato histórico en producción: un Estado de Pago APROBADO con 0 líneas y neto $0 (2026-08-26 a 2026-09-25, aprobado 2026-09-19). Solo documentado, no se tocó. |

## Procesos que funcionan correctamente
- Anular OT, cambiar estado, movimientos de bodega, horómetro, estado de equipo, informes, solicitud de repuesto y edición de usuario **están bloqueados entre faenas**.
- PLANIFICADOR, MECANICO, BODEGA y OPERADOR no pueden crear usuarios ADMINISTRADOR.
- Operador, Bodega y Mecánico no pueden anular ni cerrar OT; no pueden aprobar EP.
- Un OPERADOR es redirigido (307 a /dashboard) al abrir por URL directa /usuarios, /arriendos, /faenas, /informes, /reportes, /compras, /trabajadores, /mantenimiento y /bodega: la protección de rutas funciona.
- Reporte de falla con detención solicitada deja el equipo en DETENIDO_PENDIENTE_VALIDACION (correcto).
- Un jefe de faena no prepara EP; un planificador central prepara pero no aprueba; solo ADMINISTRADOR/GERENCIA aprueban.
- EP de SIM-02: línea única de $5.000.000 bruto, neto = bruto - descuento, con ajuste manual aplicado. Preparar el mismo periodo dos veces lo rechaza; ajustar un EP aprobado también.
- Salida de bodega mayor al stock se rechaza; OT preventiva duplicada se rechaza; anular una OT cerrada se rechaza.
- EN_VALIDACION devuelve el equipo a OPERATIVO y fija el término técnico; el cierre fija `fechaCierre`.
- La auditoría (`RegistroAuditoria`) registra las acciones del flujo.
- Los 79 tests unitarios pasan en UTC y en America/Santiago.
- Interfaz: 21 de 24 pantallas sin desborde ni errores de consola en 390/768/1440 px (las 3 restantes son AUD-009).

## Decisiones de negocio pendientes
1. ¿Qué roles pueden asignar técnico, autorizar solicitudes de repuesto, crear OT, crear ítems de bodega y crear planes de mantención?
2. ¿El Jefe de Taller de faena puede crear solo roles de faena? (recomendado: sí; roles centrales solo por ADMINISTRADOR).
3. ¿Se permite cerrar una OT sin validación técnica y volver de EN_REPARACION a ABIERTA?
4. ¿Un EP aprobado se puede rechazar? ¿Con qué procedimiento se anula?
5. Horómetro: ¿advertir o bloquear lecturas menores y saltos sobre un umbral (cuál)?
6. ¿El dashboard y las OT de una faena deben permitir vista de solo lectura a roles centrales? (hoy sí).

## Propuesta de PRs correctivos (mínimo)
1. **PR de seguridad `risk:high` (AUD-001, 002, 003, 005, 010, 011).** Un solo PR:
   - Lista blanca de roles asignables por rol creador en `crearUsuario` y `actualizarUsuario`; solo ADMINISTRADOR crea roles centrales.
   - Rol y `requireAlcanceFaena` en `asignarTecnico` y `agregarBitacora`, y en todas las escrituras marcadas por la matriz.
   - Roles permitidos: asignar técnico y autorizar solicitud → ADMINISTRADOR, JEFE_TALLER_CENTRAL, JEFE_TALLER, PLANIFICADOR; crear ítem → BODEGA y jefes; crear plan → jefes y planificadores; crear OT → sin OPERADOR.
   - Máquina de estados de Estado de Pago (PREPARADO→APROBADO/RECHAZADO; APROBADO inmutable).
   - Pruebas: la batería `auditoria/acceso.audit.ts` convertida a tests con esperado BLOQUEADO; más un test por rol y acción; tsc, eslint y build.
2. **PR de integridad `risk:medium` (AUD-004, 006, 007, 008).** Entrega de repuesto por FIFO en una transacción, validaciones de horómetro, idempotencia en cambio de estado y (según decisión 3) transiciones de OT.
3. **PR de calidad `risk:low` (AUD-009).** Serializar Decimals en `/arriendos`, con `src/lib/serialize.ts`.
4. Completar las fases 4 y 5 pendientes (inspecciones, cotizaciones, compra directa) con el mismo arnés.

## Agente Planificador (análisis privado, sin implementar)
- **Tareas repetitivas:** priorizar reportes de falla, sugerir técnico según especialidad y carga, avisar preventivos por horómetro, detectar OT detenidas esperando repuestos.
- **Alertas predictivas:** equipos con fallas recurrentes, stock crítico contra consumo, riesgo de superar la fecha comprometida.
- **Datos necesarios:** historial de OT y estados, horómetros, stock y consumos FIFO, carga por técnico, tiempos por etapa.
- **Borradores de decisión:** propuesta de asignación, pedido de compra sugerido, agenda de preventivos.
- **Siempre con aprobación humana:** asignar, cerrar, anular, comprar, aprobar o ajustar EP y cambiar roles.
- **Explicación y confianza:** cada sugerencia muestra sus datos de origen y un nivel de confianza; sin datos suficientes no propone.

## Confirmación de producción
Ningún script ni prueba se ejecutó contra producción; todos usan `impedirEjecucionEnProduccion()` y la base local apunta a `erp_minera_dev`. No hubo migraciones ni cambios de configuración. No se envió ningún correo ni WhatsApp (0 filas en la cola).
