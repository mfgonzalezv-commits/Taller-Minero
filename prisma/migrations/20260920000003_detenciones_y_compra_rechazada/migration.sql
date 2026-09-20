-- Aditiva: episodios de detención (con o sin OT) y datos de la compra directa (monto estimado, motivo de rechazo de la aprobación).
CREATE TABLE "detenciones_equipo" (
  "id" TEXT NOT NULL,
  "equipo_id" TEXT NOT NULL,
  "faena_id" TEXT NOT NULL,
  "inicio" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "fin" TIMESTAMP(3),
  "origen" TEXT NOT NULL DEFAULT 'ESTADO',
  "ot_id" TEXT,
  "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "detenciones_equipo_pkey" PRIMARY KEY ("id")
);
CREATE INDEX "detenciones_equipo_equipo_id_inicio_idx" ON "detenciones_equipo"("equipo_id", "inicio");
-- A lo más un episodio ABIERTO por equipo (protege contra dos aperturas simultáneas).
CREATE UNIQUE INDEX "detenciones_equipo_abierta_por_equipo" ON "detenciones_equipo"("equipo_id") WHERE "fin" IS NULL;

ALTER TABLE "solicitudes_repuesto" ADD COLUMN "monto_estimado_compra" DECIMAL(14,2), ADD COLUMN "motivo_rechazo_aprobacion" TEXT;
