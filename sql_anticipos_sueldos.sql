-- Anticipos de sueldo a quienes cobran sin factura (Sueldos → «Anticipo sueldos»)
-- Se cancela al pagar el sueldo del mes (el panel descuenta el anticipo del importe a transferir).
CREATE TABLE IF NOT EXISTS anticipos_sueldos (
  id uuid DEFAULT gen_random_uuid() PRIMARY KEY,
  empleado_id uuid REFERENCES cf_empleados(id) ON DELETE CASCADE,
  empleado text,
  sociedad text NOT NULL,
  fecha date NOT NULL,
  monto numeric NOT NULL,
  medio text,
  nro_operacion text,
  concepto text,
  monto_aplicado numeric DEFAULT 0,
  aplicaciones jsonb DEFAULT '[]',
  estado text DEFAULT 'abierto' CHECK (estado IN ('abierto','cancelado')),
  asiento_id uuid,
  creado_por text,
  created_at timestamptz DEFAULT now()
);
ALTER TABLE anticipos_sueldos ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "Solo autenticados" ON anticipos_sueldos;
CREATE POLICY "Solo autenticados" ON anticipos_sueldos FOR ALL TO authenticated USING (true) WITH CHECK (true);
