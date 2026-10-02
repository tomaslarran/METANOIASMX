-- Catálogo de productos de Finnegans (export del 2/10/2026). El CÓDIGO es lo que va en la columna PRODUCTO del Excel de importación.
CREATE TABLE IF NOT EXISTS productos_finnegans (
  id uuid DEFAULT gen_random_uuid() PRIMARY KEY,
  codigo text NOT NULL UNIQUE,
  nombre text,
  stockeable boolean DEFAULT false,
  uso text DEFAULT 'compra' CHECK (uso IN ('compra','venta','interno')),
  iva text CHECK (iva IN ('21','10.5','27','exento','nograv')),
  activo boolean DEFAULT true,
  actualizado_en timestamptz DEFAULT now(),
  created_at timestamptz DEFAULT now()
);
ALTER TABLE productos_finnegans ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "Solo autenticados" ON productos_finnegans;
CREATE POLICY "Solo autenticados" ON productos_finnegans FOR ALL TO authenticated USING (true) WITH CHECK (true);

INSERT INTO productos_finnegans (codigo, nombre, stockeable, uso, iva, activo) VALUES
  ('LOGISTICA', 'Asesoramiento de logistica y eventos', false, 'compra', NULL, true),
  ('Asesoramiento financiero', 'Asesoramiento financiero', false, 'compra', NULL, true),
  ('Asesoramiento financiero no gravado', 'Asesoramiento financiero no gravado', false, 'compra', 'nograv', true),
  ('Asesoramiento profesional', 'Asesoramiento profesional', false, 'compra', NULL, true),
  ('ASESORAMIENTO', 'Asesoramiento técnico y transferencia de Know How, distribución', false, 'compra', NULL, true),
  ('CAPACITACIÓN', 'Beca Curso de Broncoscopia HIBA VENTILA simulacion post grado', false, 'venta', NULL, true),
  ('COMBUSTIBLES', 'COMBUSTIBLES', false, 'compra', NULL, true),
  ('Cursos', 'Cursos', false, 'venta', NULL, true),
  ('Convenio', 'Dictado de clases', false, 'venta', NULL, true),
  ('DIFCAM', 'Diferencia de cambio', false, 'venta', NULL, true),
  ('ELEMENTOS DE SIMULACIÓN', 'ELEMENTOS DE SIMULACIÓN', false, 'compra', NULL, true),
  ('Logistica y fletes', 'Logistica y fletes', false, 'compra', NULL, true),
  ('Obra Social', 'Obra Social', false, 'compra', NULL, true),
  ('Pasajes y viajes', 'Pasajes y viajes', false, 'compra', NULL, true),
  ('Pasajes y viajes al 21', 'Pasajes y viajes', false, 'compra', '21', true),
  ('Percepción tish', 'Percepción tish', false, 'interno', NULL, true),
  ('Prestación de servicio de catering y uso de espacio destinado a', 'Prestación de servicio de catering y uso de espacio destinado a', false, 'compra', NULL, true),
  ('Reparación automotor', 'Reparación automotor', false, 'compra', NULL, true),
  ('SI', 'SALDOS INICIALES', false, 'venta', NULL, true),
  ('SI105', 'SALDOS INICIALES 10.5%', false, 'venta', NULL, true),
  ('SI21', 'SALDOS INICIALES 21%', false, 'venta', NULL, true),
  ('SEGURIDAD Y VIGILANCIA', 'SEGURIDAD Y VIGILANCIA', false, 'compra', NULL, true),
  ('SEGUROS', 'SEGUROS', false, 'compra', NULL, true),
  ('SISTEMA CONTABLE HOSTING', 'SISTEMA CONTABLE HOSTING', false, 'compra', NULL, true),
  ('Servicio de aislación', 'Servicio de aislación', false, 'compra', NULL, true),
  ('Servicio de consultoria en direccion y gestion empresarial', 'Servicio de consultoria en direccion y gestion empresarial', false, 'compra', NULL, true),
  ('TESTDELETE', 'TESTDELETE', false, 'interno', NULL, false),
  ('VARIOS MATERIALES CONSTRUCCION 10.5%', 'VARIOS MATERIALES CONSTRUCCION 10.5%', false, 'compra', '10.5', true),
  ('varios almacen 21%', 'Varios almacen 21%', false, 'compra', '21', true),
  ('Varios construcción', 'Varios construcción', false, 'compra', NULL, true),
  ('Varios materiales construccióin 21%', 'Varios materiales construcción 21%', false, 'compra', '21', true),
  ('Varios representacion/marketing', 'Varios representacion/marketing', false, 'compra', NULL, true),
  ('honorarios profesionales', 'honorarios profesionales', false, 'compra', 'exento', true),
  ('iibb salta', 'iibb salta', false, 'interno', NULL, true),
  ('impuestos internos o no gravado', 'impuestos internos o no gravado', false, 'compra', 'nograv', true),
  ('logistica excenta', 'logistica excenta', false, 'compra', 'exento', true),
  ('mantenimiento de cuenta', 'mantenimiento de cuenta', false, 'compra', NULL, true),
  ('peajes', 'peajes', false, 'compra', NULL, true),
  ('percepcion iva 1.5%', 'percepcion iva 1.5%', false, 'interno', NULL, true),
  ('percepcion iva 3%', 'percepcion iva 3%', false, 'interno', NULL, true),
  ('prestamos', 'prestamos', false, 'compra', NULL, true),
  ('seguridad y vigilancia al 10.5', 'seguridad y vigilancia al 10.5', false, 'compra', '10.5', true),
  ('Suscripción', 'suscripción mensual a plataforma E-learning', false, 'venta', NULL, true),
  ('telefonia e internet 27%', 'telefonia e internet 27%', false, 'compra', '27', true),
  ('telefonia e internet al 21%', 'telefonía e internet 21%', false, 'compra', '21', true),
  ('varios almacen 10,5%', 'varios almacen 10,5%', false, 'compra', '10.5', true),
  ('varios almacen consumidor final', 'varios almacen consumidor final', false, 'compra', 'exento', true),
  ('varios electrodomesticos', 'varios electrodomesticos', false, 'compra', NULL, true),
  ('varios representacion', 'varios representacion', false, 'compra', NULL, true)
ON CONFLICT (codigo) DO UPDATE SET nombre = EXCLUDED.nombre, stockeable = EXCLUDED.stockeable, actualizado_en = now();

-- Finnegans: "honorarios profesionales" lleva IVA 0% (facturas C); "Asesoramiento profesional" IVA 21% (facturas A).
UPDATE productos_finnegans SET iva = 'exento' WHERE codigo = 'honorarios profesionales';
UPDATE productos_finnegans SET iva = '21' WHERE codigo = 'Asesoramiento profesional';
