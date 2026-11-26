-- Orden de pago: número de operación / referencia de la transferencia (opcional, se carga al pagar la orden).
-- Sin esta columna el pago igual se registra; solo avisa que no pudo guardar el número.
ALTER TABLE ordenes_pago ADD COLUMN IF NOT EXISTS nro_operacion text;
