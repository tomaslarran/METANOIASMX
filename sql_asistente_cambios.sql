-- Conector Metanoia — cambios de datos con confirmación y deshacer. 27 Nov 2026.
-- Cada cambio que propone Claude queda acá: qué tabla y fila, valores antes y después, quién lo pidió,
-- si se aplicó y si se deshizo. Solo lo escribe la función metanoia-mcp (service role).
-- Se puede correr más de una vez sin problema.

CREATE TABLE IF NOT EXISTS asistente_cambios (
  id uuid DEFAULT gen_random_uuid() PRIMARY KEY,
  canal text DEFAULT 'conector',
  usuario_id uuid,
  usuario_email text,
  motivo text,                 -- qué pidió el usuario, en sus palabras
  operaciones jsonb NOT NULL,  -- [{tabla, id, accion:'modificar'|'alta', antes:{...}, despues:{...}}]
  estado text NOT NULL DEFAULT 'propuesto'
    CHECK (estado IN ('propuesto','aplicado','deshecho','cancelado','fallido')),
  error text,
  aplicado_en timestamptz,
  deshecho_en timestamptz,
  deshecho_por text,
  created_at timestamptz DEFAULT now()
);
CREATE INDEX IF NOT EXISTS asistente_cambios_created_idx ON asistente_cambios (created_at DESC);

ALTER TABLE asistente_cambios ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "Solo autenticados leen" ON asistente_cambios;
CREATE POLICY "Solo autenticados leen" ON asistente_cambios FOR SELECT TO authenticated USING (true);

-- Que el asistente también pueda leer esta tabla (y cualquier otra creada desde la última vez)
SELECT asistente_refrescar_permisos();
