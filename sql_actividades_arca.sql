-- Actividades económicas (CLAE F-883) registradas en ARCA por sociedad.
-- Fuente: Constancias de Inscripción de SUDES y POINTERS vigentes del 17/11/2026 al 17/12/2026.
CREATE TABLE IF NOT EXISTS actividades_arca (
  id uuid DEFAULT gen_random_uuid() PRIMARY KEY,
  sociedad text NOT NULL CHECK (sociedad IN ('SUDES','POINTERS')),
  codigo text NOT NULL,
  descripcion text NOT NULL,
  principal boolean DEFAULT false,
  desde text,                       -- mes de inicio (MM/AAAA) según la constancia
  activa boolean DEFAULT true,
  created_at timestamptz DEFAULT now(),
  UNIQUE (sociedad, codigo)
);
ALTER TABLE actividades_arca ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "Solo autenticados" ON actividades_arca;
CREATE POLICY "Solo autenticados" ON actividades_arca FOR ALL TO authenticated USING (true) WITH CHECK (true);

INSERT INTO actividades_arca (sociedad,codigo,descripcion,principal,desde) VALUES
 ('SUDES','854930','ENSEÑANZA PARA ADULTOS, EXCEPTO DISCAPACITADOS',true,'06/2026'),
 ('SUDES','853300','FORMACIÓN DE POSGRADO',false,'06/2025'),
 ('SUDES','721020','INVESTIGACIÓN Y DESARROLLO EXPERIMENTAL EN EL CAMPO DE LAS CIENCIAS MÉDICAS',false,'06/2025'),
 ('SUDES','853201','ENSEÑANZA UNIVERSITARIA EXCEPTO FORMACIÓN DE POSGRADO',false,'06/2025'),
 ('SUDES','631190','ACTIVIDADES CONEXAS AL PROCESAMIENTO Y HOSPEDAJE DE DATOS N.C.P.',false,'07/2026'),
 ('SUDES','854990','SERVICIOS DE ENSEÑANZA N.C.P.',false,'07/2026'),
 ('SUDES','702099','SERVICIOS DE ASESORAMIENTO, DIRECCIÓN Y GESTIÓN EMPRESARIAL N.C.P.',false,'07/2026'),
 ('POINTERS','523090','SERVICIOS DE GESTIÓN Y LOGÍSTICA PARA EL TRANSPORTE DE MERCADERÍAS N.C.P.',true,'11/2020'),
 ('POINTERS','410011','CONSTRUCCIÓN, REFORMA Y REPARACIÓN DE EDIFICIOS RESIDENCIALES',false,'12/2020'),
 ('POINTERS','410021','CONSTRUCCIÓN, REFORMA Y REPARACIÓN DE EDIFICIOS NO RESIDENCIALES',false,'12/2020'),
 ('POINTERS','492280','SERVICIO DE TRANSPORTE AUTOMOTOR URBANO DE CARGA N.C.P.',false,'09/2024'),
 ('POINTERS','620900','SERVICIOS DE INFORMÁTICA N.C.P.',false,'01/2026'),
 ('POINTERS','631190','ACTIVIDADES CONEXAS AL PROCESAMIENTO Y HOSPEDAJE DE DATOS N.C.P.',false,'01/2026')
ON CONFLICT (sociedad,codigo) DO NOTHING;

-- Cada factura emitida y cada producto de venta queda ligado a una actividad (código CLAE) y a un producto
ALTER TABLE productos_finnegans ADD COLUMN IF NOT EXISTS actividad_codigo text;
ALTER TABLE facturas_emitidas ADD COLUMN IF NOT EXISTS actividad_codigo text;
ALTER TABLE facturas_emitidas ADD COLUMN IF NOT EXISTS producto_codigo text;
