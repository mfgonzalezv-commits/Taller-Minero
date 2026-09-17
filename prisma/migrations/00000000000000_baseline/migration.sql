
-- CreateSchema
CREATE SCHEMA IF NOT EXISTS "public";

-- CreateEnum
CREATE TYPE "estado_repuesto" AS ENUM ('SOLICITADO', 'AUTORIZADO', 'EN_COMPRAS', 'RECHAZADO', 'ENTREGADO', 'EXTERNO');

-- CreateEnum
CREATE TYPE "estado_sr" AS ENUM ('BORRADOR', 'ENVIADA', 'EN_BODEGA_CENTRAL', 'EN_ADQUISICIONES', 'ESPERANDO_LLEGADA', 'RECIBIDA_FAENA', 'ENTREGADA', 'RECHAZADA');

-- CreateEnum
CREATE TYPE "tipo_trabajador" AS ENUM ('DIRECTO', 'INDIRECTO');

-- CreateEnum
CREATE TYPE "tipo_intervencion_ot" AS ENUM ('DIAGNOSTICO', 'DIAGNOSTICO_FINAL', 'REPARACION', 'CAMBIO_COMPONENTE', 'INSPECCION', 'MANTENIMIENTO', 'SOLICITUD_REPUESTO', 'NOTA');

-- CreateEnum
CREATE TYPE "origen_falla" AS ENUM ('CHECKLIST_INSPECCION', 'DETECCION_VISUAL', 'REPORTE_OPERADOR', 'DETECCION_TALLER', 'MANTENIMIENTO_PREVENTIVO', 'OTRO');

-- CreateEnum
CREATE TYPE "rol_usuario" AS ENUM ('ADMINISTRADOR', 'JEFE_TALLER', 'PLANIFICADOR', 'MECANICO', 'BODEGA', 'COMPRAS', 'GERENCIA', 'OPERADOR');

-- CreateEnum
CREATE TYPE "tipo_equipo" AS ENUM ('CAMION', 'MAQUINARIA', 'LIVIANO', 'OTRO');

-- CreateEnum
CREATE TYPE "estado_equipo" AS ENUM ('OPERATIVO', 'DETENIDO', 'TALLER', 'FUERA_DE_SERVICIO');

-- CreateEnum
CREATE TYPE "tipo_mantenimiento" AS ENUM ('CORRECTIVO', 'PREVENTIVO', 'PREDICTIVO');

-- CreateEnum
CREATE TYPE "prioridad_ot" AS ENUM ('BAJA', 'MEDIA', 'ALTA', 'CRITICA');

-- CreateEnum
CREATE TYPE "estado_ot" AS ENUM ('PROGRAMADA', 'ABIERTA', 'EN_DIAGNOSTICO', 'DIAGNOSTICADO', 'REPARACION_PROGRAMADA', 'LISTO_PARA_REPARAR', 'EN_REPARACION', 'ESPERA_REPUESTO', 'EN_VALIDACION', 'CERRADA');

-- CreateEnum
CREATE TYPE "turno_inspeccion" AS ENUM ('MAÑANA', 'TARDE', 'NOCHE');

-- CreateEnum
CREATE TYPE "resultado_item" AS ENUM ('OK', 'OBSERVACION', 'ALERTA', 'CRITICO');

-- CreateEnum
CREATE TYPE "criticidad_inspeccion" AS ENUM ('INFORMATIVO', 'OBSERVACION', 'ALERTA', 'CRITICO');

-- CreateEnum
CREATE TYPE "estado_alerta" AS ENUM ('PENDIENTE', 'EN_PROCESO', 'RESUELTA', 'DESCARTADA');

-- CreateEnum
CREATE TYPE "tipo_metrica_pm" AS ENUM ('KM', 'HRS');

-- CreateEnum
CREATE TYPE "categoria_item_pm" AS ENUM ('FLUIDO', 'FILTRO', 'ACCESORIO');

-- CreateEnum
CREATE TYPE "resultado_checklist" AS ENUM ('OK', 'NA', 'OBSERVACION');

