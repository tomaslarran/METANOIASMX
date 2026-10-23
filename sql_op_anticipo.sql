-- Descontar un anticipo abierto del proveedor en la orden de pago (22/23 Oct 2026).
-- La orden guarda cuánto del anticipo descuenta y de cuál; recién al pagar la orden se cancela el anticipo contra la factura.
ALTER TABLE ordenes_pago ADD COLUMN IF NOT EXISTS anticipo_aplicado numeric DEFAULT 0;
ALTER TABLE ordenes_pago ADD COLUMN IF NOT EXISTS anticipo_id uuid;
