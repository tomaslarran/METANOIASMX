-- Asiento que faltó: extracción de efectivo de $16.000.000 del Macro a la caja de SUDES (20/11/2026).
-- El panel registró los movimientos de caja y banco pero el asiento falló (bug de la v158, corregido en la v159).
-- Correr UNA sola vez en Supabase → SQL Editor. Si ya existe, no hace nada.
DO $$
DECLARE v_id uuid;
BEGIN
  IF EXISTS (SELECT 1 FROM asientos_contables WHERE origen='caja_transferencia' AND origen_id='1b3d2bef-d5ce-4a3d-8d1a-af196faee2bd' AND NOT anulado) THEN
    RAISE NOTICE 'Ya existe, no se hace nada'; RETURN;
  END IF;
  INSERT INTO asientos_contables (fecha, sociedad, tipo, origen, origen_id, descripcion, creado_por)
  VALUES ('2026-11-20', 'SUDES', 'ajuste', 'caja_transferencia', '1b3d2bef-d5ce-4a3d-8d1a-af196faee2bd',
          'Extracción de efectivo: Banco Macro SUDES → Caja $ SUDES — retiro efectivo', 'Tomás')
  RETURNING id INTO v_id;
  INSERT INTO asientos_movimientos (asiento_id, cuenta_id, debe, haber, descripcion) VALUES
    (v_id, 'daf0fb51-56dc-47cb-9501-96c86e135621', 16000000, 0, 'Caja'),    -- 1.1.01.001 Caja SUDES
    (v_id, 'f093b6a9-e2ba-44db-b5bb-8c775907d861', 0, 16000000, 'Banco');   -- 1.1.01.002 Banco Macro SUDES
  RAISE NOTICE 'Asiento creado: %', v_id;
END $$;
