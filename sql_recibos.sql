-- Recibos de cobro emitidos a clientes (un recibo puede cancelar varias facturas emitidas).
-- Correr en Supabase → SQL Editor.
CREATE TABLE IF NOT EXISTS recibos (
  id uuid DEFAULT gen_random_uuid() PRIMARY KEY,
  sociedad text NOT NULL,
  numero text NOT NULL,                 -- R-0001-00000001 (numeración propia por sociedad)
  numero_int int NOT NULL,
  fecha date NOT NULL,
  cliente_cuit text,
  cliente_nombre text,
  op_cliente text,                      -- N° de la orden de pago del cliente (la que trae las retenciones)
  total numeric NOT NULL,               -- total aplicado a facturas
  valores jsonb DEFAULT '[]',           -- [{tipo, importe, detalle, fecha}] lo que entregó el cliente
  retenciones jsonb DEFAULT '[]',       -- [{tipo, importe, certificado}] retenciones sufridas
  observaciones text,
  estado text DEFAULT 'emitido' CHECK (estado IN ('emitido','anulado')),
  asiento_id uuid,
  movimientos jsonb DEFAULT '[]',       -- ids de caja/banco/cobranza creados, para poder anular
  creado_por text,
  created_at timestamptz DEFAULT now(),
  UNIQUE (sociedad, numero)
);
ALTER TABLE recibos ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Solo autenticados" ON recibos FOR ALL TO authenticated USING (true) WITH CHECK (true);

CREATE TABLE IF NOT EXISTS recibo_facturas (
  id uuid DEFAULT gen_random_uuid() PRIMARY KEY,
  recibo_id uuid NOT NULL REFERENCES recibos(id) ON DELETE CASCADE,
  factura_id uuid NOT NULL REFERENCES facturas_emitidas(id),
  importe numeric NOT NULL,
  created_at timestamptz DEFAULT now()
);
ALTER TABLE recibo_facturas ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Solo autenticados" ON recibo_facturas FOR ALL TO authenticated USING (true) WITH CHECK (true);

-- Los cheques recibidos con un recibo quedan en Cobranzas vinculados a él
ALTER TABLE cf_cobranzas ADD COLUMN IF NOT EXISTS recibo_id uuid;
