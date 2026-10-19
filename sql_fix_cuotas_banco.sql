-- ============================================================
-- Fix: cuotas de préstamos pagadas con Caja en lugar de Banco Macro
-- Generado: 19/10/2026
-- Causa: backfill (Generar históricos) usó medio="" → getBancoCodigoPorMedio caía en 1.1.01.001
-- ============================================================

-- 1. VER cuántas y cuáles (sin modificar nada)
SELECT
  ac.id        AS asiento_id,
  ac.sociedad,
  ac.fecha,
  ac.descripcion,
  am.haber     AS monto,
  pc.codigo    AS cuenta_incorrecta,
  pc.nombre    AS nombre_cuenta
FROM asientos_contables ac
JOIN asientos_movimientos am ON am.asiento_id = ac.id
JOIN plan_cuentas pc ON pc.id = am.cuenta_id
WHERE ac.tipo = 'pago_cuota_prestamo'
  AND pc.codigo = '1.1.01.001'
  AND am.haber > 0
  AND (ac.anulado IS NOT TRUE OR ac.anulado IS NULL)
ORDER BY ac.sociedad, ac.fecha;

-- ============================================================
-- 2. CORRECCIÓN: Caja efectivo (1.1.01.001) → Banco Macro según sociedad
--    1.1.01.002 = Banco Macro SUDES
--    1.1.01.003 = Banco Macro POINTERS
-- Correr DESPUÉS de revisar el diagnóstico de arriba
-- ============================================================

UPDATE asientos_movimientos am
SET cuenta_id = (
  SELECT pc2.id FROM plan_cuentas pc2
  WHERE pc2.codigo = CASE
    WHEN ac.sociedad = 'POINTERS' THEN '1.1.01.003'
    ELSE '1.1.01.002'
  END
)
FROM asientos_contables ac
JOIN plan_cuentas pc ON pc.id = am.cuenta_id
WHERE am.asiento_id = ac.id
  AND ac.tipo = 'pago_cuota_prestamo'
  AND pc.codigo = '1.1.01.001'
  AND am.haber > 0
  AND (ac.anulado IS NOT TRUE OR ac.anulado IS NULL);

-- Verificar resultado (debe devolver 0 filas después del UPDATE)
SELECT count(*) AS cuotas_con_caja_incorrecta
FROM asientos_contables ac
JOIN asientos_movimientos am ON am.asiento_id = ac.id
JOIN plan_cuentas pc ON pc.id = am.cuenta_id
WHERE ac.tipo = 'pago_cuota_prestamo'
  AND pc.codigo = '1.1.01.001'
  AND am.haber > 0
  AND (ac.anulado IS NOT TRUE OR ac.anulado IS NULL);
