-- Situación frente a Ingresos Brutos (Impuesto a las Actividades Económicas de Salta) en proveedores.
-- Fuente de las categorías: RG DGR Salta 08/2018 (retención) y 10/2025 (percepción).
-- 8 categorías; 'retencion_aplica' (valor viejo) se deja permitido para no invalidar datos antiguos.
ALTER TABLE proveedores DROP CONSTRAINT IF EXISTS proveedores_situacion_iibb_check;
ALTER TABLE proveedores ADD CONSTRAINT proveedores_situacion_iibb_check
  CHECK (situacion_iibb IS NULL OR situacion_iibb IN (
    'contribuyente_directo', 'convenio_multilateral', 'cm_regimen_especial', 'sin_alta_salta',
    'regimen_simplificado', 'exento', 'no_inscripto', 'no_contribuyente', 'retencion_aplica'));

-- Certificado de no retención / no percepción: fecha hasta la que está vigente (vacío = sin certificado).
ALTER TABLE proveedores ADD COLUMN IF NOT EXISTS iibb_cert_no_retencion_hasta date;

-- Condición frente al IVA: se agrega 'regimen_simplificado' (la opción ya está en el panel y la base la rechazaba).
ALTER TABLE proveedores DROP CONSTRAINT IF EXISTS proveedores_condicion_iva_check;
ALTER TABLE proveedores ADD CONSTRAINT proveedores_condicion_iva_check
  CHECK (condicion_iva IS NULL OR condicion_iva IN ('responsable_inscripto', 'monotributo', 'regimen_simplificado', 'exento', 'no_categorizado'));
