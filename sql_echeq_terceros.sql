-- Echeq de terceros: al endosar un cheque a cuenta (sin factura) el anticipo recuerda de qué cheque salió,
-- así si se elimina el anticipo el cheque vuelve a la cartera.
-- Correr UNA vez en Supabase → SQL Editor. Es seguro volver a correrlo.
-- (Requiere haber corrido antes sql_pagos_mixtos.sql y sql_anticipos_proveedores.sql)
ALTER TABLE anticipos_proveedores ADD COLUMN IF NOT EXISTS cobranza_id uuid;
