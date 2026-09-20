-- REVERSIÓN de las migraciones 20260920000000, 20260920000001 y 20260920000002.
-- NO forma parte de prisma/migrations (no se aplica sola). Ejecutar solo con el código anterior desplegado y, de ser posible, tras un respaldo.
-- Descarta los datos NUEVOS de estas funciones (versiones de Estado de Pago, ajustes, notificaciones, liberaciones, pautas propuestas).
-- El valor 'ANULADO' del enum estado_estado_pago NO se puede quitar en PostgreSQL: queda sin uso (inofensivo).
BEGIN;
-- Estados de Pago: solo se puede volver al índice único (faena, periodo) si hay a lo más un documento por periodo.
-- Antes: eliminar las versiones > 1 (rechazadas/anuladas reemplazadas) y las anuladas si se acepta perderlas.
DELETE FROM estado_pago_lineas WHERE estado_pago_id IN (SELECT id FROM estados_pago WHERE version > 1);
DELETE FROM estados_pago WHERE version > 1;
DROP INDEX IF EXISTS estados_pago_vigente_por_periodo;
DROP INDEX IF EXISTS estados_pago_faena_id_periodo_inicio_version_key;
CREATE UNIQUE INDEX estados_pago_faena_id_periodo_inicio_key ON estados_pago (faena_id, periodo_inicio);
ALTER TABLE estados_pago DROP COLUMN IF EXISTS version, DROP COLUMN IF EXISTS version_anterior_id, DROP COLUMN IF EXISTS motivo_anulacion, DROP COLUMN IF EXISTS anulado_por_id, DROP COLUMN IF EXISTS fecha_anulacion, DROP COLUMN IF EXISTS diferencias_con_anterior;

ALTER TABLE usuarios DROP COLUMN IF EXISTS sistema_turno, DROP COLUMN IF EXISTS grupo_turno;
ALTER TABLE solicitudes_repuesto DROP COLUMN IF EXISTS aprobacion_solicitada_at, DROP COLUMN IF EXISTS aprobacion_solicitada_por_id, DROP COLUMN IF EXISTS monto_solicitado;
ALTER TABLE pautas_mantenimiento DROP COLUMN IF EXISTS version, DROP COLUMN IF EXISTS estado_aprobacion, DROP COLUMN IF EXISTS pauta_anterior_id, DROP COLUMN IF EXISTS creada_por_id, DROP COLUMN IF EXISTS aprobada_por_id, DROP COLUMN IF EXISTS fecha_aprobacion, DROP COLUMN IF EXISTS motivo_cambio;
DROP TABLE IF EXISTS solicitudes_ajuste_stock;
DROP TABLE IF EXISTS notificaciones;
DROP TABLE IF EXISTS liberaciones_equipo;
-- Registro de Prisma: para poder volver a aplicar más adelante
DELETE FROM _prisma_migrations WHERE migration_name IN ('20260920000000_decisiones_operacionales', '20260920000001_ajuste_stock_pendiente_unico', '20260920000002_liberaciones_equipo');
COMMIT;
