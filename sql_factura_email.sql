-- Email del receptor de cada factura emitida (para reenviarla sin volver a buscarlo).
ALTER TABLE facturas_emitidas ADD COLUMN IF NOT EXISTS receptor_email text;
