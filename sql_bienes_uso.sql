-- Bienes de uso: registro de cada bien (simuladores, equipos, vehículos, muebles, instalaciones) y su amortización mensual.
-- Las cuentas de activo y de amortización acumulada ya existen en el plan (1.2.01 Vehículos, 1.2.02 Muebles y útiles, 1.2.03 Instalaciones, 1.2.04 Equipos).
CREATE TABLE IF NOT EXISTS bienes_uso (
  id uuid DEFAULT gen_random_uuid() PRIMARY KEY,
  sociedad text NOT NULL CHECK (sociedad IN ('SUDES','POINTERS')),
  codigo text,                                   -- código interno o patente / N° de serie
  descripcion text NOT NULL,
  categoria text NOT NULL CHECK (categoria IN ('Vehículos','Muebles y útiles','Instalaciones','Equipos')),
  cuenta_activo text NOT NULL,                   -- código del plan, ej. 1.2.04.001
  cuenta_amort_acum text NOT NULL,               -- código del plan, ej. 1.2.04.002
  proveedor text,
  comprobante_id uuid REFERENCES comprobantes_compra(id) ON DELETE SET NULL,
  fecha_alta date NOT NULL,                      -- fecha de compra / puesta en uso
  valor_origen numeric NOT NULL,                 -- sin IVA
  valor_residual numeric DEFAULT 0,
  vida_util_meses int NOT NULL CHECK (vida_util_meses > 0),
  metodo text DEFAULT 'lineal',
  amort_acum_inicial numeric DEFAULT 0,          -- amortización ya acumulada antes de empezar a calcularla en el panel (apertura)
  amort_desde text,                              -- primer período a amortizar (AAAA-MM)
  estado text DEFAULT 'activo' CHECK (estado IN ('activo','baja')),
  fecha_baja date,
  ubicacion text,
  notas text,
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now()
);
ALTER TABLE bienes_uso ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "Solo autenticados" ON bienes_uso;
CREATE POLICY "Solo autenticados" ON bienes_uso FOR ALL TO authenticated USING (true) WITH CHECK (true);

CREATE TABLE IF NOT EXISTS bienes_uso_amortizaciones (
  id uuid DEFAULT gen_random_uuid() PRIMARY KEY,
  bien_id uuid NOT NULL REFERENCES bienes_uso(id) ON DELETE CASCADE,
  periodo text NOT NULL,                         -- AAAA-MM
  monto numeric NOT NULL,
  asiento_id uuid,
  created_at timestamptz DEFAULT now(),
  UNIQUE (bien_id, periodo)
);
ALTER TABLE bienes_uso_amortizaciones ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "Solo autenticados" ON bienes_uso_amortizaciones;
CREATE POLICY "Solo autenticados" ON bienes_uso_amortizaciones FOR ALL TO authenticated USING (true) WITH CHECK (true);
