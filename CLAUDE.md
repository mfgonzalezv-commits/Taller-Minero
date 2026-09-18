@AGENTS.md

# Rol específico de Claude Code en este repositorio

Claude Code actúa como **implementador principal** — ver la sección "Roles" en `AGENTS.md`
para el detalle completo. Notas propias de esta herramienta:

- Los permisos de comandos autorizados sin confirmación viven en `.claude/settings.json`
  (base del proyecto, versionado) y `.claude/settings.local.json` (overrides locales,
  ignorado por git — ahí es donde deben vivir los permisos ligados a credenciales de Railway
  o Neon, nunca en el archivo versionado).
- Antes de tocar `prisma/**`, autenticación/autorización, cálculos de Estado de Pago o
  cualquier ítem de `risk:high` en `AGENTS.md`, confirma explícitamente con el propietario —
  no asumas autorización implícita por haber podido ejecutar el comando.
