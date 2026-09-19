# Auditoría de procesos con SIM-01 / SIM-02 — resultado final

Todo se ejecutó contra `erp_minera_dev` con datos ficticios. Producción no se tocó.

## Cómo reproducir
```
npx tsx scripts/auditoria/preparar-auditoria.ts        # SIM-02 + usuarios por rol (reinicia SIM-02)
npx tsx scripts/auditoria/borrar-faena.ts SIM-01       # borra SIM-01 y todo lo que cuelga (solo SIM-nn)
npx tsx scripts/simulacion-tres-meses.ts               # recarga SIM-01
npx vitest run -c vitest.auditoria.config.ts auditoria/<archivo>   # acceso | flujo | costos-mant | integridad | inspeccion-compras
node scripts/auditoria/matriz-acciones.mjs             # matriz estática de las 113 Server Actions
```
Entre baterías conviene volver a ejecutar `preparar-auditoria.ts`. Evidencia: `docs/evidencia-auditoria/` (antes de las correcciones) y `docs/evidencia-auditoria/tras-correcciones/` (después), más capturas a 390/768/1440 px.

## Estado de los hallazgos originales
| ID | Sev. | Estado | Corregido en |
|---|---|---|---|
| AUD-001 Escalamiento de privilegios al crear/editar usuarios | P0 | **Corregido**: bloqueado por rol y sin autoelevación | PR #8 |
| AUD-002 Acceso entre faenas (`asignarTecnico`, `agregarBitacora`) | P0 | **Corregido**: bloqueado, incluye faena del técnico | PR #8 |
| AUD-003 Estado de Pago aprobable/rechazable varias veces | P1 | **Corregido**: PREPARADO → APROBADO/RECHAZADO terminales, con condición en el UPDATE | PR #8 |
| AUD-004 Entrega de repuesto rompía FIFO | P1 | **Corregido**: transacción con lote, stock, movimiento, consumo y repuesto | PR #9 |
| AUD-005 Faltaba validación de rol en escrituras | P1 | **Corregido** según la matriz de roles | PR #8 |
| AUD-006 Horómetro aceptaba retrocesos y saltos | P2 | **Corregido**: menor bloqueada; salto pendiente de confirmación | PR #9 |
| AUD-007 Doble clic duplicaba historial | P2 | **Corregido**: cambio idempotente | PR #9 |
| AUD-008 OT sin máquina de estados | P2 | **Corregido** con `reabrirOT` específica | PR #9 |
| AUD-009 Error de consola en `/arriendos` (Decimal) | P2 | **Corregido** | PR #7 |
| AUD-010 Errores crudos de Prisma con IDs de otra faena | P2 | **Corregido** | PR #8 |
| AUD-011 49 escrituras sin rol / 11 sin faena (heurística) | P2 | **Revisadas una a una**; se corrigieron las vulnerables (además de las anteriores: `actualizarEquipo`, `eliminarEquipo`, `eliminarManoObra`, `manoObra`, `pautas`, `mantenimiento`, `inspeccion`, `informes`, `trabajadores`, `sr`, `repuestos`) | PR #8 |
| AUD-012 EP productivo aprobado con 0 líneas y neto $0 | P3 | **Solo documentado**, no se tocó | — |

Tras las correcciones y con SIM-01/SIM-02 reiniciados, se repitió toda la batería: acceso 49/49, flujo 19/19, costos y mantención 20/20, integridad 49/49 sin desviaciones.

