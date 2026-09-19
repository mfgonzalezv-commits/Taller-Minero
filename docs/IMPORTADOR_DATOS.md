# Importador de datos reales

Carga faena, usuarios, equipos, asignaciones (con tarifas), ítems de bodega y lotes iniciales desde planillas CSV. **Solo inserta**: nunca actualiza ni borra. Es el mismo mecanismo para desarrollo y producción.

## Planillas
Están en `plantillas-carga/` (una fila que empieza con `#` es ayuda y se ignora). Un ejemplo ficticio completo está en `plantillas-carga/ejemplo-piloto/`. Guarda desde Excel como **CSV UTF-8** (`;` o `,`).

| Archivo | Qué carga | Notas |
|---|---|---|
| `faenas.csv` | la faena | código único (ej. `PIL-01`) |
| `usuarios.csv` | usuarios y roles; los `MECANICO` crean además su técnico (especialidades, turno, tarifa hora) | `password_temporal` vacía = se genera una segura |
| `equipos.csv` | equipos | costo de detención por hora y horómetro inicial |
| `asignaciones.csv` | arriendo y **tarifas**: modalidad HORA/DIA/MES, tarifa, regla de descuento, política de prorrateo | sin solapes por equipo |
| `items_bodega.csv` | ítems del maestro con `stock_actual` | debe ser igual a la suma de sus lotes |
| `lotes.csv` | lotes iniciales: referencia (factura/guía), cantidad, costo, fecha | todo stock inicial necesita lotes |

Números sin separador de miles (`18500`, no `18.500`): un separador ambiguo se rechaza porque cambiaría precios y stock en silencio. Fechas `AAAA-MM-DD` o `DD-MM-AAAA`.

## Qué valida (antes de escribir)
Columnas obligatorias; duplicados (correos, equipos, ítems, lotes); roles, tipos y modalidades inválidos; referencias inexistentes (equipo de una asignación, ítem de un lote); asignaciones solapadas (en la planilla y contra la base); valores negativos o cero donde no corresponde; fechas futuras; **stock sin lotes**; **stock distinto de la suma de lotes**; filas de otra faena. Genera advertencias (no bloquean): roles centrales, mecánico sin tarifa, asignación sin regla de descuento, ítem bajo su mínimo.

## Uso
```
# 1. Dry-run (por defecto; solo lectura; escribe el informe en scripts/salida/)
npx tsx scripts/importar-datos.ts --dir <carpeta> --faena PIL-01

# 2. Carga real (exige TODO esto)
npx tsx scripts/importar-datos.ts --dir <carpeta> --faena PIL-01 --apply \
    --base erp_minera_dev --confirmo "CARGAR PIL-01 EN erp_minera_dev"
```
- Sin `--apply` no se escribe nada. Con `--apply` se exige la faena, la base explícita (debe coincidir con la conectada) y la frase exacta.
- **Producción (`erp_minera`)** además exige la variable `IMPORTADOR_PRODUCCION_AUTORIZADO=SI`, que solo se define con la aprobación del propietario.
- Todo se inserta en **una transacción**; antes de confirmar verifica que stock = suma de lotes en cada ítem. Cualquier falla revierte todo.
- **Idempotente**: repetir la carga informa "sin cambios" y no escribe. Lo que ya existe y difiere es un *conflicto* (error): se corrige desde la aplicación, no reimportando.
- Al cargar, cada lote genera su movimiento de ENTRADA («Carga inicial») con la fecha de recepción, de modo que el historial y el FIFO quedan como si el stock hubiera entrado normalmente.
- Las contraseñas generadas se escriben en `scripts/salida/credenciales-<FAENA>.csv` (ignorado por git). Entrégalas por un canal seguro y borra el archivo.

## Flujo para producción (una sola aprobación)
1. Se completan las planillas reales.
2. Se ejecuta el **dry-run contra producción** (solo lectura) y se revisa el informe.
3. Se aprueba conjuntamente: respaldo verificado (`docs/RESPALDO_Y_RESTAURACION.md`) + carga real + comprobación posterior (`scripts/monitoreo.ts` y `scripts/verificar-restauracion.ts`).

## Validado en desarrollo
`auditoria/simulacro-piloto.audit.ts` carga la faena ficticia `PIL-01` con este mismo importador y opera con los cinco roles (58 verificaciones): dry-run sin escritura, rechazo sin confirmación o con base equivocada, carga, idempotencia, conflicto, rollback (fila inválida y falla a mitad de la escritura), OT, horómetro, FIFO entre lotes, alertas, permisos y Estado de Pago, y al final stock = suma de lotes.
