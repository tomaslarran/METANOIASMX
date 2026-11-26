-- 1) Seguimiento de circularizaciones de saldos (quién, cuándo, qué saldo se informó y qué respondió el proveedor)
CREATE TABLE IF NOT EXISTS circularizaciones (
  id uuid DEFAULT gen_random_uuid() PRIMARY KEY,
  proveedor_id uuid REFERENCES proveedores(id) ON DELETE SET NULL,
  proveedor text,
  cuit text,
  sociedad text NOT NULL,
  ejercicio text,
  email text,
  saldo numeric NOT NULL,
  enviado_por text,
  enviado_en timestamptz DEFAULT now(),
  respuesta text DEFAULT 'pendiente' CHECK (respuesta IN ('pendiente','conforme','diferencia')),
  saldo_proveedor numeric,
  observaciones text,
  respondido_en timestamptz
);
ALTER TABLE circularizaciones ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "Solo autenticados" ON circularizaciones;
CREATE POLICY "Solo autenticados" ON circularizaciones FOR ALL TO authenticated USING (true) WITH CHECK (true);

-- 2) Toda factura nueva queda vinculada al proveedor por CUIT: si el CUIT (11 dígitos válidos) no tiene proveedor, se crea "sin revisar".
--    Cubre todos los caminos de carga (formulario, importación de ARCA, WhatsApp, lectura con IA).
CREATE OR REPLACE FUNCTION comprobante_vincular_proveedor() RETURNS trigger LANGUAGE plpgsql AS $$
DECLARE
  c text; pid uuid; s int; v int;
  m int[] := ARRAY[5,4,3,2,7,6,5,4,3,2];
BEGIN
  IF NEW.proveedor_maestro_id IS NOT NULL THEN RETURN NEW; END IF;
  c := regexp_replace(coalesce(NEW.cuit, ''), '\D', '', 'g');
  IF length(c) <> 11 THEN RETURN NEW; END IF;
  s := 0;
  FOR i IN 1..10 LOOP s := s + substr(c, i, 1)::int * m[i]; END LOOP;
  v := 11 - (s % 11);
  IF v = 11 THEN v := 0; END IF;
  IF v = 10 THEN v := 9; END IF;
  IF v <> substr(c, 11, 1)::int THEN RETURN NEW; END IF;   -- CUIT con dígito verificador inválido: no se vincula
  SELECT id INTO pid FROM proveedores WHERE regexp_replace(coalesce(cuit, ''), '\D', '', 'g') = c LIMIT 1;
  IF pid IS NULL THEN
    INSERT INTO proveedores (nombre, cuit, tipo, condicion_iva, revisado, activo, notas)
    VALUES (
      coalesce(nullif(trim(NEW.proveedor), ''), c),
      substr(c,1,2) || '-' || substr(c,3,8) || '-' || substr(c,11,1),
      'Empresa',
      CASE WHEN NEW.tipo LIKE 'A%' OR NEW.tipo LIKE 'NC-A%' THEN 'responsable_inscripto' WHEN NEW.tipo = 'C' THEN 'monotributo' ELSE NULL END,
      false, true,
      'Creado automáticamente al cargar una factura. Revisar situación de IIBB y email.'
    ) RETURNING id INTO pid;
  END IF;
  NEW.proveedor_maestro_id := pid;
  RETURN NEW;
END $$;

DROP TRIGGER IF EXISTS trg_comprobante_proveedor ON comprobantes_compra;
CREATE TRIGGER trg_comprobante_proveedor BEFORE INSERT ON comprobantes_compra
  FOR EACH ROW EXECUTE FUNCTION comprobante_vincular_proveedor();
