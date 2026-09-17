# Taller Minero — instrucciones para agentes

## Objetivo

Trabajar con alta autonomía sin poner en riesgo la operación del taller, la separación entre faenas, la trazabilidad, el stock ni los datos productivos. Mantener los cambios acotados, verificables y reversibles.

## Fuentes de verdad

1. El código, el schema Prisma y las migraciones vigentes prevalecen sobre documentos antiguos.
2. `docs/TALLER_MINERO_RULES.md` define el dominio y sus invariantes.
3. `docs/VERIFICACION.md` define cuándo un trabajo puede considerarse terminado.
4. `docs/SECURITY_BASELINE.md` registra riesgos conocidos; no asumir que ya están resueltos.

## Flujo obligatorio para cambios no triviales

1. Inspeccionar el código relacionado y delimitar el alcance.
2. Identificar entidades, roles, faena y flujos afectados.
3. Revisar riesgos de autorización, integridad, concurrencia y datos existentes.
4. Implementar solo el alcance solicitado.
5. Ejecutar las comprobaciones aplicables.
6. Revisar `git diff` y `git status --short`.
7. Corregir fallas causadas por el cambio antes de continuar.
8. Informar cambios, pruebas, limitaciones y riesgos pendientes.

## Autonomía y acciones externas

Se permite sin aprobación adicional:

- leer, buscar y analizar el repositorio;
- editar o crear archivos dentro del alcance;
- instalar dependencias necesarias y justificadas;
- ejecutar desarrollo local, TypeScript, ESLint, build y pruebas;
- generar Prisma Client;
- crear un commit local cuando el cambio sea una unidad lógica verificada.

Requiere autorización explícita:

- push, merge, PR, release o despliegue;
- Railway u otro servicio externo que modifique estado;
- cambios en bases productivas, secretos o variables de entorno;
- migraciones destructivas o sin evaluación de datos existentes;
- eliminación masiva o reescritura de historiales;
- incorporación de telemetría o envío de datos a terceros.

Una autorización para commit no autoriza push. Una autorización para implementar no autoriza producción.

## Seguridad y multi-faena

- Toda acción del servidor debe autenticar y autorizar; el middleware y la navegación son defensa adicional, no suficiente.
- Verificar que las entidades leídas, relacionadas o modificadas pertenezcan a la `faenaId` de la sesión.
- No confiar en IDs, roles, costos, cantidades o estados enviados por el cliente.
- Validar entradas con Zod u otra validación explícita en límites de confianza.
- Aplicar mínimo privilegio por rol.
- Evitar `any` en autenticación, sesión y límites de datos.
- No devolver hashes de contraseña, secretos ni campos innecesarios.

## Base de datos e integridad

- Usar transacciones para cambios relacionados: OT/equipo, stock/movimiento, solicitud/historial y cierre/costos.
- Evitar el patrón leer-calcular-actualizar en stock sin control de concurrencia.
- No usar `db push` como mecanismo normal de cambios productivos; preferir migraciones revisables.
- Evaluar impacto, backfill, reversibilidad e índices antes de cambiar el schema.
- No eliminar trazabilidad para simplificar una operación.

## Pruebas

El proyecto parte sin una suite completa; aplicar cobertura incremental:

- Toda corrección de bug debe incluir una prueba de regresión cuando sea viable.
- Toda regla nueva de dominio debe tener prueba unitaria o de integración.
- Flujos críticos deben avanzar hacia E2E con Playwright.
- No imponer de golpe un porcentaje global de cobertura que obligue a pruebas artificiales.
- Nunca probar acciones destructivas contra producción.

## Git

- Preservar cambios ajenos o preexistentes.
- Un commit por unidad lógica, con formato `type: descripción`.
- Antes de commit: revisar diff, estado y verificaciones.
- Nunca usar `reset --hard`, `clean -fd`, force push ni reescritura de historia compartida sin autorización explícita.

## Definición de terminado

Un cambio está READY únicamente cuando:

- cumple el comportamiento solicitado;
- conserva roles, faena e invariantes del dominio;
- pasa las verificaciones aplicables;
- el diff contiene solo cambios intencionales;
- no introduce secretos ni riesgos obvios;
- identifica claramente cualquier área no verificada.

Si falta una comprobación importante, informar PARTIALLY VERIFIED, no READY.

<!-- BEGIN:nextjs-agent-rules -->
# This is NOT the Next.js you know

This version has breaking changes — APIs, conventions, and file structure may all differ from your training data. Read the relevant guide in `node_modules/next/dist/docs/` before writing any code. Heed deprecation notices.
<!-- END:nextjs-agent-rules -->
