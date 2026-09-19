# Respaldo y prueba de restauración (Neon)

Objetivo: antes de la carga real, comprobar que **se puede restaurar** y saber cuánto se demora. La prueba se hace en una **rama separada de Neon**; no se modifica ni restaura producción.

> Esta prueba está documentada y su script de verificación probado en desarrollo (snapshot y verificación contra sí mismo). La restauración real en Neon debe ejecutarla el propietario o quien tenga acceso a la consola de Neon, porque requiere credenciales de esa cuenta.

## Procedimiento
1. **Anotar la hora T** y guardar la foto de origen (solo lectura):
   `railway run --service Taller-Minero -- npx tsx scripts/verificar-restauracion.ts --snapshot snapshot-prod-T.json`
2. En la consola de Neon (proyecto de `erp_minera`): *Branches → Create branch* → **Point in time**, hora T (o «Now»), nombre `prueba-restauracion-AAAAMMDD`. Anotar cuánto tarda.
3. Copiar la cadena de conexión de **esa rama** (nunca la de producción) y apuntar `DATABASE_URL` a ella solo en tu terminal.
4. Verificar contra la foto:
   `DATABASE_URL="<rama>" npx tsx scripts/verificar-restauracion.ts --verificar snapshot-prod-T.json`
   Debe imprimir «La base restaurada coincide con el snapshot» (conteos por tabla y sumas de control; y que stock = suma de lotes).
5. Prueba funcional: levantar la app local con esa `DATABASE_URL` y entrar con un usuario, abrir una OT y el dashboard.
6. **Eliminar la rama de prueba** en Neon y borrar el snapshot local.

## Antes de la carga real (checklist)
- [ ] Rama de respaldo creada justo antes de cargar (`respaldo-pre-carga-AAAAMMDD`) y verificada con los pasos 4–5.
- [ ] Tiempo de restauración medido y anotado: ___ min.
- [ ] Ventana de carga acordada; nadie operando en el sistema.
- [ ] Dry-run de producción aprobado.

## Reversión si la carga sale mal
1. La carga es una transacción: si falla, no queda nada a medias (no hace falta restaurar).
2. Si la carga terminó pero hay que revertir: como solo **inserta** datos de una faena nueva, se puede borrar esa faena por completo con un script dedicado revisado en ese momento, o restaurar la rama `respaldo-pre-carga` y apuntar la aplicación a ella (cambiar `DATABASE_URL` en Railway). Elegir según haya datos operativos posteriores a la carga.
3. Documentar el incidente y volver a ejecutar el dry-run antes de reintentar.

## Después de la carga
`scripts/monitoreo.ts --faena <CODIGO>` debe salir sin diferencias de stock ni alertas, y `scripts/verificar-restauracion.ts --snapshot` se guarda como nueva foto de referencia.
