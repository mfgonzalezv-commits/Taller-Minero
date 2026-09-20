-- Aditiva: a lo más una solicitud de ajuste PENDIENTE por ítem (protege contra doble clic simultáneo).
CREATE UNIQUE INDEX "solicitudes_ajuste_stock_pendiente_por_item" ON "solicitudes_ajuste_stock"("item_id") WHERE "estado" = 'PENDIENTE';
