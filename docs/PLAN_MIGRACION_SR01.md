# Plan de migración — decisiones operacionales (SR-01)

Migraciones: `20260920000000_decisiones_operacionales`, `20260920000001_ajuste_stock_pendiente_unico`, `20260920000002_liberaciones_equipo`. **No aplicadas en producción.**

## Verificaciones ya hechas (solo lectura)
- Producción: **PostgreSQL 17.11** (≥ 12 requerido por `ALTER TYPE … ADD VALUE`).
- `scripts/verificar-migracion-previa.ts` sobre producción: sin tablas/índices/columnas previos y **sin duplicados** que impidan los índices; filas existentes: 1 Estado de Pago, 0 SR, 156 pautas, 4 usuarios (ninguna se modifica).
- Prueba sobre una base descartable con el esquema de producción anterior y datos equivalentes (incluye un Estado de Pago APROBADO con neto $0 y otro RECHAZADO): las tres migraciones se aplican, el documento $0 queda intacto, el índice parcial bloquea un segundo vigente del mismo periodo y permite la versión 2 tras un rechazado, y la reversión + re-aplicación funcionan. La base de prueba se eliminó.
- **Limitación:** no había acceso a Neon para crear una rama/restauración de la base real; esa prueba exacta queda para el paso previo a la aplicación (ver abajo).

## Antes de aplicar (una sola aprobación conjunta)
1. Respaldo: rama Neon `respaldo-pre-decisiones-AAAAMMDD` desde «ahora» y verificación con `scripts/verificar-restauracion.ts` (ver `docs/RESPALDO_Y_RESTAURACION.md`).
2. Probar las 3 migraciones en una **segunda rama** creada desde esa restauración (`DATABASE_URL` apuntando a la rama): `npx prisma migrate deploy`, luego `scripts/verificar-migracion-previa.ts` no aplica (ya migrada) → usar `npx prisma migrate status` y las baterías de humo.
3. Repetir `scripts/verificar-migracion-previa.ts` contra producción (debe salir ✅).
4. **Orden:** aplicar las migraciones en producción (`railway run --service Taller-Minero -- npx prisma migrate deploy`) ANTES de desplegar el código nuevo (el código anterior tolera columnas y tablas extra; el nuevo las necesita).
5. Fusionar el PR, verificar despliegue y `/login`, y activar el cron.

## Reversión
- Si la migración falla: es transaccional por archivo; no queda nada a medias (revisar `_prisma_migrations`).
- Si ya se aplicó y hay que volver: desplegar el código anterior y ejecutar `prisma/rollback/20260920_decisiones_operacionales_down.sql` (descarta solo los datos NUEVOS de estas funciones; el valor `ANULADO` del enum queda sin uso). Alternativa: restaurar la rama de respaldo y apuntar `DATABASE_URL` de Railway a ella.
