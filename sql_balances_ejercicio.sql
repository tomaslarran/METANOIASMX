-- Balances de cierre guardados (PDF auditado + cifras principales). Correr una vez en Supabase → SQL Editor.
CREATE TABLE IF NOT EXISTS balances_ejercicio (
  id uuid DEFAULT gen_random_uuid() PRIMARY KEY,
  sociedad text NOT NULL,
  fecha_cierre date NOT NULL,
  archivo_path text,                 -- bucket balances-ejercicio
  activo numeric, pasivo numeric, patrimonio_neto numeric, resultado_ejercicio numeric,
  moneda_homogenea boolean DEFAULT true,
  datos jsonb,                       -- composición por rubro (Nota 3)
  asiento_id uuid,                   -- asiento de apertura generado desde este balance
  notas text,
  created_at timestamptz DEFAULT now(),
  UNIQUE (sociedad, fecha_cierre)
);
ALTER TABLE balances_ejercicio ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "Solo autenticados" ON balances_ejercicio;
CREATE POLICY "Solo autenticados" ON balances_ejercicio FOR ALL TO authenticated USING (true) WITH CHECK (true);

-- Acceso a los PDF (bucket privado balances-ejercicio, ya creado)
DROP POLICY IF EXISTS "balances-ejercicio autenticados" ON storage.objects;
CREATE POLICY "balances-ejercicio autenticados" ON storage.objects
  FOR ALL TO authenticated
  USING (bucket_id = 'balances-ejercicio') WITH CHECK (bucket_id = 'balances-ejercicio');

INSERT INTO balances_ejercicio (sociedad, fecha_cierre, archivo_path, activo, pasivo, patrimonio_neto, resultado_ejercicio, asiento_id, notas) VALUES
 ('SUDES','2026-06-30','SUDES/2026/Balance_SUDES_30-06-2026.pdf',309882223.42,251616005.57,58266217.85,28572721.16,'6c915c34-8f7b-48be-a1b0-3790e0bcdbf3','Balance auditado en moneda homogénea (RT 54), informe del 26/08/2026. Capital 100.000 · Ajuste de capital 3.407.901,28 · Resultados no asignados 54.758.316,57.'),
 ('POINTERS','2026-06-30','POINTERS/2026/Balance_POINTERS_30-06-2026.pdf',256236656.77,217688746.02,38547910.75,12722218.67,'50df9f70-b45e-4846-969e-e0ec323d09a1','Balance auditado en moneda homogénea (RT 54), informe del 07/09/2026. Capital 100.000 · Ajuste de capital 3.407.901,28 · Resultados no asignados 35.040.009,47.')
ON CONFLICT (sociedad, fecha_cierre) DO NOTHING;
