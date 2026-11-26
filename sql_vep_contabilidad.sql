-- VEP → contabilidad: al cargar un VEP nace la deuda del impuesto; al pagarlo (o al conciliar el extracto) se cancela.
-- Correr UNA vez en Supabase → SQL Editor.

-- 1) Vínculos del VEP con sus asientos y con el movimiento del banco
ALTER TABLE impuestos_vep ADD COLUMN IF NOT EXISTS asiento_devengado_id uuid;
ALTER TABLE impuestos_vep ADD COLUMN IF NOT EXISTS asiento_pago_id uuid;
ALTER TABLE impuestos_vep ADD COLUMN IF NOT EXISTS banco_movimiento_id uuid;

-- 2) Tipos de asiento nuevos
ALTER TABLE asientos_contables DROP CONSTRAINT IF EXISTS asientos_contables_tipo_check;
ALTER TABLE asientos_contables ADD CONSTRAINT asientos_contables_tipo_check
  CHECK (tipo IN ('devengado_compra','pago_compra','devengado_venta','cobro_venta','sueldo','ajuste','apertura',
                  'pago_cuota_prestamo','ajuste_manual','gastos_bancarios','liquidacion_tarjeta',
                  'devengado_impuesto','pago_impuesto'));

-- 3) Cuentas nuevas del plan (no pisa nada: solo crea las que no existen)
-- Egresos: Impuestos y tasas
INSERT INTO plan_cuentas (codigo,nombre,tipo,naturaleza,cuenta_padre_id,nivel,imputable,activa)
SELECT '5.4','Impuestos y tasas','egreso','deudora',(SELECT id FROM plan_cuentas WHERE codigo='5'),2,false,true
WHERE NOT EXISTS (SELECT 1 FROM plan_cuentas WHERE codigo='5.4');

INSERT INTO plan_cuentas (codigo,nombre,tipo,naturaleza,cuenta_padre_id,nivel,imputable,activa)
SELECT '5.4.01','Impuestos nacionales y provinciales','egreso','deudora',(SELECT id FROM plan_cuentas WHERE codigo='5.4'),3,false,true
WHERE NOT EXISTS (SELECT 1 FROM plan_cuentas WHERE codigo='5.4.01');

INSERT INTO plan_cuentas (codigo,nombre,tipo,naturaleza,cuenta_padre_id,nivel,imputable,activa)
SELECT v.codigo,v.nombre,'egreso','deudora',(SELECT id FROM plan_cuentas WHERE codigo='5.4.01'),4,true,true
FROM (VALUES
  ('5.4.01.001','Ingresos Brutos Salta (IAE)'),
  ('5.4.01.002','Impuesto a las Ganancias'),
  ('5.4.01.003','Aportes autónomos'),
  ('5.4.01.004','Otros impuestos y tasas')
) AS v(codigo,nombre)
WHERE NOT EXISTS (SELECT 1 FROM plan_cuentas p WHERE p.codigo=v.codigo);

-- Pasivo: deudas fiscales y cargas sociales a pagar
INSERT INTO plan_cuentas (codigo,nombre,tipo,naturaleza,cuenta_padre_id,nivel,imputable,activa)
SELECT v.codigo,v.nombre,'pasivo','acreedora',(SELECT id FROM plan_cuentas WHERE codigo='2.1.03'),4,true,true
FROM (VALUES
  ('2.1.03.004','IVA a pagar (saldo DDJJ)'),
  ('2.1.03.005','Ingresos Brutos Salta a pagar'),
  ('2.1.03.006','Impuesto a las Ganancias a pagar'),
  ('2.1.03.007','Aportes autónomos a pagar'),
  ('2.1.03.008','Otros impuestos y tasas a pagar')
) AS v(codigo,nombre)
WHERE NOT EXISTS (SELECT 1 FROM plan_cuentas p WHERE p.codigo=v.codigo);

INSERT INTO plan_cuentas (codigo,nombre,tipo,naturaleza,cuenta_padre_id,nivel,imputable,activa)
SELECT '2.1.04.002','Cargas sociales a pagar (F.931)','pasivo','acreedora',(SELECT id FROM plan_cuentas WHERE codigo='2.1.04'),4,true,true
WHERE NOT EXISTS (SELECT 1 FROM plan_cuentas WHERE codigo='2.1.04.002');
