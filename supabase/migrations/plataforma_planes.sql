-- Tabla de planes de suscripción de la plataforma online
-- Actualizar desde Supabase dashboard sin redeploy de Edge Functions

CREATE TABLE IF NOT EXISTS plataforma_planes (
  id uuid DEFAULT gen_random_uuid() PRIMARY KEY,
  nombre text NOT NULL,
  descripcion text,
  precio_mensual integer,   -- ARS, null si sin_costo
  precio_anual integer,     -- ARS, null si sin_costo
  sin_costo boolean NOT NULL DEFAULT false,
  requisito text,
  activo boolean NOT NULL DEFAULT true,
  orden integer NOT NULL DEFAULT 0,
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now()
);

ALTER TABLE plataforma_planes ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Solo autenticados" ON plataforma_planes
  FOR ALL TO authenticated USING (true) WITH CHECK (true);

-- Datos iniciales
INSERT INTO plataforma_planes (nombre, descripcion, precio_mensual, precio_anual, sin_costo, requisito, orden) VALUES
(
  'Médico matriculado COLMEDSA',
  'Acceso completo a la plataforma + simulaciones incluidas + Programa de Educación Médica Continua de Salta.',
  8000, 90000, false,
  'Validación de matrícula en el Colegio Médico de Salta',
  1
),
(
  'Médico matriculado externo',
  'Para médicos matriculados fuera de Colmedsa. Acceso completo a la plataforma + simulaciones.',
  10000, 110000, false,
  'Validación de matrícula profesional',
  2
),
(
  'Residente Ministerio de Salud Pública de Salta',
  'Acceso libre a todos los contenidos durante la residencia. Si no recibiste acceso, escribí a administracion@metanoiasmx.com',
  null, null, true,
  'Validación de residencia en el Ministerio de Salud Pública de Salta',
  3
),
(
  'Programa de Educación Médica Continua de Salta (PEMCS)',
  'Acceso exclusivo al programa PEMCS. Sin costo para médicos matriculados en Colmedsa.',
  null, null, true,
  'Validación de matrícula profesional. Puede contratarse como complemento a otras suscripciones.',
  4
),
(
  'Personal de Salud no médico',
  'Para enfermeros, kinesiólogos, instrumentadores quirúrgicos, técnicos y afines. Acceso a contenidos y simulaciones habilitadas.',
  4000, 40000, false,
  null,
  5
);
