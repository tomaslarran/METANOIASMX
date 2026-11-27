-- Cronograma correcto del plan de Rentas N° 01101409 (SUDES) según el F951A del 30/10/2026:
-- anticipo $431.286,40 (04/11/2026) + 6 cuotas; saldo a financiar $1.250.771,27; interés 1,38% mensual (total $60.878,53).
-- El panel había cargado 13 cuotas porque tomó el 2° vencimiento (con recargo) como si fuera otra cuota, y sin capital/intereses.
-- El anticipo queda PENDIENTE a propósito: figuraba «pagada» pero sin fecha ni asiento. Pagalo desde el panel
-- (Cash Flow → Préstamos → plan 01101409 → Marcar pagada) con la fecha y el medio reales, y así se genera su asiento.
-- Correr UNA vez en Supabase → SQL Editor, todo junto.
BEGIN;
DELETE FROM cf_prestamos_cuotas WHERE prestamo_id = '0013667a-93b1-4f64-9fae-fc83dcf76e5c';
INSERT INTO cf_prestamos_cuotas (prestamo_id, nro_cuota, fecha, capital, intereses, monto_total, saldo_restante, pagada) VALUES
  ('0013667a-93b1-4f64-9fae-fc83dcf76e5c', 0, '2026-11-04', 431286.40,     0.00, 431286.40, 1250771.27, false),
  ('0013667a-93b1-4f64-9fae-fc83dcf76e5c', 1, '2026-12-10', 201410.13, 17198.17, 218608.30, 1049361.14, false),
  ('0013667a-93b1-4f64-9fae-fc83dcf76e5c', 2, '2027-01-11', 204179.53, 14428.77, 218608.30,  845181.61, false),
  ('0013667a-93b1-4f64-9fae-fc83dcf76e5c', 3, '2027-02-10', 206987.01, 11621.29, 218608.30,  638194.60, false),
  ('0013667a-93b1-4f64-9fae-fc83dcf76e5c', 4, '2027-03-10', 209833.09,  8775.21, 218608.30,  428361.51, false),
  ('0013667a-93b1-4f64-9fae-fc83dcf76e5c', 5, '2027-04-12', 212718.31,  5889.99, 218608.30,  215643.20, false),
  ('0013667a-93b1-4f64-9fae-fc83dcf76e5c', 6, '2027-05-10', 215643.20,  2965.10, 218608.30,       0.00, false);
UPDATE cf_prestamos
SET monto_original = 1682057.67, saldo_actual = 1682057.67, cuotas_totales = 7, cuotas_pendientes = 7,
    tasa_anual = 16.56, updated_at = now()
WHERE id = '0013667a-93b1-4f64-9fae-fc83dcf76e5c';
COMMIT;
-- Control: SELECT sum(capital), sum(intereses) FROM cf_prestamos_cuotas WHERE prestamo_id='0013667a-93b1-4f64-9fae-fc83dcf76e5c';
-- → 1.682.057,67 y 60.878,53
