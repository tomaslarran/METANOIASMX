-- Paso 1 del plan de cuentas propio por sociedad (22 Oct 2026).
-- Solo cambia la restricción de unicidad: el código deja de ser único solo y pasa a serlo junto con la sociedad,
-- para que SUDES y POINTERS puedan tener cada una su cuenta con el mismo código. No modifica ningún dato.

DO $$
DECLARE r record;
BEGIN
  -- restricciones UNIQUE que sean solo sobre (codigo)
  FOR r IN
    SELECT c.conname
    FROM pg_constraint c
    WHERE c.conrelid = 'public.plan_cuentas'::regclass
      AND c.contype = 'u'
      AND (SELECT array_agg(a.attname::text ORDER BY a.attname)
           FROM unnest(c.conkey) k
           JOIN pg_attribute a ON a.attrelid = c.conrelid AND a.attnum = k) = ARRAY['codigo']
  LOOP
    EXECUTE format('ALTER TABLE public.plan_cuentas DROP CONSTRAINT %I', r.conname);
  END LOOP;
  -- índices únicos sueltos sobre (codigo)
  FOR r IN
    SELECT indexname FROM pg_indexes
    WHERE schemaname = 'public' AND tablename = 'plan_cuentas'
      AND indexdef ILIKE 'CREATE UNIQUE INDEX%' AND indexdef ~* '\(codigo\)\s*$'
  LOOP
    EXECUTE format('DROP INDEX IF EXISTS public.%I', r.indexname);
  END LOOP;
END $$;

CREATE UNIQUE INDEX IF NOT EXISTS plan_cuentas_codigo_sociedad_uq
  ON public.plan_cuentas (codigo, COALESCE(sociedad, ''));

-- Verificación: debe devolver solo el índice nuevo (más la clave primaria)
SELECT indexname, indexdef FROM pg_indexes WHERE schemaname = 'public' AND tablename = 'plan_cuentas';
