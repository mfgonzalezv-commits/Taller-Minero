-- Migración ADITIVA (sin borrar ni modificar datos existentes).
-- Idempotencia de inspecciones, reincidencia de reportes y respaldo de regularización de compra directa.

-- AlterTable
ALTER TABLE "inspecciones_diarias" ADD COLUMN     "clave_idempotencia" TEXT;

-- AlterTable
ALTER TABLE "reportes_falla" ADD COLUMN     "reincidencia_de_id" TEXT;

-- AlterTable
ALTER TABLE "solicitudes_repuesto" ADD COLUMN     "comprobante_regularizacion" TEXT,
ADD COLUMN     "motivo_regularizacion" TEXT,
ADD COLUMN     "monto_compra_directa" DECIMAL(14,2),
ADD COLUMN     "aprobada_central_por_id" TEXT,
ADD COLUMN     "fecha_aprobacion_central" TIMESTAMP(3);

-- CreateIndex (varios NULL permitidos: solo dedupica cuando hay clave)
CREATE UNIQUE INDEX "inspecciones_diarias_faena_id_clave_idempotencia_key" ON "inspecciones_diarias"("faena_id", "clave_idempotencia");
