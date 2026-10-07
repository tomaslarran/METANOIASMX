-- Situación frente a Ingresos Brutos (Impuesto a las Actividades Económicas de Salta) en proveedores: se amplía la lista de valores permitidos.
-- Fuente de las categorías: RG DGR Salta 08/2018 (retención) y 10/2025 (percepción). Se conservan los 5 valores anteriores.
ALTER TABLE proveedores DROP CONSTRAINT IF EXISTS proveedores_situacion_iibb_check;
ALTER TABLE proveedores ADD CONSTRAINT proveedores_situacion_iibb_check
  CHECK (situacion_iibb IS NULL OR situacion_iibb IN ('contribuyente_directo', 'convenio_multilateral', 'cm_regimen_especial', 'cm_sin_alta_salta', 'local_otra_jurisdiccion', 'regimen_simplificado', 'exento', 'promocion_100', 'cert_no_retencion', 'inicio_actividades', 'no_inscripto', 'no_contribuyente', 'retencion_aplica'));

-- Condición frente al IVA: se agrega 'regimen_simplificado' (la opción ya está en el panel y la base la rechazaba).
ALTER TABLE proveedores DROP CONSTRAINT IF EXISTS proveedores_condicion_iva_check;
ALTER TABLE proveedores ADD CONSTRAINT proveedores_condicion_iva_check
  CHECK (condicion_iva IS NULL OR condicion_iva IN ('responsable_inscripto', 'monotributo', 'regimen_simplificado', 'exento', 'no_categorizado'));
