-- Asistente Claude para administradores — fase 1 (solo consultas). 27 Nov 2026.
-- Crea un rol de solo lectura y la función que usa el asistente para consultar la base.
-- Se puede correr más de una vez sin problema.

-- 1) Rol de solo lectura (no puede iniciar sesión; solo lo usa la función de abajo)
DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'asistente_lector') THEN
    CREATE ROLE asistente_lector NOLOGIN;
  END IF;
END $$;
GRANT asistente_lector TO postgres;
GRANT USAGE ON SCHEMA public TO asistente_lector;

-- 2) Permisos de lectura sobre las tablas de datos.
--    Quedan afuera arca_tokens y cualquier tabla con columnas de claves o contraseñas.
--    Si se crea una tabla nueva, volver a correr:  SELECT asistente_refrescar_permisos();
CREATE OR REPLACE FUNCTION asistente_refrescar_permisos() RETURNS text
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, pg_catalog AS $$
DECLARE
  t record; n int := 0; excluidas text[] := ARRAY[]::text[];
BEGIN
  FOR t IN
    SELECT c.relname, c.relkind, c.relrowsecurity
    FROM pg_class c JOIN pg_namespace ns ON ns.oid = c.relnamespace
    WHERE ns.nspname = 'public' AND c.relkind IN ('r','p','v','m')
  LOOP
    IF t.relname = 'arca_tokens' OR EXISTS (
      SELECT 1 FROM information_schema.columns col
      WHERE col.table_schema = 'public' AND col.table_name = t.relname
        AND col.column_name ~* '(password|contrasena|secret|private_key|clave_privada|access_token|refresh_token)'
    ) THEN
      EXECUTE format('REVOKE ALL ON public.%I FROM asistente_lector', t.relname);
      excluidas := excluidas || t.relname;
      CONTINUE;
    END IF;
    EXECUTE format('GRANT SELECT ON public.%I TO asistente_lector', t.relname);
    IF t.relkind IN ('r','p') AND t.relrowsecurity AND NOT EXISTS (
      SELECT 1 FROM pg_policies p
      WHERE p.schemaname = 'public' AND p.tablename = t.relname AND p.policyname = 'asistente_lector_lectura'
    ) THEN
      EXECUTE format('CREATE POLICY asistente_lector_lectura ON public.%I FOR SELECT TO asistente_lector USING (true)', t.relname);
    END IF;
    n := n + 1;
  END LOOP;
  RETURN n || ' tablas habilitadas para el asistente. Excluidas: ' || coalesce(array_to_string(excluidas, ', '), 'ninguna');
END $$;
REVOKE ALL ON FUNCTION asistente_refrescar_permisos() FROM PUBLIC, anon, authenticated;

SELECT asistente_refrescar_permisos();

-- 3) Función de consulta.
--    * Corre como asistente_lector (solo puede leer).
--    * Es STABLE: Postgres rechaza cualquier INSERT/UPDATE/DELETE dentro de la consulta.
--    * Solo acepta una consulta SELECT o WITH, sin ';' en el medio, y devuelve hasta 501 filas
--      (la función del asistente usa la fila 501 para saber si hubo más).
--    * Solo la pueden usar administradores activos (se verifica el email del usuario conectado).
CREATE OR REPLACE FUNCTION asistente_consulta(consulta text) RETURNS jsonb
LANGUAGE plpgsql STABLE SECURITY DEFINER
SET search_path = public, pg_catalog
AS $$
DECLARE
  q text;
  r jsonb;
  v_email text := lower(coalesce(current_setting('request.jwt.claims', true)::jsonb ->> 'email', ''));
BEGIN
  IF v_email = '' OR NOT EXISTS (
    SELECT 1 FROM usuarios u WHERE lower(u.email) = v_email AND u.rol = 'admin' AND coalesce(u.activo, true)
  ) THEN
    RAISE EXCEPTION 'Solo administradores pueden usar el asistente';
  END IF;
  q := regexp_replace(btrim(coalesce(consulta, '')), ';\s*$', '');
  IF q = '' THEN RAISE EXCEPTION 'Consulta vacía'; END IF;
  IF position(';' IN q) > 0 THEN RAISE EXCEPTION 'Una sola consulta por vez (sin punto y coma)'; END IF;
  IF q !~* '^(select|with)\s' THEN RAISE EXCEPTION 'Solo se permiten consultas SELECT'; END IF;
  EXECUTE format(
    'SELECT coalesce(jsonb_agg(t), ''[]''::jsonb) FROM (SELECT * FROM (%s) AS q LIMIT 501) t', q
  ) INTO r;
  RETURN r;
END $$;

-- La función tiene que pertenecer al rol lector para correr con sus permisos.
-- Para cambiar el dueño, el rol necesita CREATE en el esquema; se lo da y se lo saca enseguida.
GRANT CREATE ON SCHEMA public TO asistente_lector;
ALTER FUNCTION asistente_consulta(text) OWNER TO asistente_lector;
REVOKE CREATE ON SCHEMA public FROM asistente_lector;

REVOKE ALL ON FUNCTION asistente_consulta(text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION asistente_consulta(text) TO authenticated;

-- Prueba (desde el SQL editor no hay usuario conectado, así que debería decir
-- "Solo administradores pueden usar el asistente"):
-- SELECT asistente_consulta('select count(*) from comprobantes_compra');
