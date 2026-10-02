-- ══ Extractos bancarios, resúmenes guardados y cierre de tarjeta (2 Oct 2026) ══

-- 1) Bucket privado para los PDF originales de los resúmenes
INSERT INTO storage.buckets (id, name, public) VALUES ('extractos-bancarios','extractos-bancarios', false)
ON CONFLICT (id) DO NOTHING;
CREATE POLICY "extractos-bancarios autenticados" ON storage.objects
  FOR ALL TO authenticated
  USING (bucket_id = 'extractos-bancarios') WITH CHECK (bucket_id = 'extractos-bancarios');

-- 2) Un registro por extracto importado
CREATE TABLE IF NOT EXISTS extractos_bancarios (
  id uuid DEFAULT gen_random_uuid() PRIMARY KEY,
  sociedad text NOT NULL,
  banco text DEFAULT 'MACRO',
  cuit text,
  periodo_desde date NOT NULL,
  periodo_hasta date NOT NULL,
  archivo_path text,
  nombre_archivo text,
  saldo_inicial numeric,
  saldo_final numeric,
  cantidad_movimientos int,
  resumen jsonb,
  asiento_id uuid,
  estado text DEFAULT 'importado' CHECK (estado IN ('importado','contabilizado')),
  creado_por text,
  created_at timestamptz DEFAULT now(),
  UNIQUE (sociedad, periodo_desde, periodo_hasta)
);
ALTER TABLE extractos_bancarios ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Solo autenticados" ON extractos_bancarios FOR ALL TO authenticated USING (true) WITH CHECK (true);

-- 3) Pagos de tarjeta (resumen Visa) cerrados contra el débito del banco
CREATE TABLE IF NOT EXISTS liquidaciones_tarjeta (
  id uuid DEFAULT gen_random_uuid() PRIMARY KEY,
  sociedad text NOT NULL,
  medio_pago text,
  fecha date NOT NULL,
  monto_banco numeric NOT NULL,
  cargos_financieros numeric DEFAULT 0,
  total_facturas numeric DEFAULT 0,
  cantidad_facturas int DEFAULT 0,
  banco_movimiento_id uuid,
  asiento_id uuid,
  creado_por text,
  created_at timestamptz DEFAULT now()
);
ALTER TABLE liquidaciones_tarjeta ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Solo autenticados" ON liquidaciones_tarjeta FOR ALL TO authenticated USING (true) WITH CHECK (true);

-- 4) Columnas nuevas
ALTER TABLE banco_movimientos ADD COLUMN IF NOT EXISTS cuenta_nro text;
ALTER TABLE banco_movimientos ADD COLUMN IF NOT EXISTS categoria text;
ALTER TABLE banco_movimientos ADD COLUMN IF NOT EXISTS asiento_id uuid;
ALTER TABLE banco_movimientos ADD COLUMN IF NOT EXISTS extracto_id uuid;
ALTER TABLE comprobantes_compra ADD COLUMN IF NOT EXISTS liquidacion_tarjeta_id uuid;
ALTER TABLE datos_fiscales_sociedad ADD COLUMN IF NOT EXISTS mipyme_vigente boolean DEFAULT false;
ALTER TABLE datos_fiscales_sociedad ADD COLUMN IF NOT EXISTS mipyme_vencimiento date;

-- 5) Tipos de asiento nuevos
ALTER TABLE asientos_contables DROP CONSTRAINT IF EXISTS asientos_contables_tipo_check;
ALTER TABLE asientos_contables ADD CONSTRAINT asientos_contables_tipo_check
  CHECK (tipo IN ('devengado_compra','pago_compra','devengado_venta','cobro_venta','sueldo','ajuste','apertura','pago_cuota_prestamo','ajuste_manual','gastos_bancarios','liquidacion_tarjeta'));

-- 6) Cierre de mes (se usa en la próxima etapa)
CREATE TABLE IF NOT EXISTS cierres_mensuales (
  id uuid DEFAULT gen_random_uuid() PRIMARY KEY,
  sociedad text NOT NULL,
  periodo text NOT NULL,
  estado text DEFAULT 'cerrado' CHECK (estado IN ('abierto','cerrado')),
  cerrado_por text,
  cerrado_en timestamptz,
  snapshot jsonb,
  notas text,
  created_at timestamptz DEFAULT now(),
  UNIQUE (sociedad, periodo)
);
ALTER TABLE cierres_mensuales ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Solo autenticados" ON cierres_mensuales FOR ALL TO authenticated USING (true) WITH CHECK (true);

-- 7) Archivo del certificado MiPyME
ALTER TABLE datos_fiscales_sociedad ADD COLUMN IF NOT EXISTS mipyme_archivo_path text;
