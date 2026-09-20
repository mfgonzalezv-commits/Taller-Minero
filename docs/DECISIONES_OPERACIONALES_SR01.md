# Decisiones operacionales — piloto San Ramón (SR-01)

Faena: **SR-01 · Faena San Ramón** · Cía. Minera Minerales Copiapó · Chañaral · periodo de cobro del 26 al 25 siguiente. Plantilla de carga: `plantillas-carga/faena-sr-01/faenas.csv`.

## Permisos (backend + interfaz)
| Rol | Puede |
|---|---|
| Planificador de faena (solo su faena) | consultar, recibir y entregar repuestos; hacer inventarios y **solicitar** ajustes de stock; comprar bajo $250.000 (IVA incl.) y **solicitar aprobación** desde $250.000; crear y programar mantenciones (reprogramar exige motivo); proponer pautas; **liberar operacionalmente** equipos |
| Jefe de Taller Central | validar técnicamente si la faena no tiene Jefe local; aprobar **exclusivamente** compras desde $250.000, ajustes manuales de stock y pautas nuevas/modificadas |
| Planificador Central | supervisión de todas las faenas, recibe escalamientos y **prepara** Estados de Pago |
| Gerencia | aprueba, rechaza y **anula** Estados de Pago |
| ADMINISTRADOR (cuenta única) | conserva sus permisos actuales; queda registrado como `preparadoPor` y no puede decidir sobre lo que preparó |

Sin usuarios exclusivos de Bodega o Adquisiciones. Matriz en `src/lib/permisos-roles.ts`.

## Estados de Pago
`PREPARADO → APROBADO | RECHAZADO`. El preparador no aprueba ni rechaza su documento. RECHAZADO y ANULADO son terminales; APROBADO es inmutable y solo **Gerencia** lo anula (motivo obligatorio). El reemplazo o corrección es una **versión nueva vinculada** (`versionAnteriorId`), que guarda las diferencias con la anterior; ninguna versión se borra. Un índice parcial en la base garantiza un solo documento vigente por faena y periodo. El Estado de Pago histórico de producción (neto $0) no se toca.

## Compras y ajustes
- Límite: **$250.000 total final IVA incluido**; *desde* ese monto exige aprobación central (`src/lib/compra-directa.ts`). La aprobación fija el monto tope.
- Pantalla **Compras directas** (`/compras-directas`): el Planificador marca, solicita aprobación y regulariza (monto, comprobante, motivo y ≥1 cotización); el Jefe Central aprueba.
- Ajustes de stock: se solicitan desde Bodega («Solicitar ajuste / inventario») y los aprueba el Jefe Central en el panel de Bodega; quien solicita no aprueba. El ajuste directo ya no existe.

## Inspección y liberación
El Operador inspecciona al inicio de cada turno; un hallazgo crítico detiene el equipo. Al terminar una reparación **el equipo sigue detenido**: valida técnicamente el Jefe (el Jefe Central solo si no hay Jefe local) y luego el Jefe/Planificador **de la misma faena** lo libera (`liberarEquipo`). Sin reparación se libera con motivo obligatorio. Todo queda auditado.

## Pautas
Una pauta nueva o modificada se **versiona** (no se sobrescribe), queda pendiente y la aprueba el Jefe Central; solo las aprobadas se vinculan a equipos u OT. Las OT existentes conservan la versión que las originó.

## Turnos
`sistemaTurno` (7X7 | 14X14) y `grupoTurno` (A | B) en cada usuario, opcionales; la jornada Día/Noche sigue en el técnico. Sin cuentas compartidas. Columnas opcionales en `usuarios.csv` del importador.

## Alertas (solo notificaciones internas)
| Alerta | Escalamiento | Tiempo |
|---|---|---|
| Hallazgo crítico / equipo detenido | inmediata Planificador · 30 min Jefe Central · 2 h Planificador Central | continuo |
| OT crítica sin responsable | inmediata Planificador · 30 min Jefe Central | continuo |
| OT normal sin movimiento | 4 h Planificador · 8 h Jefe Central · 24 h Planificador Central | laboral |
| Reparación pendiente de validación | inmediata Jefe Central · recordatorio 2 h · 4 h Planificador Central | continuo |
| Stock crítico agotado | inmediata Planificador · 1 h Jefe Central · 4 h Planificador Central | continuo |
| Compra ≥ $250.000 pendiente | inmediata Jefe Central · recordatorio 4 h · 8 h Planificador Central | laboral |
| Preventivo | próximo (7 días o 50 h) una vez; vencido, diaria | — |
| Estado de Pago | 3 días antes del 25 y el día 25: Planificador Central; atraso: Gerencia | — |

**Supuestos a confirmar:** horario laboral = lunes a viernes 08:00–18:00 hora de Chile; el primer aviso de «OT sin movimiento» y de «OT crítica sin responsable» va al Planificador de la faena; el aviso de preventivo va al Planificador.

**Cómo se ejecuta:** el motor es idempotente (`scripts/procesar-alertas.ts` o `GET/POST /api/alertas/procesar` con `Authorization: Bearer $ALERTAS_CRON_SECRET`, secreto de 16+ caracteres; sin secreto el endpoint está apagado). Debe programarse cada 1–5 minutos (cron de Railway). Las alertas se ven en **Alertas** (menú); cada rol ve las dirigidas a su rol y faena.

## Migración `20260920000000_decisiones_operacionales`
Solo agrega columnas nulables o con valor por defecto, dos tablas nuevas (`solicitudes_ajuste_stock`, `notificaciones`) y el valor `ANULADO` del enum. **Único cambio no puramente aditivo:** el índice único de `estados_pago` (faena, periodo) se **amplía** a (faena, periodo, versión) y se agrega el índice parcial de documento vigente; no se borra ni modifica ningún dato.