-- CreateTable
CREATE TABLE "faenas" (
    "id" TEXT NOT NULL,
    "empresa" TEXT,
    "nombre" TEXT NOT NULL,
    "codigo" TEXT NOT NULL,
    "ubicacion" TEXT,
    "activa" BOOLEAN NOT NULL DEFAULT true,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "faenas_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "usuarios" (
    "id" TEXT NOT NULL,
    "faena_id" TEXT NOT NULL,
    "nombre" TEXT NOT NULL,
    "email" TEXT NOT NULL,
    "password" TEXT NOT NULL,
    "rol" "rol_usuario" NOT NULL,
    "activo" BOOLEAN NOT NULL DEFAULT true,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "usuarios_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "tecnicos" (
    "id" TEXT NOT NULL,
    "usuario_id" TEXT NOT NULL,
    "faena_id" TEXT NOT NULL,
    "especialidades" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "turno" TEXT,
    "disponible" BOOLEAN NOT NULL DEFAULT true,
    "tarifa_hora" DECIMAL(12,2) NOT NULL DEFAULT 0,
    "tarifa_hora_extra" DECIMAL(12,2) NOT NULL DEFAULT 0,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "tecnicos_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "equipos" (
    "id" TEXT NOT NULL,
    "faena_id" TEXT NOT NULL,
    "codigo" TEXT NOT NULL,
    "nombre" TEXT NOT NULL,
    "tipo" "tipo_equipo" NOT NULL,
    "marca" TEXT,
    "modelo" TEXT,
    "patente" TEXT,
    "anio" INTEGER,
    "ubicacion_actual" TEXT,
    "estado" "estado_equipo" NOT NULL DEFAULT 'OPERATIVO',
    "horometro_actual" DECIMAL(10,1) NOT NULL DEFAULT 0,
    "kilometraje_actual" DECIMAL(10,1) NOT NULL DEFAULT 0,
    "costo_hora_detencion" DECIMAL(12,2) NOT NULL DEFAULT 0,
    "costo_detencion_acumulado" DECIMAL(14,2) NOT NULL DEFAULT 0,
    "qr_code" TEXT,
    "activo" BOOLEAN NOT NULL DEFAULT true,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,
    "pauta_id" TEXT,

    CONSTRAINT "equipos_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "horometro_km" (
    "id" TEXT NOT NULL,
    "equipo_id" TEXT NOT NULL,
    "faena_id" TEXT NOT NULL,
    "horometro" DECIMAL(10,1),
    "kilometraje" DECIMAL(10,1),
    "fecha_registro" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "usuario_id" TEXT,
    "origen" TEXT NOT NULL DEFAULT 'manual',

    CONSTRAINT "horometro_km_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ordenes_trabajo" (
    "id" TEXT NOT NULL,
    "faena_id" TEXT NOT NULL,
    "equipo_id" TEXT NOT NULL,
    "numero_ot" SERIAL NOT NULL,
    "tipo_mantenimiento" "tipo_mantenimiento" NOT NULL DEFAULT 'CORRECTIVO',
    "estado" "estado_ot" NOT NULL DEFAULT 'ABIERTA',
    "prioridad" "prioridad_ot" NOT NULL DEFAULT 'MEDIA',
    "descripcion_falla" TEXT NOT NULL,
    "origen_falla" "origen_falla",
    "reportada_por_nombre" TEXT,
    "diagnostico" TEXT,
    "trabajo_ejecutado" TEXT,
    "fecha_reporte" TIMESTAMP(3),
    "fecha_creacion" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "fecha_compromiso" TIMESTAMP(3),
    "fecha_inicio_trabajo" TIMESTAMP(3),
    "fecha_termino_trabajo" TIMESTAMP(3),
    "fecha_cierre" TIMESTAMP(3),
    "responsable_id" TEXT,
    "tecnico_asignado_id" TEXT,
    "creado_por_id" TEXT,
    "costo_hora_snapshot" DECIMAL(12,2) NOT NULL DEFAULT 0,
    "tiempo_detenido_min" INTEGER NOT NULL DEFAULT 0,
    "costo_detencion" DECIMAL(14,2) NOT NULL DEFAULT 0,
    "costo_mano_obra" DECIMAL(14,2) NOT NULL DEFAULT 0,
    "costo_overhead" DECIMAL(14,2) NOT NULL DEFAULT 0,
    "reincidente" BOOLEAN NOT NULL DEFAULT false,
    "en_espera_repuesto" BOOLEAN NOT NULL DEFAULT false,
    "plan_mantenimiento_id" TEXT,
    "pauta_id" TEXT,
    "ciclo_pm" INTEGER,
    "ot_origen_id" TEXT,
    "causa_raiz" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "ordenes_trabajo_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "items_bodega" (
    "id" TEXT NOT NULL,
    "faena_id" TEXT NOT NULL,
    "codigo" TEXT NOT NULL,
    "descripcion" TEXT NOT NULL,
    "unidad" TEXT NOT NULL DEFAULT 'un',
    "stock_actual" DECIMAL(10,2) NOT NULL DEFAULT 0,
    "stock_minimo" DECIMAL(10,2) NOT NULL DEFAULT 0,
    "precio_ref" DECIMAL(14,2) NOT NULL DEFAULT 0,
    "categoria" TEXT,
    "activo" BOOLEAN NOT NULL DEFAULT true,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "items_bodega_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "movimientos_bodega" (
    "id" TEXT NOT NULL,
    "item_id" TEXT NOT NULL,
    "faena_id" TEXT NOT NULL,
    "tipo" TEXT NOT NULL,
    "cantidad" DECIMAL(10,2) NOT NULL,
    "stock_antes" DECIMAL(10,2) NOT NULL,
    "stock_despues" DECIMAL(10,2) NOT NULL,
    "ot_id" TEXT,
    "usuario_id" TEXT,
    "observacion" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "movimientos_bodega_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "repuestos_ot" (
    "id" TEXT NOT NULL,
    "ot_id" TEXT NOT NULL,
    "faena_id" TEXT NOT NULL,
    "descripcion" TEXT NOT NULL,
    "cantidad" DECIMAL(10,2) NOT NULL,
    "unidad" TEXT NOT NULL DEFAULT 'un',
    "precio_unit" DECIMAL(14,2) NOT NULL DEFAULT 0,
    "total" DECIMAL(14,2) NOT NULL DEFAULT 0,
    "estado_solicitud" "estado_repuesto" NOT NULL DEFAULT 'ENTREGADO',
    "registrado_by_id" TEXT,
    "item_bodega_id" TEXT,
    "bitacora_id" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "repuestos_ot_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "solicitudes_repuesto" (
    "id" TEXT NOT NULL,
    "numero_sr" SERIAL NOT NULL,
    "ot_id" TEXT NOT NULL,
    "faena_id" TEXT NOT NULL,
    "estado" "estado_sr" NOT NULL DEFAULT 'BORRADOR',
    "urgente" BOOLEAN NOT NULL DEFAULT false,
    "observacion" TEXT,
    "fecha_estimada_llegada" TIMESTAMP(3),
    "creado_por_id" TEXT NOT NULL,
    "gestionado_por_id" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "solicitudes_repuesto_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "items_solicitud_repuesto" (
    "id" TEXT NOT NULL,
    "sr_id" TEXT NOT NULL,
    "descripcion" TEXT NOT NULL,
    "cantidad" DECIMAL(10,2) NOT NULL,
    "unidad" TEXT NOT NULL DEFAULT 'UN',
    "item_bodega_id" TEXT,
    "precio_estimado" DECIMAL(14,2),
    "cantidad_entregada" DECIMAL(10,2) NOT NULL DEFAULT 0,

    CONSTRAINT "items_solicitud_repuesto_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "historial_sr" (
    "id" TEXT NOT NULL,
    "sr_id" TEXT NOT NULL,
    "estado_anterior" "estado_sr",
    "estado_nuevo" "estado_sr" NOT NULL,
    "observacion" TEXT,
    "usuario_id" TEXT NOT NULL,
    "fecha_cambio" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "historial_sr_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ciclos_mantenimiento" (
    "id" TEXT NOT NULL,
    "faena_id" TEXT NOT NULL,
    "equipo_id" TEXT NOT NULL,
    "nombre" TEXT NOT NULL,
    "descripcion" TEXT,
    "activo" BOOLEAN NOT NULL DEFAULT true,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "ciclos_mantenimiento_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "planes_mantenimiento" (
    "id" TEXT NOT NULL,
    "faena_id" TEXT NOT NULL,
    "equipo_id" TEXT NOT NULL,
    "ciclo_id" TEXT,
    "nombre" TEXT NOT NULL,
    "descripcion" TEXT,
    "intervalo_horas" DECIMAL(10,1),
    "intervalo_km" DECIMAL(10,1),
    "intervalo_dias" INTEGER,
    "ultima_ejecucion" TIMESTAMP(3),
    "proxima_ejecucion_horas" DECIMAL(10,1),
    "proxima_ejecucion_km" DECIMAL(10,1),
    "proxima_ejecucion_fecha" TIMESTAMP(3),
    "fecha_programada" TIMESTAMP(3),
    "ot_activa_id" TEXT,
    "activo" BOOLEAN NOT NULL DEFAULT true,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "planes_mantenimiento_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "tareas_mantenimiento" (
    "id" TEXT NOT NULL,
    "plan_id" TEXT NOT NULL,
    "descripcion" TEXT NOT NULL,
    "codigo" TEXT,
    "cantidad" DECIMAL(10,3),
    "unidad" TEXT DEFAULT 'un',
    "tipo_item" TEXT,
    "obligatorio" BOOLEAN NOT NULL DEFAULT true,
    "orden" INTEGER NOT NULL DEFAULT 0,

    CONSTRAINT "tareas_mantenimiento_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ejecuciones_mantenimiento" (
    "id" TEXT NOT NULL,
    "plan_id" TEXT NOT NULL,
    "fecha_ejecucion" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "horometro_al_ejecutar" DECIMAL(10,1),
    "km_al_ejecutar" DECIMAL(10,1),
    "ot_id" TEXT,
    "observacion" TEXT,
    "usuario_id" TEXT,

    CONSTRAINT "ejecuciones_mantenimiento_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "checklist_items_ot" (
    "id" TEXT NOT NULL,
    "ot_id" TEXT NOT NULL,
    "descripcion" TEXT NOT NULL,
    "codigo" TEXT,
    "cantidad" DECIMAL(10,3),
    "unidad" TEXT,
    "obligatorio" BOOLEAN NOT NULL DEFAULT true,
    "completado" BOOLEAN NOT NULL DEFAULT false,
    "completado_at" TIMESTAMP(3),
    "completado_por" TEXT,
    "resultado" "resultado_checklist",
    "observacion" TEXT,
    "orden" INTEGER NOT NULL DEFAULT 0,

    CONSTRAINT "checklist_items_ot_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "mano_obra_ot" (
    "id" TEXT NOT NULL,
    "ot_id" TEXT NOT NULL,
    "faena_id" TEXT NOT NULL,
    "nombre" TEXT NOT NULL,
    "tecnico_id" TEXT,
    "trabajador_id" TEXT,
    "horas_normales" DECIMAL(6,2) NOT NULL DEFAULT 0,
    "horas_extra" DECIMAL(6,2) NOT NULL DEFAULT 0,
    "tarifa_normal" DECIMAL(12,2) NOT NULL DEFAULT 0,
    "tarifa_extra" DECIMAL(12,2) NOT NULL DEFAULT 0,
    "total" DECIMAL(14,2) NOT NULL DEFAULT 0,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "mano_obra_ot_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "trabajadores" (
    "id" TEXT NOT NULL,
    "faena_id" TEXT NOT NULL,
    "nombre" TEXT NOT NULL,
    "rut" TEXT,
    "cargo" TEXT,
    "tipo" "tipo_trabajador" NOT NULL,
    "sueldo_bruto" DECIMAL(14,2) NOT NULL,
    "horas_mensuales" INTEGER NOT NULL DEFAULT 180,
    "tasa_leyes_sociales" DECIMAL(5,4) NOT NULL DEFAULT 0.28,
    "activo" BOOLEAN NOT NULL DEFAULT true,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "trabajadores_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "historial_estado_ot" (
    "id" TEXT NOT NULL,
    "ot_id" TEXT NOT NULL,
    "faena_id" TEXT NOT NULL,
    "estado_anterior" "estado_ot",
    "estado_nuevo" "estado_ot" NOT NULL,
    "fecha_cambio" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "usuario_id" TEXT,
    "observacion" TEXT,
    "tiempo_en_estado_min" INTEGER NOT NULL DEFAULT 0,

    CONSTRAINT "historial_estado_ot_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "bitacora_ot" (
    "id" TEXT NOT NULL,
    "ot_id" TEXT NOT NULL,
    "fecha_hora" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "hora_inicio" TEXT,
    "hora_termino" TEXT,
    "personal" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "tipo_intervencion" "tipo_intervencion_ot",
    "descripcion" TEXT NOT NULL,
    "nota_repuesto" TEXT,
    "estado" "estado_ot",
    "set_espera" BOOLEAN,
    "usuario_id" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "bitacora_ot_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "plantillas_inspeccion" (
    "id" TEXT NOT NULL,
    "faena_id" TEXT NOT NULL,
    "equipo_id" TEXT,
    "nombre" TEXT NOT NULL,
    "activo" BOOLEAN NOT NULL DEFAULT true,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "plantillas_inspeccion_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "items_plantilla_inspeccion" (
    "id" TEXT NOT NULL,
    "plantilla_id" TEXT NOT NULL,
    "categoria" TEXT NOT NULL,
    "descripcion" TEXT NOT NULL,
    "criticidad_base" "criticidad_inspeccion" NOT NULL DEFAULT 'INFORMATIVO',
    "orden" INTEGER NOT NULL DEFAULT 0,

    CONSTRAINT "items_plantilla_inspeccion_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "inspecciones_diarias" (
    "id" TEXT NOT NULL,
    "faena_id" TEXT NOT NULL,
    "equipo_id" TEXT NOT NULL,
    "plantilla_id" TEXT NOT NULL,
    "fecha" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "turno" "turno_inspeccion" NOT NULL,
    "operador_id" TEXT NOT NULL,
    "completada" BOOLEAN NOT NULL DEFAULT false,
    "observacion" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "inspecciones_diarias_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "resultados_inspeccion" (
    "id" TEXT NOT NULL,
    "inspeccion_id" TEXT NOT NULL,
    "item_id" TEXT NOT NULL,
    "resultado" "resultado_item" NOT NULL DEFAULT 'OK',
    "observacion" TEXT,

    CONSTRAINT "resultados_inspeccion_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "alertas_inspeccion" (
    "id" TEXT NOT NULL,
    "faena_id" TEXT NOT NULL,
    "inspeccion_id" TEXT NOT NULL,
    "resultado_id" TEXT,
    "equipo_id" TEXT NOT NULL,
    "descripcion" TEXT NOT NULL,
    "criticidad" "criticidad_inspeccion" NOT NULL,
    "estado" "estado_alerta" NOT NULL DEFAULT 'PENDIENTE',
    "ot_id" TEXT,
    "resuelta_at" TIMESTAMP(3),
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "alertas_inspeccion_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "pautas_mantenimiento" (
    "id" TEXT NOT NULL,
    "faena_id" TEXT NOT NULL,
    "nombre" TEXT NOT NULL,
    "marca_modelo" TEXT NOT NULL,
    "codigos_internos" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "tipo_metrica" "tipo_metrica_pm" NOT NULL,
    "ciclos_disponibles" INTEGER[] DEFAULT ARRAY[]::INTEGER[],
    "activo" BOOLEAN NOT NULL DEFAULT true,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "pautas_mantenimiento_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "items_pauta" (
    "id" TEXT NOT NULL,
    "pauta_id" TEXT NOT NULL,
    "componente" TEXT NOT NULL,
    "categoria" "categoria_item_pm" NOT NULL,
    "normativa" TEXT,
    "alternativo" TEXT,
    "cantidad" DECIMAL(10,3),
    "unidad" TEXT DEFAULT 'un',
    "ciclos_reemplazar" INTEGER[] DEFAULT ARRAY[]::INTEGER[],
    "ciclos_condicionar" INTEGER[] DEFAULT ARRAY[]::INTEGER[],
    "orden" INTEGER NOT NULL DEFAULT 0,

    CONSTRAINT "items_pauta_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "faenas_codigo_key" ON "faenas"("codigo");

-- CreateIndex
CREATE UNIQUE INDEX "usuarios_email_key" ON "usuarios"("email");

-- CreateIndex
CREATE UNIQUE INDEX "tecnicos_usuario_id_key" ON "tecnicos"("usuario_id");

-- CreateIndex
CREATE UNIQUE INDEX "equipos_faena_id_codigo_key" ON "equipos"("faena_id", "codigo");

-- CreateIndex
CREATE UNIQUE INDEX "items_bodega_faena_id_codigo_key" ON "items_bodega"("faena_id", "codigo");

-- CreateIndex
CREATE UNIQUE INDEX "resultados_inspeccion_inspeccion_id_item_id_key" ON "resultados_inspeccion"("inspeccion_id", "item_id");

-- CreateIndex
CREATE UNIQUE INDEX "alertas_inspeccion_resultado_id_key" ON "alertas_inspeccion"("resultado_id");

-- AddForeignKey
ALTER TABLE "usuarios" ADD CONSTRAINT "usuarios_faena_id_fkey" FOREIGN KEY ("faena_id") REFERENCES "faenas"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "tecnicos" ADD CONSTRAINT "tecnicos_usuario_id_fkey" FOREIGN KEY ("usuario_id") REFERENCES "usuarios"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "tecnicos" ADD CONSTRAINT "tecnicos_faena_id_fkey" FOREIGN KEY ("faena_id") REFERENCES "faenas"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "equipos" ADD CONSTRAINT "equipos_faena_id_fkey" FOREIGN KEY ("faena_id") REFERENCES "faenas"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "equipos" ADD CONSTRAINT "equipos_pauta_id_fkey" FOREIGN KEY ("pauta_id") REFERENCES "pautas_mantenimiento"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "horometro_km" ADD CONSTRAINT "horometro_km_equipo_id_fkey" FOREIGN KEY ("equipo_id") REFERENCES "equipos"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "horometro_km" ADD CONSTRAINT "horometro_km_usuario_id_fkey" FOREIGN KEY ("usuario_id") REFERENCES "usuarios"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ordenes_trabajo" ADD CONSTRAINT "ordenes_trabajo_faena_id_fkey" FOREIGN KEY ("faena_id") REFERENCES "faenas"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ordenes_trabajo" ADD CONSTRAINT "ordenes_trabajo_equipo_id_fkey" FOREIGN KEY ("equipo_id") REFERENCES "equipos"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ordenes_trabajo" ADD CONSTRAINT "ordenes_trabajo_responsable_id_fkey" FOREIGN KEY ("responsable_id") REFERENCES "usuarios"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ordenes_trabajo" ADD CONSTRAINT "ordenes_trabajo_tecnico_asignado_id_fkey" FOREIGN KEY ("tecnico_asignado_id") REFERENCES "tecnicos"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ordenes_trabajo" ADD CONSTRAINT "ordenes_trabajo_creado_por_id_fkey" FOREIGN KEY ("creado_por_id") REFERENCES "usuarios"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ordenes_trabajo" ADD CONSTRAINT "ordenes_trabajo_pauta_id_fkey" FOREIGN KEY ("pauta_id") REFERENCES "pautas_mantenimiento"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ordenes_trabajo" ADD CONSTRAINT "ordenes_trabajo_ot_origen_id_fkey" FOREIGN KEY ("ot_origen_id") REFERENCES "ordenes_trabajo"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "items_bodega" ADD CONSTRAINT "items_bodega_faena_id_fkey" FOREIGN KEY ("faena_id") REFERENCES "faenas"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "movimientos_bodega" ADD CONSTRAINT "movimientos_bodega_item_id_fkey" FOREIGN KEY ("item_id") REFERENCES "items_bodega"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "movimientos_bodega" ADD CONSTRAINT "movimientos_bodega_usuario_id_fkey" FOREIGN KEY ("usuario_id") REFERENCES "usuarios"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "repuestos_ot" ADD CONSTRAINT "repuestos_ot_ot_id_fkey" FOREIGN KEY ("ot_id") REFERENCES "ordenes_trabajo"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "repuestos_ot" ADD CONSTRAINT "repuestos_ot_registrado_by_id_fkey" FOREIGN KEY ("registrado_by_id") REFERENCES "usuarios"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "repuestos_ot" ADD CONSTRAINT "repuestos_ot_item_bodega_id_fkey" FOREIGN KEY ("item_bodega_id") REFERENCES "items_bodega"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "repuestos_ot" ADD CONSTRAINT "repuestos_ot_bitacora_id_fkey" FOREIGN KEY ("bitacora_id") REFERENCES "bitacora_ot"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "solicitudes_repuesto" ADD CONSTRAINT "solicitudes_repuesto_ot_id_fkey" FOREIGN KEY ("ot_id") REFERENCES "ordenes_trabajo"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "solicitudes_repuesto" ADD CONSTRAINT "solicitudes_repuesto_faena_id_fkey" FOREIGN KEY ("faena_id") REFERENCES "faenas"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "solicitudes_repuesto" ADD CONSTRAINT "solicitudes_repuesto_creado_por_id_fkey" FOREIGN KEY ("creado_por_id") REFERENCES "usuarios"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "solicitudes_repuesto" ADD CONSTRAINT "solicitudes_repuesto_gestionado_por_id_fkey" FOREIGN KEY ("gestionado_por_id") REFERENCES "usuarios"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "items_solicitud_repuesto" ADD CONSTRAINT "items_solicitud_repuesto_sr_id_fkey" FOREIGN KEY ("sr_id") REFERENCES "solicitudes_repuesto"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "items_solicitud_repuesto" ADD CONSTRAINT "items_solicitud_repuesto_item_bodega_id_fkey" FOREIGN KEY ("item_bodega_id") REFERENCES "items_bodega"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "historial_sr" ADD CONSTRAINT "historial_sr_sr_id_fkey" FOREIGN KEY ("sr_id") REFERENCES "solicitudes_repuesto"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "historial_sr" ADD CONSTRAINT "historial_sr_usuario_id_fkey" FOREIGN KEY ("usuario_id") REFERENCES "usuarios"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ciclos_mantenimiento" ADD CONSTRAINT "ciclos_mantenimiento_faena_id_fkey" FOREIGN KEY ("faena_id") REFERENCES "faenas"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ciclos_mantenimiento" ADD CONSTRAINT "ciclos_mantenimiento_equipo_id_fkey" FOREIGN KEY ("equipo_id") REFERENCES "equipos"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "planes_mantenimiento" ADD CONSTRAINT "planes_mantenimiento_faena_id_fkey" FOREIGN KEY ("faena_id") REFERENCES "faenas"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "planes_mantenimiento" ADD CONSTRAINT "planes_mantenimiento_equipo_id_fkey" FOREIGN KEY ("equipo_id") REFERENCES "equipos"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "planes_mantenimiento" ADD CONSTRAINT "planes_mantenimiento_ciclo_id_fkey" FOREIGN KEY ("ciclo_id") REFERENCES "ciclos_mantenimiento"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "tareas_mantenimiento" ADD CONSTRAINT "tareas_mantenimiento_plan_id_fkey" FOREIGN KEY ("plan_id") REFERENCES "planes_mantenimiento"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ejecuciones_mantenimiento" ADD CONSTRAINT "ejecuciones_mantenimiento_plan_id_fkey" FOREIGN KEY ("plan_id") REFERENCES "planes_mantenimiento"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ejecuciones_mantenimiento" ADD CONSTRAINT "ejecuciones_mantenimiento_usuario_id_fkey" FOREIGN KEY ("usuario_id") REFERENCES "usuarios"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "checklist_items_ot" ADD CONSTRAINT "checklist_items_ot_ot_id_fkey" FOREIGN KEY ("ot_id") REFERENCES "ordenes_trabajo"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "checklist_items_ot" ADD CONSTRAINT "checklist_items_ot_completado_por_fkey" FOREIGN KEY ("completado_por") REFERENCES "usuarios"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "mano_obra_ot" ADD CONSTRAINT "mano_obra_ot_ot_id_fkey" FOREIGN KEY ("ot_id") REFERENCES "ordenes_trabajo"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "mano_obra_ot" ADD CONSTRAINT "mano_obra_ot_tecnico_id_fkey" FOREIGN KEY ("tecnico_id") REFERENCES "tecnicos"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "mano_obra_ot" ADD CONSTRAINT "mano_obra_ot_trabajador_id_fkey" FOREIGN KEY ("trabajador_id") REFERENCES "trabajadores"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "trabajadores" ADD CONSTRAINT "trabajadores_faena_id_fkey" FOREIGN KEY ("faena_id") REFERENCES "faenas"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "historial_estado_ot" ADD CONSTRAINT "historial_estado_ot_ot_id_fkey" FOREIGN KEY ("ot_id") REFERENCES "ordenes_trabajo"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "historial_estado_ot" ADD CONSTRAINT "historial_estado_ot_usuario_id_fkey" FOREIGN KEY ("usuario_id") REFERENCES "usuarios"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "bitacora_ot" ADD CONSTRAINT "bitacora_ot_ot_id_fkey" FOREIGN KEY ("ot_id") REFERENCES "ordenes_trabajo"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "bitacora_ot" ADD CONSTRAINT "bitacora_ot_usuario_id_fkey" FOREIGN KEY ("usuario_id") REFERENCES "usuarios"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "plantillas_inspeccion" ADD CONSTRAINT "plantillas_inspeccion_faena_id_fkey" FOREIGN KEY ("faena_id") REFERENCES "faenas"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "plantillas_inspeccion" ADD CONSTRAINT "plantillas_inspeccion_equipo_id_fkey" FOREIGN KEY ("equipo_id") REFERENCES "equipos"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "items_plantilla_inspeccion" ADD CONSTRAINT "items_plantilla_inspeccion_plantilla_id_fkey" FOREIGN KEY ("plantilla_id") REFERENCES "plantillas_inspeccion"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "inspecciones_diarias" ADD CONSTRAINT "inspecciones_diarias_faena_id_fkey" FOREIGN KEY ("faena_id") REFERENCES "faenas"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "inspecciones_diarias" ADD CONSTRAINT "inspecciones_diarias_equipo_id_fkey" FOREIGN KEY ("equipo_id") REFERENCES "equipos"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "inspecciones_diarias" ADD CONSTRAINT "inspecciones_diarias_plantilla_id_fkey" FOREIGN KEY ("plantilla_id") REFERENCES "plantillas_inspeccion"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "inspecciones_diarias" ADD CONSTRAINT "inspecciones_diarias_operador_id_fkey" FOREIGN KEY ("operador_id") REFERENCES "usuarios"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "resultados_inspeccion" ADD CONSTRAINT "resultados_inspeccion_inspeccion_id_fkey" FOREIGN KEY ("inspeccion_id") REFERENCES "inspecciones_diarias"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "resultados_inspeccion" ADD CONSTRAINT "resultados_inspeccion_item_id_fkey" FOREIGN KEY ("item_id") REFERENCES "items_plantilla_inspeccion"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "alertas_inspeccion" ADD CONSTRAINT "alertas_inspeccion_faena_id_fkey" FOREIGN KEY ("faena_id") REFERENCES "faenas"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "alertas_inspeccion" ADD CONSTRAINT "alertas_inspeccion_inspeccion_id_fkey" FOREIGN KEY ("inspeccion_id") REFERENCES "inspecciones_diarias"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "alertas_inspeccion" ADD CONSTRAINT "alertas_inspeccion_resultado_id_fkey" FOREIGN KEY ("resultado_id") REFERENCES "resultados_inspeccion"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "alertas_inspeccion" ADD CONSTRAINT "alertas_inspeccion_equipo_id_fkey" FOREIGN KEY ("equipo_id") REFERENCES "equipos"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "pautas_mantenimiento" ADD CONSTRAINT "pautas_mantenimiento_faena_id_fkey" FOREIGN KEY ("faena_id") REFERENCES "faenas"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "items_pauta" ADD CONSTRAINT "items_pauta_pauta_id_fkey" FOREIGN KEY ("pauta_id") REFERENCES "pautas_mantenimiento"("id") ON DELETE CASCADE ON UPDATE CASCADE;

