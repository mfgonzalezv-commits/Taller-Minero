# Taller Minero — contexto de trabajo para Claude

Lee y cumple `AGENTS.md` antes de realizar cambios. Para tareas no triviales, consulta además:

- `docs/TALLER_MINERO_RULES.md`: dominio, roles e invariantes operacionales.
- `docs/VERIFICACION.md`: controles mínimos antes de declarar un trabajo terminado.
- `docs/SECURITY_BASELINE.md`: riesgos conocidos que deben guiar revisiones y correcciones.

## Qué es

Taller Minero es un ERP operacional para talleres que mantienen equipos de faenas mineras. Cubre fallas, órdenes de trabajo, diagnóstico, reparación, repuestos, bodega, costos, mantenimiento preventivo, inspecciones y trazabilidad.

## Stack vigente

- Next.js 16 App Router, React 19 y TypeScript.
- Server Actions y rutas API dentro del mismo proyecto.
- Prisma 7 con PostgreSQL/Neon.
- NextAuth 5 beta con credenciales.
- Tailwind CSS 4, shadcn/ui y Base UI.
- Railway para producción.

## Principio principal

Preservar la operación y la trazabilidad antes que refactorizar. Una mejora técnica nunca justifica alterar silenciosamente estados, costos, stock, historial, permisos o datos productivos.

## Autonomía

Claude puede investigar, editar, crear archivos, ejecutar verificaciones, corregir errores y crear commits locales de una unidad lógica terminada. No necesita detenerse entre esas actividades.

Debe detenerse y pedir autorización antes de:

- `git push`, merge, publicación o despliegue;
- modificar datos o variables de producción;
- ejecutar `prisma db push`, `prisma migrate deploy/reset` o equivalentes contra una base no local;
- borrar o reescribir datos, historiales o archivos de forma masiva;
- cambiar credenciales, proveedores o servicios externos;
- ampliar materialmente el alcance solicitado.

## Reglas críticas resumidas

1. Toda lectura o mutación operacional debe respetar `faenaId`.
2. Ocultar controles en la interfaz no reemplaza autorización en el servidor.
3. Validar sesión, usuario activo, rol y pertenencia de los registros antes de mutar.
4. Mantener atómicas las operaciones que afectan más de una entidad.
5. No perder historial de OT, solicitudes, inspecciones ni movimientos de bodega.
6. Los cambios de estado de OT y equipo deben permanecer consistentes.
7. Stock, costos y tiempos no pueden depender de actualizaciones susceptibles a carreras.
8. Nunca usar una petición `GET` para una operación destructiva.
9. No exponer secretos, rutas locales, datos personales ni detalles internos en errores.
10. No declarar READY sin completar la verificación aplicable y revisar el diff.

## ECC recomendado

Usar el plugin oficial ECC con alcance `project` y perfil de hooks `standard`. Priorizar, según la tarea: `planner`, `typescript-reviewer`, `react-reviewer`, `database-reviewer`, `security-reviewer`, `build-error-resolver`, `postgres-patterns`, `database-migrations`, `e2e-testing` y `verification-loop`.
