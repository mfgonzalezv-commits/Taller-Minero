-- Aditiva: registro de cada liberación operacional de un equipo (base del cálculo de detención del Estado de Pago).
CREATE TABLE "liberaciones_equipo" (
  "id" TEXT NOT NULL,
  "equipo_id" TEXT NOT NULL,
  "faena_id" TEXT NOT NULL,
  "liberado_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "liberado_por_id" TEXT NOT NULL,
  "motivo" TEXT,
  "tipo" TEXT NOT NULL DEFAULT 'LIBERACION',
  "ot_id" TEXT,
  CONSTRAINT "liberaciones_equipo_pkey" PRIMARY KEY ("id")
);
CREATE INDEX "liberaciones_equipo_equipo_id_liberado_at_idx" ON "liberaciones_equipo"("equipo_id", "liberado_at");
