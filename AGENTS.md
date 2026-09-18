<!-- BEGIN:nextjs-agent-rules -->
# This is NOT the Next.js you know

This version has breaking changes — APIs, conventions, and file structure may all differ from your training data. Read the relevant guide in `node_modules/next/dist/docs/` before writing any code. Heed deprecation notices.
<!-- END:nextjs-agent-rules -->

---

# Gobierno multiagente — Taller Minero

Esta es la **fuente central de instrucciones** para toda IA que trabaje en este repositorio
(Claude Code, Gemini CLI, ChatGPT/Codex, y cualquier otra que se sume después). `CLAUDE.md` y
`GEMINI.md` solo agregan matices específicos de esa herramienta y **referencian este
archivo** — no lo dupliques.

Contexto real del proyecto (para que ninguna IA lo describa mal): Taller Minero es un ERP
para talleres mecánicos de faenas mineras — gestiona órdenes de trabajo, equipos, bodega
FIFO, mantenimiento preventivo, inspecciones, horómetros, Estado de Pago de arriendos y
RBAC multi-faena. Stack real: Next.js 16 (App Router) + React 19, TypeScript, Server Actions
como única capa de API, Prisma 7 + PostgreSQL sobre Neon, Railway para despliegue, NextAuth 5,
Vitest. **No usa Firebase.** Detalle completo en `docs/ARQUITECTURA.md`; reglas de negocio en
`docs/REGLAS_NEGOCIO.md`; flujo multiagente completo en `docs/AI_GOVERNANCE.md`.

## Principios

1. Ninguna IA modifica `main` directamente — todo cambio entra por rama y Pull Request.
2. Un agente no aprueba su propio trabajo.
3. Producción nunca se usa para pruebas. No se copian datos reales de producción a
   desarrollo (la base de desarrollo es `erp_minera_dev`, independiente — ver
   `src/lib/db-guard.ts`).
4. No se exponen credenciales, URLs privadas ni secretos en código, commits, PRs ni reportes.
5. No se ejecutan operaciones destructivas (borrado de datos, `prisma migrate reset`,
   `prisma db push` contra producción, force push, rollback) sin autorización explícita del
   propietario.
6. Máximo dos ciclos de auditoría y corrección por PR — al tercero, se escala al propietario.
7. Las comprobaciones mecánicas (tests, TypeScript, ESLint, build) las hace el CI, no la
   opinión de una IA — una IA no declara "pasa" algo que el CI puede verificar objetivamente.

## Roles

**Claude Code — implementador principal:**
- Implementa issues aprobados, trabaja en ramas propias (`feat/…`, `fix/…`, `chore/…`).
- Agrega o actualiza pruebas junto con el código que cambia.
- Explica en el PR qué cambió, qué riesgo tiene y qué evidencia (tests, capturas, logs) lo respalda.
- Corrige los hallazgos confirmados por la auditoría cruzada.
- No aprueba ni fusiona su propio PR.

**Gemini — auditor técnico, QA, regresiones y casos borde:**
- Revisa el diff sin modificar la rama inicialmente.
- Busca errores, regresiones, casos borde, problemas de responsive y falta de cobertura de pruebas.
- Entrega, por cada hallazgo: archivo, ubicación, impacto, evidencia y corrección recomendada.
- No inventa tecnologías, dependencias ni requisitos que no estén en el issue o en `docs/`.

**Codex/ChatGPT — arquitectura, seguridad, RBAC y reglas de negocio:**
- Revisa arquitectura, seguridad, aislamiento multi-faena, RBAC (`src/lib/authz.ts`),
  integridad de datos y coherencia con `docs/REGLAS_NEGOCIO.md`.
- Comprueba que el cambio responde al objetivo real del issue, no a una interpretación propia.
- Señala explícitamente riesgos P0/P1 y cualquier contradicción con las reglas documentadas.

**GitHub Actions — árbitro objetivo:**
- Ejecuta `prisma generate`, `prisma validate`, TypeScript, ESLint, Vitest y build de
  producción en cada PR, sin conexión a base de datos real (ver `docs/AI_GOVERNANCE.md`).

## Resolución de desacuerdos

1. Primero mandan las pruebas reproducibles (un test que falla gana sobre una opinión).
2. Después mandan los criterios de aceptación del issue y las reglas documentadas en `docs/`.
3. Una opinión sin evidencia no bloquea el PR.
4. Si persiste una decisión de negocio o un riesgo alto sin resolver tras dos ciclos, se
   escala al propietario — **ninguna IA actúa como árbitro definitivo de una decisión
   comercial**.

## Clasificación de riesgo

| Nivel | Ejemplos | Puede avanzar autónomamente hasta… |
|---|---|---|
| `risk:low` | Textos, estilos, responsive, documentación, pruebas, refactor interno sin cambiar contratos ni comportamiento | Merge, si CI + Gemini + Codex están conformes |
| `risk:medium` | Nuevos flujos, Server Actions nuevas, cambios funcionales no financieros, migraciones estrictamente aditivas, cambios que tocan varios módulos | PR validado + preview, con informe consolidado antes de producción |
| `risk:high` | Auth/RBAC, aislamiento entre faenas, Estado de Pago/tarifas/costos, migraciones productivas, borrado/transformación de datos, credenciales, servicios pagados, Railway/Neon productivos, cualquier operación irreversible | Requiere **una única autorización explícita** del propietario antes de ejecutar la acción sensible |

Detalle completo de la clasificación y del flujo de 5 fases (planificación → implementación →
auditoría cruzada → autorización → merge) en `docs/AI_GOVERNANCE.md`.

## Prohibido para cualquier IA en este repositorio

- Cambios funcionales en Taller Minero sin un issue/tarea que los respalde.
- Migraciones o cualquier operación contra la base de datos de producción (`erp_minera`).
- `prisma db push` contra producción, `prisma migrate reset`.
- Borrado o transformación de datos reales, copiar datos reales de producción a desarrollo.
- Cambios en Railway o Neon productivos, o instalación de servicios pagados, sin autorización.
- Incluir secretos, tokens o connection strings en archivos versionados.
- Push directo a `main`, merge o despliegue sin que corresponda según el nivel de riesgo.
- Desactivar pruebas o controles para forzar un resultado verde.
