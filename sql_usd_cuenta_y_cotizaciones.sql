-- ════════════════════════════════════════════════════════════════════════════
-- Cuenta en dólares del Macro + facturas del exterior (Anthropic) + cotizaciones
-- Preparado el 4/11/2026. Correr en Supabase → SQL Editor (es seguro volver a correrlo).
-- Hasta que se corra, el panel sigue funcionando igual: la cuenta en USD simplemente no se importa.
-- ════════════════════════════════════════════════════════════════════════════

-- 1) Líneas del banco: moneda y cotización usada para pasarlas a pesos
--    - moneda: 'ARS' (todas las que ya existen) o 'USD'
--    - tc: cotización con que se llevó a pesos el movimiento en dólares
--    - importe_ars: importe en pesos = importe × tc (lo que va al asiento)
ALTER TABLE banco_movimientos ADD COLUMN IF NOT EXISTS moneda text DEFAULT 'ARS';
ALTER TABLE banco_movimientos ADD COLUMN IF NOT EXISTS tc numeric;
ALTER TABLE banco_movimientos ADD COLUMN IF NOT EXISTS importe_ars numeric;
UPDATE banco_movimientos SET moneda = 'ARS' WHERE moneda IS NULL;
CREATE INDEX IF NOT EXISTS idx_banco_mov_moneda ON banco_movimientos (sociedad, moneda, fecha);

-- 2) Comprobantes en moneda extranjera (Anthropic y otros proveedores del exterior, sin CUIT)
ALTER TABLE comprobantes_compra ADD COLUMN IF NOT EXISTS moneda text DEFAULT 'ARS';
ALTER TABLE comprobantes_compra ADD COLUMN IF NOT EXISTS importe_usd numeric;      -- total del invoice en dólares
ALTER TABLE comprobantes_compra ADD COLUMN IF NOT EXISTS tc numeric;               -- cotización con que se llevó a pesos
ALTER TABLE comprobantes_compra ADD COLUMN IF NOT EXISTS invoice_externo text;     -- N° de invoice del proveedor (KORDNRE5-0009)
ALTER TABLE comprobantes_compra ADD COLUMN IF NOT EXISTS recibo_externo text;      -- N° de recibo (2162-1975-6599)
UPDATE comprobantes_compra SET moneda = 'ARS' WHERE moneda IS NULL;

-- 3) Cotizaciones del dólar por día (BNA y BCRA). Se completa sola desde el panel; se puede corregir a mano.
CREATE TABLE IF NOT EXISTS cotizaciones_usd (
  fecha date PRIMARY KEY,
  bna_compra numeric,
  bna_venta numeric,
  bcra_a3500 numeric,
  fuente text,
  created_at timestamptz DEFAULT now()
);
ALTER TABLE cotizaciones_usd ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "Solo autenticados" ON cotizaciones_usd;
CREATE POLICY "Solo autenticados" ON cotizaciones_usd FOR ALL TO authenticated USING (true) WITH CHECK (true);

-- 4) Verificación (opcional)
--   SELECT column_name FROM information_schema.columns WHERE table_name = 'banco_movimientos' AND column_name IN ('moneda','tc','importe_ars');
--   SELECT column_name FROM information_schema.columns WHERE table_name = 'comprobantes_compra' AND column_name IN ('moneda','importe_usd','tc','invoice_externo','recibo_externo');
--   SELECT count(*) FROM cotizaciones_usd;
