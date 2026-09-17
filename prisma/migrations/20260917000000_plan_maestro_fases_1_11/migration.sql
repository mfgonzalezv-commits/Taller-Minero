
-- CreateEnum
CREATE TYPE "criticidad_item_bodega" AS ENUM ('BAJA', 'MEDIA', 'ALTA');

-- CreateEnum
CREATE TYPE "modalidad_arriendo" AS ENUM ('HORA', 'DIA', 'MES');

-- CreateEnum
CREATE TYPE "estado_reporte_falla" AS ENUM ('PENDIENTE', 'EVALUADO', 'CONVERTIDO_OT', 'CERRADO_SIN_OT');

-- CreateEnum
CREATE TYPE "estado_envio_correo" AS ENUM ('PENDIENTE', 'ENVIADO', 'ERROR');

-- CreateEnum
CREATE TYPE "estado_estado_pago" AS ENUM ('BORRADOR', 'PREPARADO', 'APROBADO', 'RECHAZADO');

-- CreateEnum
CREATE TYPE "estado_compromiso" AS ENUM ('PENDIENTE', 'CUMPLIDO', 'ATRASADO');

-- AlterEnum
-- This migration adds more than one value to an enum.
-- With PostgreSQL versions 11 and earlier, this is not possible
-- in a single migration. This can be worked around by creating
-- multiple migrations, each migration adding only one value to
-- the enum.


ALTER TYPE "rol_usuario" ADD VALUE 'JEFE_TALLER_CENTRAL';
ALTER TYPE "rol_usuario" ADD VALUE 'PLANIFICADOR_CENTRAL';

-- AlterEnum
-- This migration adds more than one value to an enum.
-- With PostgreSQL versions 11 and earlier, this is not possible
-- in a single migration. This can be worked around by creating
-- multiple migrations, each migration adding only one value to
-- the enum.


ALTER TYPE "estado_equipo" ADD VALUE 'OPERATIVO_CON_OBSERVACION';
ALTER TYPE "estado_equipo" ADD VALUE 'DETENIDO_PENDIENTE_VALIDACION';
ALTER TYPE "estado_equipo" ADD VALUE 'EN_MANTENIMIENTO';

-- AlterEnum
ALTER TYPE "estado_ot" ADD VALUE 'ANULADA';

-- AlterTable
ALTER TABLE "horometro_km" ADD COLUMN     "advertencia" TEXT,
ADD COLUMN     "correccion_de_id" TEXT,
ADD COLUMN     "es_correccion" BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN     "motivo_correccion" TEXT,
ADD COLUMN     "validado" BOOLEAN;

-- AlterTable
ALTER TABLE "ordenes_trabajo" ADD COLUMN     "anulada_at" TIMESTAMP(3),
ADD COLUMN     "anulada_por_id" TEXT,
ADD COLUMN     "cerrado_por_id" TEXT,
ADD COLUMN     "fecha_validacion_tecnica" TIMESTAMP(3),
ADD COLUMN     "horometro_cierre" DECIMAL(10,1),
ADD COLUMN     "motivo_anulacion" TEXT,
ADD COLUMN     "reincidencia_confirmada" BOOLEAN,
ADD COLUMN     "validado_tecnicamente_por_id" TEXT;

-- AlterTable
ALTER TABLE "items_bodega" ADD COLUMN     "criticidad" "criticidad_item_bodega" NOT NULL DEFAULT 'MEDIA',
ADD COLUMN     "stock_maximo" DECIMAL(10,2);

-- AlterTable
ALTER TABLE "solicitudes_repuesto" ADD COLUMN     "cotizaciones" TEXT[] DEFAULT ARRAY[]::TEXT[],
ADD COLUMN     "es_compra_directa" BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN     "fecha_regularizacion" TIMESTAMP(3),
ADD COLUMN     "motivo_compra_directa" TEXT,
ADD COLUMN     "regularizada" BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN     "regularizada_por_id" TEXT;

