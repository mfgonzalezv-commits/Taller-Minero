-- Migración ADITIVA: vincula el reporte de falla con la inspección que lo originó.
ALTER TABLE "reportes_falla" ADD COLUMN     "inspeccion_id" TEXT;
