# Monitoreo del piloto

Consultas de **solo lectura** (`src/lib/monitoreo.ts`). Revisar cada mañana durante los 5–10 días del piloto.

```
npx tsx scripts/monitoreo.ts --faena <CODIGO>
# producción: railway run --service Taller-Minero -- npx tsx scripts/monitoreo.ts --faena <CODIGO>
```

| Consulta | Qué significa una fila | Qué hacer |
|---|---|---|
| OT abiertas sin movimiento (3+ días) | OT olvidada o bloqueada | preguntar al Jefe de Taller por qué; ¿falta repuesto o técnico? |
| Diferencias entre stock y lotes | **Grave**: el stock no coincide con los lotes (o hay negativos) | detener movimientos de ese ítem y avisar; no debería ocurrir |
| Horómetros pendientes | salto anómalo sin confirmar; no cuenta para nada hasta entonces | Jefe/Planificador debe confirmar o rechazar |
| Alertas de inspección sin OT (24+ h) | hallazgo sin gestionar | Jefe convierte en OT o descarta |
| Intentos rechazados por permisos | alguien intentó algo que su rol no permite | pocos = aprendizaje; repetidos = capacitar o revisar |
| SR/repuestos detenidos o inconsistentes | SR sin avanzar 3+ días, SR entregada sin historial, compra directa sin regularizar 15+ días, repuesto sin entregar | destrabar con Bodega/Compras |
| Estados de Pago aprobados sin líneas | anomalía conocida (1 en producción, no se modifica) | solo informativo |

Los intentos rechazados por permisos se guardan en la tabla de auditoría (`accion = 'DENEGADO'`) desde este PR; no existen registros anteriores.

**Umbrales** ajustables en `ejecutarMonitoreo` (`diasOtSinMovimiento`, `diasSrDetenida`, `horasAlertaSinOt`, `diasPermisos`).

## SQL equivalente (por si prefieres consultar directo)
```sql
-- stock vs lotes
SELECT i.codigo, i.stock_actual, COALESCE(SUM(l.cantidad_saldo),0) AS lotes
FROM items_bodega i LEFT JOIN lotes_bodega l ON l.item_id = i.id
GROUP BY i.id HAVING ABS(i.stock_actual - COALESCE(SUM(l.cantidad_saldo),0)) > 0.005;

-- horómetros pendientes
SELECT * FROM horometro_km WHERE validado = false AND origen = 'pendiente_confirmacion';

-- intentos rechazados por permisos (últimos 7 días)
SELECT usuario_id, motivo, COUNT(*) FROM registro_auditoria
WHERE accion = 'DENEGADO' AND created_at > now() - interval '7 days' GROUP BY 1, 2 ORDER BY 3 DESC;
```

## Además, cada día
- Railway: revisar logs por errores 500 (`Error`, `Unhandled`).
- Confirmar con el Jefe de Taller que no hay bloqueos operativos que el sistema impida.
