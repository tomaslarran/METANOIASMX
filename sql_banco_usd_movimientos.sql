-- ════════════════════════════════════════════════════════════════════════════
-- Movimientos de la cuenta corriente en DÓLARES del Macro (tabla aparte de banco_movimientos,
-- para que los dólares no se mezclen con los pesos en la conciliación). Preparado el 4/11/2026.
-- Correr en Supabase → SQL Editor. Es seguro volver a correrlo.
-- ════════════════════════════════════════════════════════════════════════════

CREATE TABLE IF NOT EXISTS banco_usd_movimientos (
  id uuid DEFAULT gen_random_uuid() PRIMARY KEY,
  sociedad text NOT NULL,
  fecha date NOT NULL,
  referencia text,
  concepto text NOT NULL,
  importe numeric NOT NULL,          -- en dólares: + ingreso / − egreso
  saldo numeric,                     -- saldo en dólares según el extracto
  categoria text,                    -- ingreso_usd | pago_tarjeta | impuesto_25413 | retiro_socio | otro
  cuenta_nro text,
  extracto_id uuid REFERENCES extractos_bancarios(id) ON DELETE CASCADE,
  tc numeric,                        -- cotización / costo con que se llevó a pesos
  importe_ars numeric,               -- importe en pesos (lo que va al asiento)
  conciliado boolean DEFAULT false,
  match_tipo text,
  match_descripcion text,
  asiento_id uuid,
  notas text,
  created_at timestamptz DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_banco_usd_soc_fecha ON banco_usd_movimientos (sociedad, fecha);
ALTER TABLE banco_usd_movimientos ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "Solo autenticados" ON banco_usd_movimientos;
CREATE POLICY "Solo autenticados" ON banco_usd_movimientos FOR ALL TO authenticated USING (true) WITH CHECK (true);