## Hallazgos nuevos (fases de inspección y compras) — pendientes
| ID | Sev. | Riesgo del arreglo | Hallazgo y evidencia (`tras-correcciones/inspeccion-compras.json`) |
|---|---|---|---|
| AUD-013 | **P0** | high | **`crearInspeccion` no valida la faena del equipo ni de la plantilla.** Un operador de SIM-02 inspeccionó un equipo de SIM-01: creó alerta y reporte de falla y dejó el equipo de SIM-01 en `DETENIDO_PENDIENTE_VALIDACION`. Puede detener equipos de otra faena (daño operativo y de arriendo). |
| AUD-014 | P1 | medium | **SR sin máquina de estados.** `cambiarEstadoSR` deja entregar dos veces la misma SR: el stock se descuenta dos veces (16 en vez de 18). También permite retroceder ENTREGADA → ENVIADA. El descuento tampoco es atómico ni usa la lógica compartida de stock. |
| AUD-015 | P2 | medium | `generarOTDesdeAlerta` no evita duplicados: convertir dos veces la misma alerta crea 2 OT. |
| AUD-016 | P2 | medium | Cada inspección con hallazgo crítico repetido crea otro reporte de falla para el mismo problema (2 reportes abiertos). |
| AUD-017 | P2 | medium | `regularizarCompraDirecta` acepta cero cotizaciones y se puede ejecutar dos veces (pisa la regularización). Decisión pendiente: mínimo de cotizaciones. |
| AUD-018 | P3 | low | `crearInspeccion` escribe alerta, reporte y equipo sin transacción: una falla a mitad deja datos parciales. |
| AUD-019 | P3 | low | `agregarBitacora` con estado propuesto no válido guarda la entrada sin cambiar el estado, sin avisar al usuario. |
| AUD-020 | P3 | low | Un Estado de Pago RECHAZADO ya no puede reemplazarse (restricción única faena+periodo): falta el procedimiento de reemplazo/anulación. |
| AUD-021 | P3 | low | La UI de bodega muestra «editar ítem» a roles que ahora no pueden (solo ADMINISTRADOR y BODEGA). |

## Procesos que funcionan correctamente (verificados)
- **Aislamiento de faena:** anular OT, cambiar estado, movimientos de bodega, horómetro, estado de equipo, informes, repuestos, usuarios, mano de obra y equipos bloquean el acceso entre faenas.
- **Roles:** matriz aplicada en el backend (Jefe crea solo PLANIFICADOR/MECANICO/BODEGA/COMPRAS/OPERADOR; Central solo roles de faena; solo ADMINISTRADOR otorga roles centrales/GERENCIA; nadie eleva su propio rol).
- **Ciclo de la OT:** reporte de falla → detención pendiente de validación → OT → técnico → bitácora → repuesto → autorización → entrega FIFO → EN_VALIDACION → validación técnica → cierre → reapertura con motivo y auditoría.
- **Bodega:** salida mayor al stock rechazada, salidas simultáneas sin stock negativo, devoluciones y ajustes mantienen lotes = stock, costo del repuesto = costo FIFO.
- **Estado de Pago:** solo roles centrales preparan; solo ADMINISTRADOR/GERENCIA aprueban; sin doble aprobación; ajuste sobre EP aprobado bloqueado; el cálculo con detención sigue exacto (12/12 líneas de SIM-01).
- **Inspecciones:** todo OK no genera alertas; un hallazgo crítico crea alerta, reporte de falla y detiene el equipo pendiente de validación; operador no gestiona alertas.
- **SR y compras:** flujo Bodega Central → Adquisiciones → llegada → entrega con historial de fechas; solo roles autorizados cambian estados; compra directa exige motivo y rol; regularizar exige compra directa marcada. Los correos quedan en cola (outbox) y la auditoría no envió ninguno.
- **Mantención:** OT preventiva duplicada rechazada; plan solo por roles autorizados.
- **Interfaz:** 24/24 pantallas sin desborde ni errores de consola a 390/768/1440 px; rutas restringidas redirigen al operador; los 79 tests base pasan en UTC y America/Santiago.

## Decisiones de negocio ya tomadas (implementadas)
Matriz de roles, administración de usuarios, máquina de estados de OT, Estado de Pago terminal y política de horómetro: ver `docs/REGLAS_NEGOCIO.md`.

## Decisiones pendientes
1. Mínimo de cotizaciones para regularizar una compra directa y si puede corregirse una regularización.
2. Procedimiento de anulación/reemplazo de Estado de Pago aprobado o rechazado (motivo, documento reemplazante, auditoría).
3. Máquina de estados de la SR (qué retrocesos se permiten, si los hay).
4. ¿Un hallazgo crítico repetido agrega información al mismo reporte o crea uno nuevo?
5. Umbral de salto de horómetro por faena/equipo (hoy 3 por hora real).

