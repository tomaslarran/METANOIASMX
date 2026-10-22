-- Maestro de clientes (22 Oct 2026). El CUIT (11 dígitos, sin guiones) es el identificador.
-- Cada sociedad mantiene su propia relación con el cliente en clientes_sociedad.
-- Correr UNA vez en Supabase → SQL Editor. Es seguro volver a correrlo.
CREATE TABLE IF NOT EXISTS clientes (
  id uuid DEFAULT gen_random_uuid() PRIMARY KEY,
  cuit text NOT NULL,
  razon_social text NOT NULL,
  nombre_fantasia text,
  condicion_iva_id int,          -- código ARCA: 1 RI, 4 exento, 5 consumidor final, 6 monotributo, 7 no categorizado, 13 monotributista social, 15 no alcanzado
  tipo_persona text,             -- fisica | juridica
  email text,
  email_cc text,
  telefono text,
  domicilio text,
  localidad text,
  provincia text,
  cp text,
  retiene_ganancias boolean DEFAULT false,
  retiene_iva boolean DEFAULT false,
  retiene_iibb boolean DEFAULT false,
  retiene_suss boolean DEFAULT false,
  origen text,                   -- factura | plataforma | alumno | manual
  notas text,
  activo boolean DEFAULT true,
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now()
);
CREATE UNIQUE INDEX IF NOT EXISTS clientes_cuit_uq ON clientes (cuit);

CREATE TABLE IF NOT EXISTS clientes_sociedad (
  id uuid DEFAULT gen_random_uuid() PRIMARY KEY,
  cliente_id uuid NOT NULL REFERENCES clientes(id) ON DELETE CASCADE,
  sociedad text NOT NULL CHECK (sociedad IN ('SUDES','POINTERS')),
  activo boolean DEFAULT true,
  condicion_pago text,
  notas text,
  created_at timestamptz DEFAULT now(),
  UNIQUE (cliente_id, sociedad)
);

ALTER TABLE clientes ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "Solo autenticados" ON clientes;
CREATE POLICY "Solo autenticados" ON clientes FOR ALL TO authenticated USING (true) WITH CHECK (true);
ALTER TABLE clientes_sociedad ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "Solo autenticados" ON clientes_sociedad;
CREATE POLICY "Solo autenticados" ON clientes_sociedad FOR ALL TO authenticated USING (true) WITH CHECK (true);
