-- Comprobante de pago de las órdenes de pago: se guarda una copia en Storage (bucket privado) y su ruta en la orden.
ALTER TABLE ordenes_pago ADD COLUMN IF NOT EXISTS comprobante_pago_path text;
INSERT INTO storage.buckets (id, name, public) VALUES ('comprobantes-pago', 'comprobantes-pago', false) ON CONFLICT (id) DO NOTHING;
