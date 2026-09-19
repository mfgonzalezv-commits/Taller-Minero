# Informe de carga — faena PIL-01 — base "erp_minera_dev" — modo DRY-RUN (solo lectura)

| Planilla | Nuevos | Sin cambios |
|---|---:|---:|
| faenas | 1 | 0 |
| usuarios | 9 | 0 |
| equipos | 6 | 0 |
| asignaciones | 5 | 0 |
| items_bodega | 12 | 0 |
| lotes | 14 | 0 |

Stock inicial a cargar: 12 ítems, 14 lotes, 669 unidades, valorizado $7.859.000

## Errores (0)
Ninguno

## Advertencias (3)
- [usuarios línea 2] admin@piloto.local tiene rol central (ADMINISTRADOR): ve y opera todas las faenas. Confirma que corresponde
- [asignaciones línea 4] EXC-01: sin regla_descuento, las detenciones no se descontarán en el Estado de Pago
- [items_bodega línea 13] BUJ-CAL-01 parte bajo su stock mínimo (0 < 2)

**Resultado: listo para cargar (`--apply`).**