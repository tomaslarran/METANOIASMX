-- Facturación electrónica ARCA (WSAA + WSFEv1) — base de datos
-- Correr en Supabase → SQL Editor.

-- 1) Configuración por sociedad (sin secretos: el certificado y la clave van en Supabase → Edge Functions → Secrets)
CREATE TABLE IF NOT EXISTS arca_config (
  sociedad text PRIMARY KEY,                 -- 'SUDES' | 'POINTERS'
  cuit text NOT NULL,
  razon_social text,
  condicion_iva text,                        -- informativo: 'Responsable Inscripto'
  pto_vta int NOT NULL,                      -- punto de venta habilitado para "Factura electrónica - Web Services"
  ambiente text NOT NULL DEFAULT 'homologacion' CHECK (ambiente IN ('homologacion','produccion')),
  activo boolean NOT NULL DEFAULT false,
  cert_vencimiento date,                     -- para alertar la renovación (los certificados duran 2 años)
  updated_at timestamptz DEFAULT now()
);
ALTER TABLE arca_config ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Solo autenticados" ON arca_config FOR ALL TO authenticated USING (true) WITH CHECK (true);

INSERT INTO arca_config (sociedad, cuit, razon_social, condicion_iva, pto_vta, ambiente, activo) VALUES
  ('SUDES',    '30716991179', 'SUDES S.A.S.',    'Responsable Inscripto', 1, 'homologacion', false),
  ('POINTERS', '30716965852', 'POINTERS S.A.S.', 'Responsable Inscripto', 1, 'homologacion', false)
ON CONFLICT (sociedad) DO NOTHING;

-- 2) Cache del ticket de acceso (el WSAA no deja pedir otro mientras el anterior sigue vigente).
--    Sin ninguna policy: solo la Edge Function (service role) puede leerlo. El token da acceso a ARCA en nombre de la sociedad.
CREATE TABLE IF NOT EXISTS arca_tokens (
  sociedad text NOT NULL,
  ambiente text NOT NULL,
  token text NOT NULL,
  sign text NOT NULL,
  expira timestamptz NOT NULL,
  updated_at timestamptz DEFAULT now(),
  PRIMARY KEY (sociedad, ambiente)
);
ALTER TABLE arca_tokens ENABLE ROW LEVEL SECURITY;

-- 3) Comprobantes emitidos
CREATE TABLE IF NOT EXISTS facturas_emitidas (
  id uuid DEFAULT gen_random_uuid() PRIMARY KEY,
  sociedad text NOT NULL,
  ambiente text NOT NULL,
  pto_vta int NOT NULL,
  cbte_tipo int NOT NULL,                    -- 1 Fact A · 6 B · 11 C · 3/8/13 NC · 201/206/211 FCE MiPyME
  cbte_numero bigint NOT NULL,
  fecha date NOT NULL,
  concepto int DEFAULT 2,                    -- 1 productos · 2 servicios · 3 ambos
  receptor_doc_tipo int,                     -- 80 CUIT · 96 DNI · 99 consumidor final
  receptor_doc_nro text,
  receptor_nombre text,
  receptor_cond_iva_id int,                  -- RG 5616: 1 RI · 4 Exento · 5 Cons. final · 6 Monotributo ...
  neto numeric, iva numeric, exento numeric, no_gravado numeric, total numeric,
  alicuotas jsonb,
  items jsonb,
  moneda text DEFAULT 'PES',
  comprobante_asociado jsonb,                -- en notas de crédito/débito
  estado text NOT NULL DEFAULT 'pendiente' CHECK (estado IN ('pendiente','autorizada','rechazada','anulada')),
  resultado text,                            -- A aprobado · R rechazado · P parcial
  cae text,
  cae_vto date,
  observaciones jsonb,
  qr_url text,
  referencia text,                           -- idempotencia: ej. id del pago de la plataforma e-learning
  origen text DEFAULT 'panel',               -- 'panel' | 'elearning'
  cliente_cuit text,                         -- vínculo con elearning_clientes / alumnos (Fase 3)
  asiento_id uuid,                           -- asiento de devengado_venta (Fase 3)
  created_by uuid,
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now(),
  UNIQUE (sociedad, ambiente, pto_vta, cbte_tipo, cbte_numero)
);
CREATE UNIQUE INDEX IF NOT EXISTS facturas_emitidas_ref_uq ON facturas_emitidas (sociedad, ambiente, referencia) WHERE referencia IS NOT NULL;
CREATE INDEX IF NOT EXISTS facturas_emitidas_fecha_idx ON facturas_emitidas (sociedad, fecha DESC);
ALTER TABLE facturas_emitidas ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Solo autenticados" ON facturas_emitidas FOR ALL TO authenticated USING (true) WITH CHECK (true);
