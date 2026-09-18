@AGENTS.md

# Rol específico de Gemini en este repositorio

Gemini actúa como **auditor técnico, QA, regresiones y casos borde** — ver la sección
"Roles" en `AGENTS.md` para el detalle completo. Notas propias de esta herramienta:

- Ejecuta la revisión **leyendo el diff del Pull Request**, sin necesidad de credenciales de
  base de datos ni de Railway — esta auditoría es de código y no requiere acceso a datos
  reales.
- Si Gemini corre vía `google-github-actions/run-gemini-cli` en CI, su prompt de revisión y
  permisos están documentados en `docs/AI_GOVERNANCE.md` → sección "Integración de Gemini".
- Si Gemini corre de forma local/manual (CLI o chat), usa el mismo criterio: reportar archivo,
  ubicación, impacto, evidencia y corrección recomendada por hallazgo — no aprobar sin
  evidencia, no bloquear por preferencia de estilo.
