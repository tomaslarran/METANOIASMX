-- Corrección: el plan de Rentas N° 01101409 (Actividades Económicas = Ingresos Brutos) canceló sus obligaciones
-- como «TISH 05/2026» y «TISH 06/2026», contra «TISH a pagar» (2.1.03.015), que nunca tuvo deuda.
-- Eran IIBB 05 y 06/2026: la apertura trae «Ingresos Brutos Salta a pagar» (2.1.03.005) por $1.512.634,83,
-- exactamente $1.068.270,84 + $444.363,99. Se pasan esas dos líneas a 2.1.03.005.
-- Resultado: TISH a pagar queda en 0 e IIBB a pagar queda en 0. Correr UNA vez en Supabase → SQL Editor.
-- Para deshacer: volver cuenta_id a la de 2.1.03.015 SUDES y las descripciones a «Cancelación de TISH …».
UPDATE asientos_movimientos
SET cuenta_id = 'aabffd45-0cfd-44e9-92e2-0da885cc6ecf',   -- 2.1.03.005 Ingresos Brutos Salta a pagar (SUDES)
    descripcion = replace(descripcion, 'TISH', 'IIBB')
WHERE id IN ('a0a8272d-a693-45c7-ac02-6f74a53e4ba2', 'ca00f186-4f12-4e39-9dc2-99604344ce37')
  AND asiento_id = '2641c5b8-c58b-46cc-bbb1-9e146c85e0ad';
-- Debe decir «UPDATE 2».
