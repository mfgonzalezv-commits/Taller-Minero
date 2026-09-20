-- Migración de las decisiones operacionales (San Ramón). Solo agrega columnas/tablas nulables o con valor por defecto.
-- ÚNICO cambio no puramente aditivo: el índice único de estados_pago se AMPLÍA para incluir la versión
-- (no se borra ni modifica ningún dato); un índice parcial garantiza un solo documento vigente por periodo.

-- Turnos
ALTER TABLE "usuarios" ADD COLUMN "sistema_turno" TEXT, ADD COLUMN "grupo_turno" TEXT;

-- Estados de Pago: versionado y anulación
ALTER TYPE "estado_estado_pago" ADD VALUE IF NOT EXISTS 'ANULADO';
ALTER TABLE "estados_pago"
  ADD COLUMN "version" INTEGER NOT NULL DEFAULT 1,
  ADD COLUMN "version_anterior_id" TEXT,
  ADD COLUMN "motivo_anulacion" TEXT,
  ADD COLUMN "anulado_por_id" TEXT,
  ADD COLUMN "fecha_anulacion" TIMESTAMP(3),
  ADD COLUMN "diferencias_con_anterior" JSONB;
DROP INDEX "estados_pago_faena_id_periodo_inicio_key";
CREATE UNIQUE INDEX "estados_pago_faena_id_periodo_inicio_version_key" ON "estados_pago"("faena_id", "periodo_inicio", "version");
-- Un solo documento vigente (borrador/preparado/aprobado) por faena y periodo; rechazados y anulados no cuentan.
CREATE UNIQUE INDEX "estados_pago_vigente_por_periodo" ON "estados_pago"("faena_id", "periodo_inicio") WHERE "estado" IN ('BORRADOR', 'PREPARADO', 'APROBADO');

-- Compras: solicitud de aprobación central
ALTER TABLE "solicitudes_repuesto"
  ADD COLUMN "aprobacion_solicitada_at" TIMESTAMP(3),
  ADD COLUMN "aprobacion_solicitada_por_id" TEXT,
  ADD COLUMN "monto_solicitado" DECIMAL(14,2);

-- Pautas: versionado con aprobación (las existentes quedan APROBADA, versión 1)
ALTER TABLE "pautas_mantenimiento"
  ADD COLUMN "version" INTEGER NOT NULL DEFAULT 1,
  ADD COLUMN "estado_aprobacion" TEXT NOT NULL DEFAULT 'APROBADA',
  ADD COLUMN "pauta_anterior_id" TEXT,
  ADD COLUMN "creada_por_id" TEXT,
  ADD COLUMN "aprobada_por_id" TEXT,
  ADD COLUMN "fecha_aprobacion" TIMESTAMP(3),
  ADD COLUMN "motivo_cambio" TEXT;

-- Ajustes manuales de stock (solicitud + aprobación)
CREATE TABLE "solicitudes_ajuste_stock" (
  "id" TEXT NOT NULL,
  "faena_id" TEXT NOT NULL,
  "item_id" TEXT NOT NULL,
  "cantidad_actual" DECIMAL(10,2) NOT NULL,
  "cantidad_nueva" DECIMAL(10,2) NOT NULL,
  "motivo" TEXT NOT NULL,
  "estado" TEXT NOT NULL DEFAULT 'PENDIENTE',
  "solicitado_por_id" TEXT NOT NULL,
  "resuelto_por_id" TEXT,
  "motivo_resolucion" TEXT,
  "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "resuelto_at" TIMESTAMP(3),
  CONSTRAINT "solicitudes_ajuste_stock_pkey" PRIMARY KEY ("id")
);
CREATE INDEX "solicitudes_ajuste_stock_faena_id_estado_idx" ON "solicitudes_ajuste_stock"("faena_id", "estado");

-- Notificaciones internas
CREATE TABLE "notificaciones" (
  "id" TEXT NOT NULL,
  "faena_id" TEXT,
  "rol_destino" TEXT NOT NULL,
  "usuario_id" TEXT,
  "tipo" TEXT NOT NULL,
  "nivel" INTEGER NOT NULL DEFAULT 0,
  "entidad" TEXT,
  "entidad_id" TEXT,
  "titulo" TEXT NOT NULL,
  "mensaje" TEXT NOT NULL,
  "clave_unica" TEXT NOT NULL,
  "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "leida_at" TIMESTAMP(3),
  CONSTRAINT "notificaciones_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX "notificaciones_clave_unica_key" ON "notificaciones"("clave_unica");
CREATE INDEX "notificaciones_rol_destino_faena_id_leida_at_idx" ON "notificaciones"("rol_destino", "faena_id", "leida_at");
