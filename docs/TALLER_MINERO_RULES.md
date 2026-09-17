# Taller Minero — reglas de dominio

## Alcance

Este documento reúne invariantes que deben conservarse al modificar el ERP. Describe el comportamiento que debe verificarse; el schema Prisma y el código vigente siguen siendo la fuente técnica de verdad.

## Ámbito organizacional

`Faena` es el límite principal de datos. Un usuario opera dentro de la `faenaId` de su sesión.

- Las consultas deben filtrar por faena cuando la entidad directa o indirectamente pertenece a una.
- Las relaciones recibidas por ID deben comprobar pertenencia antes de crear o actualizar.
- Administrar varias faenas dentro de una instancia no convierte al sistema en acceso global implícito.
- Un error de referencia cruzada entre faenas es un incidente de seguridad e integridad.

## Roles

Roles vigentes en Prisma:

- `ADMINISTRADOR`
- `JEFE_TALLER`
- `PLANIFICADOR`
- `MECANICO`
- `BODEGA`
- `COMPRAS`
- `GERENCIA`
- `OPERADOR`

La autorización debe aplicarse en el servidor. La visibilidad de botones y menús solo mejora la experiencia; no protege una acción.

## Orden de trabajo

Flujo vigente:

`PROGRAMADA` / `ABIERTA` → diagnóstico → programación/reparación → validación → `CERRADA`.

Estados definidos:

- `PROGRAMADA`
- `ABIERTA`
- `EN_DIAGNOSTICO`
- `DIAGNOSTICADO`
- `REPARACION_PROGRAMADA`
- `LISTO_PARA_REPARAR`
- `EN_REPARACION`
- `ESPERA_REPUESTO`
- `EN_VALIDACION`
- `CERRADA`

Invariantes:

- Cada transición relevante debe dejar historial con actor y fecha.
- El tiempo detenido no debe contarse dos veces ni depender únicamente de `updatedAt`.
- Cerrar una OT debe recalcular sus costos de forma consistente.
- Reabrir debe preservar el historial y restablecer coherentemente el estado del equipo.
- Asignaciones de técnicos, equipos, pautas y repuestos deben pertenecer a la misma faena.
- Eliminar una OT es excepcional, autorizado y auditable; preferir anulación o estado equivalente cuando el dominio lo permita.

## Equipos

- Los estados de equipo y OT deben mantenerse sincronizados en una transacción cuando corresponda.
- No marcar un equipo `OPERATIVO` si mantiene otra OT activa que justifica su detención.
- Horómetro y kilometraje deben ser monotónicos salvo corrección explícita y auditada.
- Pautas de mantenimiento deben ser compatibles con el equipo y su faena.

## Bodega y repuestos

- Todo movimiento debe registrar stock anterior, stock posterior, usuario y motivo.
- El stock nunca puede quedar negativo.
- Actualizar stock y crear movimiento debe ser atómico y seguro frente a concurrencia.
- Una salida asociada a OT debe comprobar OT, ítem y faena.
- Solicitudes y entregas parciales deben preservar cantidades e historial.
- Costos de repuestos usados en una OT deben poder reconstruirse.

## Mantenimiento e inspecciones

- Las programaciones por horas, kilómetros o fecha deben usar unidades coherentes.
- Una inspección crítica no debe desaparecer sin resolución, descarte autorizado o vínculo trazable.
- Crear una OT desde una alerta debe preservar el origen.
- Cambios de plantilla no deben reescribir inspecciones históricas.

## Costos

- Dinero y cantidades sensibles deben mantenerse como `Decimal` en persistencia.
- Documentar conversiones a `number` y evitar pérdida de precisión en cálculos acumulativos.
- El costo de detención debe derivarse de una regla única y probada.
- Mano de obra, overhead y repuestos no deben duplicarse al reintentar una acción.
- Los valores utilizados al cerrar una OT deben quedar reconstruibles mediante snapshots o historial.

## Datos destructivos

- `GET` debe ser de solo lectura.
- Seeds, importadores y scripts deben exigir intención explícita, entorno seguro y alcance de faena.
- Nunca borrar datos existentes como paso implícito de una importación productiva.
- Toda migración debe considerar datos actuales, reversibilidad y respaldo.
