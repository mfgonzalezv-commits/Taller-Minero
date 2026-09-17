# Taller Minero — baseline de seguridad

Fecha de evaluación inicial: 2026-09-17.

Este archivo registra señales detectadas antes de instalar la configuración ECC del proyecto. No afirma explotación ni reemplaza una auditoría completa. Cada punto debe verificarse contra el código vigente antes de corregirse.

## Prioridad crítica

### Ruta destructiva de pautas

`src/app/api/seed-pautas/route.ts` expone un `GET` que elimina pautas existentes antes de recrearlas, utiliza rutas locales y no muestra autenticación dentro del handler. Debe retirarse de producción o rediseñarse como operación administrativa autenticada, no destructiva por defecto y acotada a una faena explícita.

## Prioridad alta

### Aislamiento por faena en mutaciones

Varias Server Actions autentican la sesión, pero consultan o actualizan entidades mediante IDs sin incluir siempre `faenaId` ni validar la pertenencia previa. Revisar especialmente OT, técnicos, checklist, equipos, stock y repuestos.

### Autorización por rol

El middleware limita páginas, pero las acciones del servidor también deben llamar una política de autorización. Revisar creación, asignación, cierre/eliminación de OT, bodega, usuarios, costos y mantenimiento.

### Concurrencia de stock

El flujo actual de movimientos de bodega lee el stock, calcula en aplicación y luego actualiza. Dos solicitudes simultáneas podrían partir del mismo valor. Diseñar una operación atómica con control de concurrencia.

## Prioridad media

### Usuarios inactivos

La autenticación debe confirmar que `Usuario.activo` sea verdadero y definir qué ocurre con sesiones emitidas antes de una desactivación.

### Roles desalineados

Prisma incluye `OPERADOR`; el tipo `Rol` de `src/lib/roles.ts` debe mantenerse alineado con el enum y con las políticas efectivas.

### Estado de equipo al cerrar o eliminar OT

Antes de marcar un equipo `OPERATIVO`, comprobar si existe otra OT activa que exige mantenerlo detenido o en taller.

### Validación de entrada

Las Server Actions reciben objetos TypeScript, pero los tipos estáticos no validan datos en ejecución. Incorporar esquemas en límites sensibles.

## Estrategia de resolución

1. Auditar y confirmar cada hallazgo sin modificar datos.
2. Corregir primero la ruta destructiva y el aislamiento por faena.
3. Centralizar autenticación/autorización para Server Actions.
4. Corregir transacciones de stock y estados relacionados.
5. Añadir pruebas de regresión por cada vulnerabilidad confirmada.
6. Desplegar únicamente con autorización, migración revisada y plan de reversión.
