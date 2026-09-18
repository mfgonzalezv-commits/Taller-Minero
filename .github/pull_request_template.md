<!--
Antes de abrir este PR, revisa AGENTS.md y docs/AI_GOVERNANCE.md.
Completa TODAS las secciones — un PR sin nivel de riesgo declarado no puede auditarse.
-->

## Qué cambia y por qué

<!-- Descripción breve. Enlaza el Issue si existe: Closes #__ -->

## Nivel de riesgo

<!-- Marca uno. Ver la tabla completa en AGENTS.md. -->

- [ ] `risk:low` — textos, estilos, responsive, documentación, pruebas, refactor sin cambiar comportamiento
- [ ] `risk:medium` — nuevos flujos, Server Actions nuevas, cambios funcionales no financieros, migraciones aditivas
- [ ] `risk:high` — auth/RBAC, aislamiento entre faenas, Estado de Pago/tarifas/costos, migraciones productivas, borrado de datos, credenciales

Si es `risk:high`: **este PR no debe fusionarse ni ejecutar la acción sensible sin
autorización explícita del propietario**, aunque CI y la auditoría cruzada estén conformes.

## Evidencia

<!-- ¿Cómo se comprueba que funciona? Resultados de tests, capturas, logs, comandos ejecutados. -->

## Server Actions / rutas tocadas

<!-- Lista de src/actions/*.ts y rutas de src/app/ modificadas, para que Codex sepa dónde mirar RBAC/aislamiento por faena. -->

## Pruebas agregadas o actualizadas

<!-- Archivo(s) en tests/. Si no se agregó ninguna, explica por qué no aplica. -->

## Checklist antes de pedir auditoría

- [ ] `npm test`, `npx tsc --noEmit`, `npx eslint .` y `npm run build` pasan localmente
- [ ] No hay `.env`, credenciales ni connection strings en el diff
- [ ] No se tocó producción (Railway/Neon productivo) ni se copiaron datos reales
- [ ] Si el cambio afecta reglas de `docs/REGLAS_NEGOCIO.md`, ese documento se actualizó en este mismo PR
