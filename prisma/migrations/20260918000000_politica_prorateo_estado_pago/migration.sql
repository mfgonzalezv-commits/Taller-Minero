-- CreateEnum
CREATE TYPE "politica_prorateo" AS ENUM ('DIAS_REALES', 'BASE_30');

-- AlterTable
ALTER TABLE "asignaciones_equipo_faena" ADD COLUMN     "politica_prorateo" "politica_prorateo" NOT NULL DEFAULT 'DIAS_REALES';

