-- Datos bancarios del proveedor (para transferirle): se completan en Proveedores y la orden de pago los toma de ahí.
ALTER TABLE proveedores ADD COLUMN IF NOT EXISTS cbu text;
ALTER TABLE proveedores ADD COLUMN IF NOT EXISTS alias_cbu text;
ALTER TABLE proveedores ADD COLUMN IF NOT EXISTS banco_cuenta text;
ALTER TABLE proveedores ADD COLUMN IF NOT EXISTS titular_cuenta text;
