-- Pagos anticipados a proveedores sin factura (ej. UNT): se paga primero y el proveedor entrega un recibo después.
-- Correr UNA vez en Supabase → SQL Editor. Es seguro volver a correrlo.

CREATE TABLE IF NOT EXISTS anticipos_proveedores (
  id uuid DEFAULT gen_random_uuid() PRIMARY KEY,
  sociedad text NOT NULL,
  proveedor_id uuid,
  proveedor text NOT NULL,
  cuit text,
  fecha date NOT NULL,
  monto numeric NOT NULL,
  concepto text,
  medio text,
  nro_operacion text,
  orden_pago_id uuid,
  estado text DEFAULT 'abierto' CHECK (estado IN ('abierto','cancelado','anulado')),
  monto_aplicado numeric DEFAULT 0,
  recibos jsonb DEFAULT '[]',          -- [{numero, fecha, monto, cuenta, asiento_id}]
  asiento_pago_id uuid,
  creado_por text,
  created_at timestamptz DEFAULT now()
);
CREATE INDEX IF NOT EXISTS anticipos_prov_estado_idx ON anticipos_proveedores (estado, sociedad);
ALTER TABLE anticipos_proveedores ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "Solo autenticados" ON anticipos_proveedores;
CREATE POLICY "Solo autenticados" ON anticipos_proveedores FOR ALL TO authenticated USING (true) WITH CHECK (true);

-- Cuenta contable: lo pagado por adelantado es un activo hasta que llega el recibo
INSERT INTO plan_cuentas (codigo,nombre,tipo,naturaleza,cuenta_padre_id,nivel,imputable,activa)
SELECT '1.1.05','Anticipos a proveedores','activo','deudora',(SELECT id FROM plan_cuentas WHERE codigo='1.1'),3,false,true
WHERE NOT EXISTS (SELECT 1 FROM plan_cuentas WHERE codigo='1.1.05');
INSERT INTO plan_cuentas (codigo,nombre,tipo,naturaleza,cuenta_padre_id,nivel,imputable,activa)
SELECT '1.1.05.001','Anticipos a proveedores','activo','deudora',(SELECT id FROM plan_cuentas WHERE codigo='1.1.05'),4,true,true
WHERE NOT EXISTS (SELECT 1 FROM plan_cuentas WHERE codigo='1.1.05.001');