## Propuesta de PR siguiente (`risk:high`, uno solo)
Cierra AUD-013, 014, 015, 016, 018 (y 017/019 según las decisiones):
- `crearInspeccion`: validar faena del equipo y de la plantilla, transacción única, no duplicar el reporte de falla crítico abierto del mismo equipo.
- `generarOTDesdeAlerta`: idempotente (una OT por alerta).
- `cambiarEstadoSR`: máquina de estados, salida por `salidaStockFIFO` en la misma transacción y condición en el UPDATE.
- `regularizarCompraDirecta`: cotizaciones mínimas y no repetible.
- Tests: batería `auditoria/inspeccion-compras.audit.ts` convertida en pruebas con resultado BLOQUEADO esperado, más pruebas por rol y faena.

## Agente Planificador (análisis privado, sin implementar)
- **Tareas repetitivas:** priorizar reportes de falla, sugerir técnico según especialidad y carga, avisar preventivos por horómetro, detectar OT detenidas esperando repuestos, agrupar alertas de inspección de un mismo equipo.
- **Alertas predictivas:** equipos con fallas recurrentes, stock crítico contra consumo, riesgo de superar la fecha comprometida, lecturas de horómetro pendientes de confirmar.
- **Datos necesarios:** historial de OT y estados, horómetros confirmados, stock y consumos FIFO, carga por técnico, tiempos por etapa de SR.
- **Borradores de decisión:** propuesta de asignación, pedido de compra sugerido, agenda de preventivos, cierre de alertas duplicadas.
- **Siempre con aprobación humana:** asignar, cerrar, reabrir, anular, comprar, aprobar o ajustar Estados de Pago, cambiar roles y confirmar saltos de horómetro.
- **Explicación y confianza:** cada sugerencia muestra sus datos de origen y un nivel de confianza; sin datos suficientes no propone.

## Confirmación de producción
Ningún script ni prueba se ejecutó contra producción: todos usan `impedirEjecucionEnProduccion()` y la base local apunta a `erp_minera_dev`. No hubo migraciones ni cambios de configuración. No se envió ningún correo ni WhatsApp. El Estado de Pago productivo histórico ($0) no se modificó. Las únicas acciones sobre producción fueron los despliegues automáticos por fusión a `main` y una lectura de la página `/login`.

## Cierre de AUD-013 a AUD-019 (PR #11)

Todos quedan **BLOQUEADOS o CORRECTOS** (evidencia en `docs/evidencia-auditoria/tras-pr11/`): AUD-013 inspección entre faenas bloqueada; AUD-014 SR con máquina de estados y descuento FIFO único; AUD-015 una alerta = una OT; AUD-016 reporte crítico idempotente y nueva inspección marcada como reincidencia; AUD-017 regularización con comprobante, motivo, ≥1 cotización, aprobación central sobre el límite e idempotente; AUD-018 inspección transaccional; AUD-019 bitácora rechaza estados inválidos con mensaje.

**Revisiones independientes** (dos revisores en contexto separado):
- *Retrospectiva de #8:* sin P0. P1 corregido en #11: `cambiarEstadoOT` no validaba rol (ahora gestión o mecánico asignado). P2 corregido: ítems de bodega de la bitácora validados por faena. Quedan como P2 conocidos: un JEFE_TALLER/central no puede editar su propio usuario (falta vía de autoedición de perfil), `solicitarRepuesto` abierto a cualquier rol de la faena y algunos cambios de estado de repuestos sin candado atómico.
- *De #11:* sin P0. P1 corregidos: el monto de la regularización lo informa el cliente (ahora se controla con el mayor entre lo informado y lo estimado en la SR, y la aprobación central fija el monto tope) y timeout de 20 s en las transacciones largas. Pendiente: no existe pantalla para regularizar/aprobar compras directas (solo API); la reincidencia entre dos inspecciones simultáneas con claves distintas no es atómica (impacto bajo).

**Pendiente por decisión:** reemplazo de un Estado de Pago rechazado (nueva versión vinculada), configuración del límite de compra directa por faena (valor inicial provisorio: $500.000, `src/lib/compra-directa.ts`) y del umbral de horómetro por faena/equipo.