-- CreateTable
CREATE TABLE "lotes_bodega" (
    "id" TEXT NOT NULL,
    "item_id" TEXT NOT NULL,
    "cantidad" DECIMAL(10,2) NOT NULL,
    "cantidad_saldo" DECIMAL(10,2) NOT NULL,
    "costo_unitario" DECIMAL(14,2) NOT NULL,
    "fecha_recepcion" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "documento" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "lotes_bodega_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "consumos_lote_bodega" (
    "id" TEXT NOT NULL,
    "lote_id" TEXT NOT NULL,
    "movimiento_id" TEXT NOT NULL,
    "cantidad" DECIMAL(10,2) NOT NULL,
    "costo_unitario" DECIMAL(14,2) NOT NULL,

    CONSTRAINT "consumos_lote_bodega_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "transferencias_bodega" (
    "id" TEXT NOT NULL,
    "item_origen_id" TEXT NOT NULL,
    "item_destino_id" TEXT NOT NULL,
    "faena_origen_id" TEXT NOT NULL,
    "faena_destino_id" TEXT NOT NULL,
    "cantidad" DECIMAL(10,2) NOT NULL,
    "usuario_id" TEXT,
    "observacion" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "transferencias_bodega_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "registro_auditoria" (
    "id" TEXT NOT NULL,
    "faena_id" TEXT,
    "entidad" TEXT NOT NULL,
    "entidad_id" TEXT NOT NULL,
    "accion" TEXT NOT NULL,
    "usuario_id" TEXT,
    "valor_anterior" JSONB,
    "valor_nuevo" JSONB,
    "motivo" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "registro_auditoria_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "asignaciones_equipo_faena" (
    "id" TEXT NOT NULL,
    "equipo_id" TEXT NOT NULL,
    "faena_id" TEXT NOT NULL,
    "fecha_inicio" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "fecha_termino" TIMESTAMP(3),
    "motivo" TEXT,
    "usuario_responsable_id" TEXT,
    "contrato" TEXT,
    "modalidad_arriendo" "modalidad_arriendo",
    "tarifa" DECIMAL(12,2),
    "regla_descuento_detencion" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "asignaciones_equipo_faena_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "traslados_trabajador" (
    "id" TEXT NOT NULL,
    "trabajador_id" TEXT NOT NULL,
    "faena_origen_id" TEXT NOT NULL,
    "faena_destino_id" TEXT NOT NULL,
    "fecha_inicio" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "fecha_termino" TIMESTAMP(3),
    "motivo" TEXT,
    "usuario_id" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "traslados_trabajador_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "reportes_falla" (
    "id" TEXT NOT NULL,
    "faena_id" TEXT NOT NULL,
    "equipo_id" TEXT NOT NULL,
    "reportado_por_id" TEXT NOT NULL,
    "funcion" TEXT,
    "ubicacion" TEXT,
    "descripcion" TEXT NOT NULL,
    "fotos" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "impacto_productivo" TEXT,
    "riesgo_seguridad" BOOLEAN NOT NULL DEFAULT false,
    "prioridad_sugerida" "prioridad_ot" NOT NULL,
    "prioridad" "prioridad_ot" NOT NULL,
    "justificacion_cambio_prioridad" TEXT,
    "estado" "estado_reporte_falla" NOT NULL DEFAULT 'PENDIENTE',
    "detencion_solicitada" BOOLEAN NOT NULL DEFAULT false,
    "detencion_confirmada" BOOLEAN,
    "motivo_rechazo_detencion" TEXT,
    "motivo_cierre" TEXT,
    "ot_id" TEXT,
    "fecha" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "reportes_falla_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "correos_salientes" (
    "id" TEXT NOT NULL,
    "faena_id" TEXT,
    "tipo" TEXT NOT NULL,
    "entidad_id" TEXT,
    "destinatarios" TEXT[],
    "asunto" TEXT NOT NULL,
    "cuerpo" TEXT NOT NULL,
    "adjuntos" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "estado" "estado_envio_correo" NOT NULL DEFAULT 'PENDIENTE',
    "intentos" INTEGER NOT NULL DEFAULT 0,
    "error_mensaje" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "enviado_at" TIMESTAMP(3),

    CONSTRAINT "correos_salientes_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "estados_pago" (
    "id" TEXT NOT NULL,
    "faena_id" TEXT NOT NULL,
    "periodo_inicio" TIMESTAMP(3) NOT NULL,
    "periodo_termino" TIMESTAMP(3) NOT NULL,
    "estado" "estado_estado_pago" NOT NULL DEFAULT 'BORRADOR',
    "preparado_por_id" TEXT,
    "aprobado_por_id" TEXT,
    "fecha_aprobacion" TIMESTAMP(3),
    "motivo_rechazo" TEXT,
    "total_bruto" DECIMAL(14,2) NOT NULL DEFAULT 0,
    "total_descuentos" DECIMAL(14,2) NOT NULL DEFAULT 0,
    "total_ajustes" DECIMAL(14,2) NOT NULL DEFAULT 0,
    "total_neto" DECIMAL(14,2) NOT NULL DEFAULT 0,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "estados_pago_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "estado_pago_lineas" (
    "id" TEXT NOT NULL,
    "estado_pago_id" TEXT NOT NULL,
    "equipo_id" TEXT NOT NULL,
    "asignacion_id" TEXT,
    "modalidad" "modalidad_arriendo" NOT NULL,
    "tarifa" DECIMAL(12,2) NOT NULL,
    "cantidad_unidades" DECIMAL(10,2) NOT NULL,
    "monto_bruto" DECIMAL(14,2) NOT NULL,
    "horas_detencion" DECIMAL(10,2) NOT NULL DEFAULT 0,
    "descuento_detencion" DECIMAL(14,2) NOT NULL DEFAULT 0,
    "monto_neto" DECIMAL(14,2) NOT NULL,

    CONSTRAINT "estado_pago_lineas_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ajustes_estado_pago_linea" (
    "id" TEXT NOT NULL,
    "linea_id" TEXT NOT NULL,
    "monto" DECIMAL(14,2) NOT NULL,
    "motivo" TEXT NOT NULL,
    "usuario_id" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ajustes_estado_pago_linea_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "compromisos" (
    "id" TEXT NOT NULL,
    "faena_id" TEXT NOT NULL,
    "descripcion" TEXT NOT NULL,
    "responsable_id" TEXT,
    "fecha_limite" TIMESTAMP(3) NOT NULL,
    "estado" "estado_compromiso" NOT NULL DEFAULT 'PENDIENTE',
    "origen_reunion" TEXT,
    "creado_por_id" TEXT,
    "fecha_cumplido" TIMESTAMP(3),
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "compromisos_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "destinatarios_informe" (
    "id" TEXT NOT NULL,
    "faena_id" TEXT,
    "tipo" TEXT NOT NULL,
    "email" TEXT NOT NULL,
    "activo" BOOLEAN NOT NULL DEFAULT true,

    CONSTRAINT "destinatarios_informe_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "lotes_bodega_item_id_fecha_recepcion_idx" ON "lotes_bodega"("item_id", "fecha_recepcion");

-- CreateIndex
CREATE INDEX "registro_auditoria_entidad_entidad_id_idx" ON "registro_auditoria"("entidad", "entidad_id");

-- CreateIndex
CREATE INDEX "registro_auditoria_faena_id_idx" ON "registro_auditoria"("faena_id");

-- CreateIndex
CREATE INDEX "asignaciones_equipo_faena_equipo_id_fecha_termino_idx" ON "asignaciones_equipo_faena"("equipo_id", "fecha_termino");

-- CreateIndex
CREATE INDEX "reportes_falla_faena_id_estado_idx" ON "reportes_falla"("faena_id", "estado");

-- CreateIndex
CREATE INDEX "correos_salientes_faena_id_estado_idx" ON "correos_salientes"("faena_id", "estado");

-- CreateIndex
CREATE UNIQUE INDEX "estados_pago_faena_id_periodo_inicio_key" ON "estados_pago"("faena_id", "periodo_inicio");

-- AddForeignKey
ALTER TABLE "horometro_km" ADD CONSTRAINT "horometro_km_correccion_de_id_fkey" FOREIGN KEY ("correccion_de_id") REFERENCES "horometro_km"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ordenes_trabajo" ADD CONSTRAINT "ordenes_trabajo_anulada_por_id_fkey" FOREIGN KEY ("anulada_por_id") REFERENCES "usuarios"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ordenes_trabajo" ADD CONSTRAINT "ordenes_trabajo_validado_tecnicamente_por_id_fkey" FOREIGN KEY ("validado_tecnicamente_por_id") REFERENCES "usuarios"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ordenes_trabajo" ADD CONSTRAINT "ordenes_trabajo_cerrado_por_id_fkey" FOREIGN KEY ("cerrado_por_id") REFERENCES "usuarios"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "lotes_bodega" ADD CONSTRAINT "lotes_bodega_item_id_fkey" FOREIGN KEY ("item_id") REFERENCES "items_bodega"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "consumos_lote_bodega" ADD CONSTRAINT "consumos_lote_bodega_lote_id_fkey" FOREIGN KEY ("lote_id") REFERENCES "lotes_bodega"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "consumos_lote_bodega" ADD CONSTRAINT "consumos_lote_bodega_movimiento_id_fkey" FOREIGN KEY ("movimiento_id") REFERENCES "movimientos_bodega"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "transferencias_bodega" ADD CONSTRAINT "transferencias_bodega_item_origen_id_fkey" FOREIGN KEY ("item_origen_id") REFERENCES "items_bodega"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "transferencias_bodega" ADD CONSTRAINT "transferencias_bodega_item_destino_id_fkey" FOREIGN KEY ("item_destino_id") REFERENCES "items_bodega"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "transferencias_bodega" ADD CONSTRAINT "transferencias_bodega_usuario_id_fkey" FOREIGN KEY ("usuario_id") REFERENCES "usuarios"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "solicitudes_repuesto" ADD CONSTRAINT "solicitudes_repuesto_regularizada_por_id_fkey" FOREIGN KEY ("regularizada_por_id") REFERENCES "usuarios"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "registro_auditoria" ADD CONSTRAINT "registro_auditoria_faena_id_fkey" FOREIGN KEY ("faena_id") REFERENCES "faenas"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "registro_auditoria" ADD CONSTRAINT "registro_auditoria_usuario_id_fkey" FOREIGN KEY ("usuario_id") REFERENCES "usuarios"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "asignaciones_equipo_faena" ADD CONSTRAINT "asignaciones_equipo_faena_equipo_id_fkey" FOREIGN KEY ("equipo_id") REFERENCES "equipos"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "asignaciones_equipo_faena" ADD CONSTRAINT "asignaciones_equipo_faena_faena_id_fkey" FOREIGN KEY ("faena_id") REFERENCES "faenas"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "asignaciones_equipo_faena" ADD CONSTRAINT "asignaciones_equipo_faena_usuario_responsable_id_fkey" FOREIGN KEY ("usuario_responsable_id") REFERENCES "usuarios"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "traslados_trabajador" ADD CONSTRAINT "traslados_trabajador_trabajador_id_fkey" FOREIGN KEY ("trabajador_id") REFERENCES "trabajadores"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "traslados_trabajador" ADD CONSTRAINT "traslados_trabajador_faena_origen_id_fkey" FOREIGN KEY ("faena_origen_id") REFERENCES "faenas"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "traslados_trabajador" ADD CONSTRAINT "traslados_trabajador_faena_destino_id_fkey" FOREIGN KEY ("faena_destino_id") REFERENCES "faenas"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "traslados_trabajador" ADD CONSTRAINT "traslados_trabajador_usuario_id_fkey" FOREIGN KEY ("usuario_id") REFERENCES "usuarios"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "reportes_falla" ADD CONSTRAINT "reportes_falla_faena_id_fkey" FOREIGN KEY ("faena_id") REFERENCES "faenas"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "reportes_falla" ADD CONSTRAINT "reportes_falla_equipo_id_fkey" FOREIGN KEY ("equipo_id") REFERENCES "equipos"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "reportes_falla" ADD CONSTRAINT "reportes_falla_reportado_por_id_fkey" FOREIGN KEY ("reportado_por_id") REFERENCES "usuarios"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "reportes_falla" ADD CONSTRAINT "reportes_falla_ot_id_fkey" FOREIGN KEY ("ot_id") REFERENCES "ordenes_trabajo"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "estados_pago" ADD CONSTRAINT "estados_pago_faena_id_fkey" FOREIGN KEY ("faena_id") REFERENCES "faenas"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "estados_pago" ADD CONSTRAINT "estados_pago_preparado_por_id_fkey" FOREIGN KEY ("preparado_por_id") REFERENCES "usuarios"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "estados_pago" ADD CONSTRAINT "estados_pago_aprobado_por_id_fkey" FOREIGN KEY ("aprobado_por_id") REFERENCES "usuarios"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "estado_pago_lineas" ADD CONSTRAINT "estado_pago_lineas_estado_pago_id_fkey" FOREIGN KEY ("estado_pago_id") REFERENCES "estados_pago"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "estado_pago_lineas" ADD CONSTRAINT "estado_pago_lineas_equipo_id_fkey" FOREIGN KEY ("equipo_id") REFERENCES "equipos"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "estado_pago_lineas" ADD CONSTRAINT "estado_pago_lineas_asignacion_id_fkey" FOREIGN KEY ("asignacion_id") REFERENCES "asignaciones_equipo_faena"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ajustes_estado_pago_linea" ADD CONSTRAINT "ajustes_estado_pago_linea_linea_id_fkey" FOREIGN KEY ("linea_id") REFERENCES "estado_pago_lineas"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ajustes_estado_pago_linea" ADD CONSTRAINT "ajustes_estado_pago_linea_usuario_id_fkey" FOREIGN KEY ("usuario_id") REFERENCES "usuarios"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "compromisos" ADD CONSTRAINT "compromisos_faena_id_fkey" FOREIGN KEY ("faena_id") REFERENCES "faenas"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "compromisos" ADD CONSTRAINT "compromisos_responsable_id_fkey" FOREIGN KEY ("responsable_id") REFERENCES "usuarios"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "compromisos" ADD CONSTRAINT "compromisos_creado_por_id_fkey" FOREIGN KEY ("creado_por_id") REFERENCES "usuarios"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "destinatarios_informe" ADD CONSTRAINT "destinatarios_informe_faena_id_fkey" FOREIGN KEY ("faena_id") REFERENCES "faenas"("id") ON DELETE SET NULL ON UPDATE CASCADE;

