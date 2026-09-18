# Gobierno multiagente — Taller Minero

Este documento describe **cómo** funciona en la práctica lo que `AGENTS.md` declara como
principios. Si hay una contradicción entre ambos, gana `AGENTS.md`.

## Por qué GitHub como oficina común

Ninguna IA tiene visibilidad directa de lo que hacen las otras en tiempo real. El repositorio
(ramas, Pull Requests, Issues, checks de CI) es el único canal compartido y auditable entre
Claude Code, Gemini y Codex — evita que dos agentes trabajen a ciegas sobre el mismo archivo y
deja registro de quién propuso, quién auditó y quién aprobó cada cambio.

## Flujo de 5 fases

1. **Planificación** — el propietario (o Gemini/Codex a su pedido) describe la tarea como
   Issue de GitHub, usando la plantilla correspondiente (`.github/ISSUE_TEMPLATE/`).
2. **Implementación** — Claude Code crea una rama desde `main` actualizado, implementa,
   agrega/actualiza pruebas, y abre un Pull Request usando `.github/pull_request_template.md`.
   El PR debe declarar su `risk:*` (ver clasificación en `AGENTS.md`).
3. **Validación automática** — `.github/workflows/ci.yml` corre en cada push al PR: Prisma
   generate/validate, TypeScript, ESLint, Vitest, build de producción y verificación de
   secretos. Es el primer filtro, objetivo y sin opinión.
4. **Auditoría cruzada** — Gemini revisa el diff (errores, regresiones, casos borde,
   responsive, cobertura de pruebas) y Codex revisa arquitectura/seguridad/RBAC/reglas de
   negocio (ver `docs/REGLAS_NEGOCIO.md`). Máximo dos ciclos de hallazgo→corrección; al
   tercero, se escala al propietario en vez de seguir iterando.
5. **Autorización y merge** — según el nivel de riesgo del PR (tabla en `AGENTS.md`):
   - `risk:low`: puede fusionarse solo si CI + Gemini + Codex están conformes.
   - `risk:medium`: llega autónomamente hasta PR validado y preview; el propietario recibe un
     informe consolidado antes de que algo toque producción.
   - `risk:high`: se detiene y espera **una única autorización explícita** del propietario
     antes de ejecutar la acción sensible (no antes de proponerla).

Ninguna IA fusiona a `main` por sí sola salvo que el propietario haya delegado explícitamente
esa acción para ese PR puntual.

## CI (`.github/workflows/ci.yml`)

El CI **no se conecta a ninguna base de datos real** — se verificó que `prisma generate`,
`prisma validate`, TypeScript, ESLint, `next build` y Vitest corren completos con una
`DATABASE_URL` de marcador de posición (`postgresql://user:pass@localhost:5432/fakedb`),
porque el proyecto usa Server Actions con Prisma vía adapter de Neon, no consultas en tiempo
de build. Si en el futuro un control necesita datos reales, debe usar una base Postgres
temporal levantada dentro del propio job de CI (servicio efímero), nunca `erp_minera` ni
`erp_minera_dev`.

`npm run db:seed` (que borra y recrea datos) y `npm run seed:pautas` **no se ejecutan en CI**
bajo ninguna circunstancia — ambos scripts ya están protegidos por
`src/lib/db-guard.ts::impedirEjecucionEnProduccion()`, que aborta si detecta que
`DATABASE_URL` apunta a la base de producción (`erp_minera`), pero eso protege contra un error
humano, no reemplaza la política de no correrlos en CI.

## Protecciones de GitHub esperadas sobre `main`

Estas protecciones **no se pudieron aplicar desde esta sesión** (requieren acceso web a
GitHub con permisos de administrador del repositorio, o un token con scope `repo`/`admin:org`
que esta sesión no tiene). Quedan documentadas para que el propietario las active — ver la
lista consolidada de acciones manuales en el informe final del PR.

- Bloqueo de push directo a `main` (branch protection rule o ruleset).
- Bloqueo de force push y de eliminación de `main`.
- Pull Request obligatorio antes de fusionar.
- CI (`ci.yml`) obligatorio y en verde antes de fusionar.
- Conversaciones del PR resueltas antes de fusionar.
- Rama actualizada con `main` antes de fusionar.
- `CODEOWNERS` (`.github/CODEOWNERS`) exigiendo revisión en archivos críticos:
  `prisma/**`, `src/lib/auth*.ts`, `src/lib/authz*.ts`, `.github/workflows/**`,
  `src/lib/calculo-estado-pago.ts`, `src/actions/estadoPago.ts`.

