# Taller Minero — protocolo de verificación

## Verificación base

Ejecutar desde la raíz:

```bash
npx tsc --noEmit
npm run lint
npm run build
```

Si el proyecto incorpora pruebas, ejecutar también la suite relevante. No ocultar una falla preexistente: registrarla, comparar el baseline y comprobar que el cambio no la aumentó.

## Matriz por tipo de cambio

### UI o responsive

- Flujo afectado funcional.
- Resoluciones aproximadas: 1440, 1024 y 390 px.
- Sin overflow horizontal accidental.
- Estados loading, vacío, error y deshabilitado.
- Accesibilidad básica y controles táctiles.
- Sin cambios involuntarios en Server Actions, payloads o cálculos.

### Autenticación o roles

- Usuario inexistente, inactivo y contraseña incorrecta.
- Acceso permitido y denegado por rol.
- Acción del servidor protegida aunque se invoque sin pasar por la UI.
- Sesión sin rol/faena falla de manera segura.
- Respuesta sin datos sensibles.

### Acción del servidor

- Entrada validada.
- Sesión, rol y `faenaId` comprobados.
- IDs relacionados pertenecen al ámbito correcto.
- Errores no dejan cambios parciales.
- Reintentos no duplican movimientos, costos o historial.

### Prisma o base de datos

- Migración revisada; no sustituirla por `db push` en producción.
- Impacto sobre filas existentes evaluado.
- Relaciones, índices y restricciones coherentes.
- Backfill y rollback definidos cuando corresponda.
- Consultas críticas revisadas por rendimiento.

### OT y equipos

- Crear, asignar, diagnosticar, reparar, validar y cerrar.
- Reapertura e historial.
- Equipo consistente con OTs activas.
- Tiempo detenido y costo sin doble conteo.

### Bodega y repuestos

- Entrada, salida, ajuste y stock insuficiente.
- Dos operaciones concurrentes no producen stock inválido.
- Movimiento, usuario, OT y faena trazables.
- Entrega parcial y costos coherentes.

## Revisión final

```bash
git diff --check
git diff --stat
git status --short
```

El informe final debe indicar:

1. Archivos modificados.
2. Comportamiento implementado.
3. Roles y faenas afectados.
4. Verificaciones ejecutadas y resultado.
5. Datos creados o modificados durante QA.
6. Riesgos o áreas no verificadas.
7. Estado: `READY`, `PARTIALLY VERIFIED` o `NOT READY`.
