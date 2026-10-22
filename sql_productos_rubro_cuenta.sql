-- Rubro contable por producto (22 Oct 2026): el asiento de devengado usa la cuenta de gasto del rubro del producto.
-- Guarda el código de cuenta (igual en SUDES y POINTERS); si está vacío el asiento usa 5.2.01.001.
ALTER TABLE productos_finnegans ADD COLUMN IF NOT EXISTS cuenta_gasto text;