## Integración de Claude Code (GitHub Actions)

Producto oficial: **Claude Code GitHub Actions** (Anthropic). Permite mencionar `@claude` en
un Issue o PR para que Claude implemente o responda directamente desde GitHub, con permisos
acotados por workflow.

Pasos manuales pendientes (requieren credenciales del propietario, no se pueden completar
desde esta sesión):
1. Instalar la GitHub App / generar el token de integración desde la cuenta de Anthropic
   Console vinculada al repositorio.
2. Guardar el token como secreto de repositorio en GitHub (`Settings → Secrets and variables
   → Actions`), nunca en un archivo versionado.
3. Agregar el workflow oficial de Claude Code Action (la plantilla se genera desde la propia
   herramienta de instalación de Anthropic; no se incluye aquí un workflow con nombres de
   secreto inventados — ver nota "No inventes configuración" al final de este documento).

## Integración de Gemini (GitHub Actions)

Acción oficial vigente: **`google-github-actions/run-gemini-cli`**. No usar forks ni
repositorios archivados.

Uso recomendado para este proyecto: limitar la ejecución automática a **dos corridas por
PR** — una al abrir/actualizar el PR con cambios sustantivos, y otra después de que Claude
corrija los hallazgos — en vez de ejecutar en cada push, para controlar consumo (ver
"Límites de consumo" abajo).

Pasos manuales pendientes:
1. Obtener una API key de Gemini (Google AI Studio) o configurar Workload Identity Federation
   si se prefiere no usar una key estática.
2. Guardarla como secreto de repositorio (`GEMINI_API_KEY` o el nombre que defina la acción
   oficial en su documentación actual).
3. Agregar el workflow siguiendo la documentación oficial de
   `google-github-actions/run-gemini-cli` (revisar la versión/tag vigente al momento de
   instalarlo, y fijarla a un tag o SHA concreto, no a una rama móvil).

## Integración de Codex (revisión de PR)

OpenAI ofrece revisión de código conectada a GitHub (Codex/ChatGPT code review) que puede
comentar directamente en el PR y seguir instrucciones de un archivo de reglas del
repositorio (`AGENTS.md`, que ya está preparado en la raíz para ese propósito).

Pasos manuales pendientes (esta sesión no tiene forma de verificar el estado exacto de la
oferta de Codex/ChatGPT para este repositorio específico, así que no se documenta como si
ya estuviera disponible):
1. Conectar el repositorio desde la cuenta de OpenAI/ChatGPT correspondiente (Settings de la
   cuenta → Conectores/Integraciones → GitHub).
2. Activar Code Review automático para el repositorio `mfgonzalezv-commits/Taller-Minero`.
3. Confirmar si la oferta vigente permite apuntar explícitamente a `AGENTS.md` como fuente de
   reglas, y si existe un modo de "revisión de seguridad" separado para cambios marcados
   `risk:high` — activarlo si está disponible.

## Límites de consumo

- Máximo dos ciclos completos de revisión (Gemini + Codex) por PR.
- No repetir auditorías si el commit no cambió desde la última corrida.
- Cancelar ejecuciones anteriores del mismo PR cuando se publica un commit nuevo
  (`concurrency` en cada workflow, ver `ci.yml`).
- No ejecutar los tres agentes para cambios que el CI ya resuelve por sí solo (por ejemplo,
  un typo en un comentario no necesita auditoría de Gemini ni de Codex).
- Registrar duración y resultado de cada automatización en el resumen del job de GitHub
  Actions (ya lo hace GitHub por defecto; no se requiere infraestructura adicional).

## No inventes configuración

Este documento describe **solo** integraciones que son productos reales y verificables al
momento de escribirlo (Claude Code GitHub Actions, `google-github-actions/run-gemini-cli`,
Codex/ChatGPT code review). Los nombres exactos de secretos, versiones de acción y pasos de
UI de estos productos cambian con el tiempo — antes de copiar un workflow de ejemplo de
internet, confirma contra la documentación oficial vigente del producto, no contra este
archivo ni contra el entrenamiento de la IA que lo esté configurando.
