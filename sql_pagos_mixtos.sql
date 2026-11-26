-- Pagos en varias líneas (Echeq + transferencia + efectivo…), pagos parciales con saldo y cartera de Echeq de terceros (endoso).
-- Correr UNA vez en Supabase → SQL Editor. Es seguro volver a correrlo.

-- 1) Facturas: cuánto se pagó (bruto) — el saldo es total − monto_pagado
ALTER TABLE comprobantes_compra ADD COLUMN IF NOT EXISTS monto_pagado numeric DEFAULT 0;

-- 2) Cada línea de pago de una factura (un medio, un monto). Un mismo pago puede tener varias líneas.
CREATE TABLE IF NOT EXISTS comprobante_pagos (
  id uuid DEFAULT gen_random_uuid() PRIMARY KEY,
  comprobante_id uuid NOT NULL,
  orden_pago_id uuid,                  -- si el pago salió de una orden de pago
  evento_id uuid,                      -- agrupa las líneas de un mismo acto de pago
  sociedad text,
  fecha date NOT NULL,
  medio text,                          -- nombre del medio (ej. CTA CTE MACRO SUDES, ECHEQ MACRO SUDES)
  tipo_medio text,                     -- cuenta_bancaria | efectivo | echeq | endoso | tarjeta | cuenta_socio | cheque
  monto numeric NOT NULL,              -- lo que sale por esta línea
  echeq_propio_id uuid,                -- Echeq propio emitido en esta línea
  cobranza_id uuid,                    -- Echeq de terceros endosado en esta línea (cf_cobranzas)
  nro_operacion text,
  observaciones text,
  creado_por text,
  created_at timestamptz DEFAULT now()
);
CREATE INDEX IF NOT EXISTS comprobante_pagos_comp_idx ON comprobante_pagos (comprobante_id);
CREATE INDEX IF NOT EXISTS comprobante_pagos_op_idx ON comprobante_pagos (orden_pago_id);
ALTER TABLE comprobante_pagos ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "Solo autenticados" ON comprobante_pagos;
CREATE POLICY "Solo autenticados" ON comprobante_pagos FOR ALL TO authenticated USING (true) WITH CHECK (true);

-- 3) Cartera de Echeq de terceros (cheques que nos entregan los clientes): datos del cheque y endoso
ALTER TABLE cf_cobranzas DROP CONSTRAINT IF EXISTS cf_cobranzas_estado_check;
ALTER TABLE cf_cobranzas ADD CONSTRAINT cf_cobranzas_estado_check
  CHECK (estado IN ('Pendiente','Cobrado','Vencido','Endosado'));
ALTER TABLE cf_cobranzas ADD COLUMN IF NOT EXISTS numero_cheque text;
ALTER TABLE cf_cobranzas ADD COLUMN IF NOT EXISTS id_cheque text;
ALTER TABLE cf_cobranzas ADD COLUMN IF NOT EXISTS banco_emisor text;
ALTER TABLE cf_cobranzas ADD COLUMN IF NOT EXISTS librador text;
ALTER TABLE cf_cobranzas ADD COLUMN IF NOT EXISTS librador_cuit text;
ALTER TABLE cf_cobranzas ADD COLUMN IF NOT EXISTS fecha_emision date;
ALTER TABLE cf_cobranzas ADD COLUMN IF NOT EXISTS tipo_cheque text;
ALTER TABLE cf_cobranzas ADD COLUMN IF NOT EXISTS cmc7 text;
ALTER TABLE cf_cobranzas ADD COLUMN IF NOT EXISTS pdf_path text;
ALTER TABLE cf_cobranzas ADD COLUMN IF NOT EXISTS endosado_a text;
ALTER TABLE cf_cobranzas ADD COLUMN IF NOT EXISTS endosado_cuit text;
ALTER TABLE cf_cobranzas ADD COLUMN IF NOT EXISTS endosado_en date;
ALTER TABLE cf_cobranzas ADD COLUMN IF NOT EXISTS endoso_comprobante_id uuid;

-- 4) Cuenta contable: cheques de terceros en cartera (se acredita al endosarlos)
INSERT INTO plan_cuentas (codigo,nombre,tipo,naturaleza,cuenta_padre_id,nivel,imputable,activa)
SELECT '1.1.01.005','Cheques de terceros en cartera','activo','deudora',(SELECT id FROM plan_cuentas WHERE codigo='1.1.01'),4,true,true
WHERE NOT EXISTS (SELECT 1 FROM plan_cuentas WHERE codigo='1.1.01.005');
