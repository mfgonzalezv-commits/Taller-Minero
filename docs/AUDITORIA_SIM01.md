# Auditoría con SIM-01 — hallazgo `risk:high`: detención mal calculada en `prepararEstadoPago()`

Fecha: 2026-09-18 · Entorno: `erp_minera_dev` (faena SIM-01, datos ficticios) · Sin cambios de código.

## Método
1. El script `simulacion-tres-meses.ts` **crea el escenario** (2 Estados de Pago históricos; el 3º NO se inserta) y escribe el resultado
   esperado en `scripts/salida/esperado-sim01.json` (detención = ventanas recortadas al periodo y **unidas**).
2. El 3º periodo (26-ago a 25-sep) se preparó **por la interfaz** (`/arriendos` → "Preparar periodo actual", como `admin@sim.local`), es decir, con el flujo real
   `prepararEstadoPago()`. Captura: `docs/auditoria/sim01-arriendos-periodo3.png`.
3. Se comparó línea por línea con lo esperado.

## Qué está bien
- Periodo generado = periodo esperado (26-ago 00:00 → 25-sep 23:59:59).
- Modalidad HORA: horas trabajadas y monto bruto **coinciden exactamente** con el esperado (última − primera lectura del periodo).
- Bruto de MES y DIA coincide (tarifas y prorrateo correctos).

## Defecto confirmado (P0/P1 financiero)
`prepararEstadoPago()` (`src/actions/estadoPago.ts`) suma el `tiempoDetenidoMin` **completo** de toda OT que cruza el periodo, sin recortarlo a
`[inicio, termino]` y sin unir OT simultáneas del mismo equipo. En **9 de 12 líneas** la detención generada difiere de la esperada, y en las
9 coincide exactamente con lo que predice esa regla (`horasDetencionLogicaActual`).

Evidencia (horas de detención, periodo 3):

| Equipo | Esperado | Generado | Causa |
|---|---|---|---|
| SIM-CAM-03 | 81,19 h | 93,20 h | OT#426 (25-ago 18:00→26-ago 12:00) cuenta 18 h aunque solo 12 h caen en el periodo, **y** se superpone por completo con OT#427 (12 h dobles) |
| SIM-CAM-02 | 67,97 h | 69,98 h | OT#425 (25-ago 22:00→26-ago 10:00) cuenta 12 h; solo 10 h caen en el periodo |
| SIM-MAQ-01 (HORA) | 75,97 h | 113,97 h | dos OT abiertas simultáneas (24-sep 08:00 y 12:00) suman 41 h + 37 h en vez de la unión (≈40 h) |
| SIM-LIV-03 (DIA) | 126,28 h | 132,15 h | OT que cruza el inicio del periodo se cuenta completa |
| SIM-CAM-01, CAM-05, LIV-01 | +1,0 h c/u | | OT cruzando el 25/26 contadas completas |

Impacto económico (solo líneas MES/DIA, descuento al 100 %): descuento total generado **5.426.056** vs esperado **5.208.293** → se descuentan
**217.763 CLP de más** en este periodo (neto 115.322.444 vs 115.540.207). En HORA no hay descuento, pero la columna de horas de detención sale inflada.
Diferencias de ±0,01 h (p. ej. CAM-04, MAQ-04) son redondeo a minutos de la OT vs. el límite 23:59:59; no son el defecto.

## Recomendación (NO aplicada)
Calcular la detención por equipo como la **unión** de las ventanas `[creación, término técnico (o fin del periodo si sigue abierta)]`
**recortadas a `[inicio, termino]`**, en vez de sumar `tiempoDetenidoMin`. Existe una implementación de referencia y probada en
`src/lib/simulacion-sim01.ts` (`minutosDetencionEnPeriodo`, `unirIntervalos`).

## Clasificación y autorización
`risk:high` (Estado de Pago / cálculo de costos). Requiere **autorización explícita del propietario** antes de modificar `prepararEstadoPago()`,
con pruebas nuevas (periodo cruzado, OT simultáneas, OT abiertas) y comparación contra `esperado-sim01.json`.
Pendiente aparte: el Estado de Pago del periodo 3 quedó preparado (PREPARADO) en `erp_minera_dev`; no está aprobado ni es un documento oficial.
