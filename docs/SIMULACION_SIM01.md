# Simulación SIM-01 (3 meses, solo `erp_minera_dev`)

`scripts/simulacion-tres-meses.ts` **crea el escenario**; no ejecuta los procesos reales de
Taller Minero. La auditoría posterior es la que corre esos procesos y los compara con lo esperado.

- Datos 100% ficticios, faena `SIM-01`, 26-jun a 25-sep-2026. Semilla fija e IDs deterministas.
- Protegido con `impedirEjecucionEnProduccion()`. `--reset` borra solo lo de `SIM-01`
  (`planLimpieza()`, todos los pasos acotados a la faena).
- Lógica pura y testeada en `src/lib/simulacion-sim01.ts` (`tests/simulacion-sim01.test.ts`).
- Se insertan **2 Estados de Pago históricos** (APROBADOS). El **3º periodo (26-ago a 25-sep) NO se
  inserta**: se prepara desde la interfaz (`prepararEstadoPago()`).
- El resultado **esperado** de los 3 periodos se escribe en `scripts/salida/esperado-sim01.json`
  (ventanas de detención recortadas al periodo y unidas; HORA = última − primera lectura del
  periodo; el horómetro no avanza mientras el equipo está detenido). Incluye
  `horasDetencionLogicaActual`: lo que produciría la regla actual de `prepararEstadoPago()`.
- Casos deterministas: OT que cruzan el 25/26 (jul y ago), OT simultáneas en un mismo equipo,
  y un equipo HORA 3 días completos detenido.
- Bodega: movimientos ENTRADA (lotes iniciales y reposiciones) y SALIDA FIFO con snapshots
  cronológicos antes/después.
