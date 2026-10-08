-- Echeq propios como medio de pago (pago diferido): emitir el Echeq paga la factura; el banco lo debita en la fecha de pago.
-- Correr UNA vez en Supabase → SQL Editor.

-- 1) Medios de pago: nuevo tipo 'echeq' y a qué cuenta bancaria se debita
ALTER TABLE medios_pago DROP CONSTRAINT IF EXISTS medios_pago_tipo_check;
ALTER TABLE medios_pago ADD CONSTRAINT medios_pago_tipo_check
  CHECK (tipo IN ('cuenta_bancaria','tarjeta','efectivo','cheque','cuenta_socio','echeq'));
ALTER TABLE medios_pago ADD COLUMN IF NOT EXISTS cuenta_bancaria_id uuid;

-- 2) Cuenta puente: Echeq emitidos que el banco todavía no debitó
INSERT INTO plan_cuentas (codigo,nombre,tipo,naturaleza,cuenta_padre_id,nivel,imputable,activa)
SELECT '2.1.01.002','Echeq emitidos pendientes de débito','pasivo','acreedora',(SELECT id FROM plan_cuentas WHERE codigo='2.1.01'),4,true,true
WHERE NOT EXISTS (SELECT 1 FROM plan_cuentas WHERE codigo='2.1.01.002');

-- 3) Tipo de asiento nuevo (se conserva toda la lista anterior)
ALTER TABLE asientos_contables DROP CONSTRAINT IF EXISTS asientos_contables_tipo_check;
ALTER TABLE asientos_contables ADD CONSTRAINT asientos_contables_tipo_check
  CHECK (tipo IN ('devengado_compra','pago_compra','devengado_venta','cobro_venta','sueldo','ajuste','apertura',
                  'pago_cuota_prestamo','ajuste_manual','gastos_bancarios','liquidacion_tarjeta',
                  'devengado_impuesto','pago_impuesto','debito_echeq'));

-- 4) Registro de Echeq propios
CREATE TABLE IF NOT EXISTS echeqs_propios (
  id uuid DEFAULT gen_random_uuid() PRIMARY KEY,
  sociedad text NOT NULL,
  medio text,                          -- medio de pago usado (ej. ECHEQ MACRO SUDES)
  cuenta_bancaria text,                -- cuenta que se debita (ej. CTA CTE MACRO SUDES)
  banco text,
  numero text,                         -- número de cheque
  id_cheque text,                      -- identificador del Echeq (ej. JXON1Q7J54V2Z64)
  tipo_cheque text,                    -- CPD (pago diferido) / CC (común)
  caracter text,                       -- ej. A la orden
  cmc7 text,
  cp_sucursal text,
  cuenta_emisor text,
  emisor_cuit text,
  emisor_razon text,
  concepto text,
  monto numeric NOT NULL,
  fecha_emision date,
  fecha_pago date,                     -- cuando el banco lo debita
  beneficiario text,
  beneficiario_cuit text,
  comprobante_id uuid,                 -- factura que paga
  orden_pago_id uuid,
  estado text NOT NULL DEFAULT 'emitido' CHECK (estado IN ('emitido','debitado','anulado','rechazado')),
  fecha_debito date,
  banco_movimiento_id uuid,
  asiento_debito_id uuid,
  pdf_path text,                       -- PDF original del banco (bucket extractos-bancarios, carpeta echeqs/)
  observaciones text,
  creado_por text,
  created_at timestamptz DEFAULT now()
);
CREATE INDEX IF NOT EXISTS echeqs_propios_estado_idx ON echeqs_propios (sociedad, estado, fecha_pago);
ALTER TABLE echeqs_propios ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "Solo autenticados" ON echeqs_propios;
CREATE POLICY "Solo autenticados" ON echeqs_propios FOR ALL TO authenticated USING (true) WITH CHECK (true);

-- 5) Un medio Echeq por cada cuenta corriente Macro existente (los de ICBC se agregan desde el panel)
INSERT INTO medios_pago (tipo,nombre,banco,sociedad,activo,orden,cuenta_bancaria_id)
SELECT 'echeq','ECHEQ MACRO '||m.sociedad,m.banco,m.sociedad,true,10,m.id
FROM medios_pago m
WHERE m.tipo='cuenta_bancaria' AND m.nombre IN ('CTA CTE MACRO SUDES','CTA CTE MACRO POINTERS')
  AND NOT EXISTS (SELECT 1 FROM medios_pago x WHERE x.nombre='ECHEQ MACRO '||m.sociedad);
