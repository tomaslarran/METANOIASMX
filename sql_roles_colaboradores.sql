-- ════════════════════════════════════════════════════════════════════════════
-- Roles de base de datos para que Amparo, Mario y Valentina trabajen con su Claude
-- SOLO sobre datos (sin tocar el código del panel).   Preparado el 2/11/2026.
--
--   colab_lector    → lee casi todo (sin claves, tokens, usuarios ni mensajes internos)
--   colab_datos     → escribe en alumnos, inscripciones, cursos y sus tablas hijas, clientes
--   colab_facturas  → corrige facturas de compra y órdenes de pago (solo columnas "de datos")
--
--   colab_amparo, colab_mario     = lector + datos
--   colab_valentina               = lector + datos + facturas
--
-- Correr TODO este archivo en Supabase → SQL Editor. Después, en una consulta APARTE,
-- ponerle contraseña a cada persona (ver el final). Nunca guardar contraseñas en el repo.
-- Todo lo que escriban queda registrado en auditoria_colaboradores.
-- ════════════════════════════════════════════════════════════════════════════

-- 1) Roles ───────────────────────────────────────────────────────────────────
DO $$
DECLARE r text;
BEGIN
  FOREACH r IN ARRAY ARRAY['colab_lector','colab_datos','colab_facturas'] LOOP
    IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname=r) THEN EXECUTE format('CREATE ROLE %I NOLOGIN', r); END IF;
  END LOOP;
  FOREACH r IN ARRAY ARRAY['colab_amparo','colab_mario','colab_valentina'] LOOP
    IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname=r) THEN EXECUTE format('CREATE ROLE %I LOGIN NOINHERIT', r); END IF;
    EXECUTE format('ALTER ROLE %I SET statement_timeout = ''60s''', r);
    EXECUTE format('ALTER ROLE %I SET idle_in_transaction_session_timeout = ''60s''', r);
    EXECUTE format('ALTER ROLE %I CONNECTION LIMIT 3', r);
  END LOOP;
END $$;
-- NOINHERIT en los roles de login: hay que hacer SET ROLE; los usamos con INHERIT para que sea transparente:
ALTER ROLE colab_amparo INHERIT;  ALTER ROLE colab_mario INHERIT;  ALTER ROLE colab_valentina INHERIT;

GRANT colab_lector, colab_datos                  TO colab_amparo;
GRANT colab_lector, colab_datos                  TO colab_mario;
GRANT colab_lector, colab_datos, colab_facturas  TO colab_valentina;

GRANT USAGE ON SCHEMA public TO colab_lector, colab_datos, colab_facturas;

-- 2) Lectura: todas las tablas menos las sensibles ──────────────────────────
DO $$
DECLARE t text;
DECLARE vedadas text[] := ARRAY[
  'arca_tokens','arca_config','tokens_api','login_attempts','usuarios','wpp_sesiones',
  'notificaciones','notificaciones_config','mensajes_internos','agente_cursos_chats','chat_colaboradores',
  'ia_uso','panel_errores','auditoria_colaboradores'];
BEGIN
  FOR t IN SELECT tablename FROM pg_tables WHERE schemaname='public' AND tablename <> ALL(vedadas) LOOP
    EXECUTE format('GRANT SELECT ON public.%I TO colab_lector', t);
    EXECUTE format('DROP POLICY IF EXISTS colab_lector_select ON public.%I', t);
    -- si la tabla no tiene RLS el GRANT alcanza; si la tiene, hace falta la política
    IF (SELECT relrowsecurity FROM pg_class WHERE oid = format('public.%I',t)::regclass) THEN
      EXECUTE format('CREATE POLICY colab_lector_select ON public.%I FOR SELECT TO colab_lector USING (true)', t);
    END IF;
  END LOOP;
END $$;

-- 3) Escritura de datos (alta y modificación; SIN borrar) ───────────────────
DO $$
DECLARE t text;
DECLARE escribibles text[] := ARRAY[
  'alumnos','inscripciones','cursos','curso_clases','curso_instructores','curso_materiales','curso_tareas',
  'instructores','clientes','clientes_sociedad'];
BEGIN
  FOREACH t IN ARRAY escribibles LOOP
    EXECUTE format('GRANT INSERT, UPDATE ON public.%I TO colab_datos', t);
    EXECUTE format('DROP POLICY IF EXISTS colab_datos_ins ON public.%I', t);
    EXECUTE format('DROP POLICY IF EXISTS colab_datos_upd ON public.%I', t);
    IF (SELECT relrowsecurity FROM pg_class WHERE oid = format('public.%I',t)::regclass) THEN
      EXECUTE format('CREATE POLICY colab_datos_ins ON public.%I FOR INSERT TO colab_datos WITH CHECK (true)', t);
      EXECUTE format('CREATE POLICY colab_datos_upd ON public.%I FOR UPDATE TO colab_datos USING (true) WITH CHECK (true)', t);
    END IF;
  END LOOP;
END $$;

-- 4) Facturas y órdenes de pago: solo columnas de datos ─────────────────────
-- NO se pueden tocar importes, estado, pagos ni retenciones: los asientos contables los genera el panel,
-- y un importe cambiado a mano en la base dejaría los libros desfasados. Esos cambios van por el panel.
GRANT UPDATE (tipo, numero, fecha, fecha_vencimiento, fecha_imputacion, proveedor, cuit, concepto, notas,
              proveedor_id, proveedor_maestro_id, producto_neto21, producto_neto105, producto_neto27,
              producto_exento, producto_nograv, producto_perc_iva, producto_perc_iibb, en_calendario)
  ON public.comprobantes_compra TO colab_facturas;
GRANT UPDATE (observaciones, cbu_destino, nro_operacion, nro_comprobante_retencion, proveedor, cuit)
  ON public.ordenes_pago TO colab_facturas;
DO $$
DECLARE t text;
BEGIN
  FOREACH t IN ARRAY ARRAY['comprobantes_compra','ordenes_pago'] LOOP
    EXECUTE format('DROP POLICY IF EXISTS colab_facturas_upd ON public.%I', t);
    IF (SELECT relrowsecurity FROM pg_class WHERE oid = format('public.%I',t)::regclass) THEN
      EXECUTE format('CREATE POLICY colab_facturas_upd ON public.%I FOR UPDATE TO colab_facturas USING (true) WITH CHECK (true)', t);
    END IF;
  END LOOP;
END $$;
-- Un comprobante de un ejercicio cerrado no se toca
CREATE OR REPLACE FUNCTION public.colab_bloquea_cerrados() RETURNS trigger
LANGUAGE plpgsql AS $$
BEGIN
  IF session_user LIKE 'colab\_%' AND OLD.estado = 'cerrado' THEN
    RAISE EXCEPTION 'Comprobante de ejercicio cerrado: no se puede modificar desde un rol de colaborador';
  END IF;
  RETURN NEW;
END $$;
DROP TRIGGER IF EXISTS trg_colab_bloquea_cerrados ON public.comprobantes_compra;
CREATE TRIGGER trg_colab_bloquea_cerrados BEFORE UPDATE ON public.comprobantes_compra
  FOR EACH ROW EXECUTE FUNCTION public.colab_bloquea_cerrados();

-- 5) Auditoría: todo lo que escriba un colaborador queda registrado ──────────
CREATE TABLE IF NOT EXISTS public.auditoria_colaboradores (
  id bigserial PRIMARY KEY,
  ts timestamptz DEFAULT now(),
  usuario text,
  tabla text,
  operacion text,
  fila_id text,
  antes jsonb,
  despues jsonb
);
ALTER TABLE public.auditoria_colaboradores ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Solo autenticados" ON public.auditoria_colaboradores FOR SELECT TO authenticated USING (true);
-- (los roles colab_* no tienen ningún permiso sobre esta tabla; la escribe el trigger con permisos de su dueño)

CREATE OR REPLACE FUNCTION public.colab_auditar() RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  IF session_user LIKE 'colab\_%' THEN
    INSERT INTO public.auditoria_colaboradores(usuario,tabla,operacion,fila_id,antes,despues)
    VALUES (session_user, TG_TABLE_NAME, TG_OP,
            COALESCE((to_jsonb(NEW)->>'id'),(to_jsonb(OLD)->>'id')),
            CASE WHEN TG_OP IN ('UPDATE','DELETE') THEN to_jsonb(OLD) END,
            CASE WHEN TG_OP IN ('INSERT','UPDATE') THEN to_jsonb(NEW) END);
  END IF;
  RETURN NULL;
END $$;
DO $$
DECLARE t text;
BEGIN
  FOREACH t IN ARRAY ARRAY['alumnos','inscripciones','cursos','curso_clases','curso_instructores','curso_materiales',
                           'curso_tareas','instructores','clientes','clientes_sociedad','comprobantes_compra','ordenes_pago'] LOOP
    EXECUTE format('DROP TRIGGER IF EXISTS trg_colab_auditar ON public.%I', t);
    EXECUTE format('CREATE TRIGGER trg_colab_auditar AFTER INSERT OR UPDATE OR DELETE ON public.%I FOR EACH ROW EXECUTE FUNCTION public.colab_auditar()', t);
  END LOOP;
END $$;

-- 6) Contraseñas (correr APARTE, una por persona, con una clave larga y distinta; NO guardarlas en el repo) ──
--   ALTER ROLE colab_amparo    PASSWORD '<clave larga>';
--   ALTER ROLE colab_mario     PASSWORD '<clave larga>';
--   ALTER ROLE colab_valentina PASSWORD '<clave larga>';

-- 7) Verificación rápida (como postgres) ────────────────────────────────────
--   SELECT rolname, rolcanlogin FROM pg_roles WHERE rolname LIKE 'colab\_%';
--   SELECT grantee, table_name, privilege_type FROM information_schema.role_table_grants WHERE grantee LIKE 'colab\_%' ORDER BY 1,2,3;
--   -- Para probar sin contraseña:  SET ROLE colab_valentina;  SELECT count(*) FROM alumnos;  UPDATE comprobantes_compra SET total=0 WHERE false; -- debe fallar por columna
--   --                              RESET ROLE;
-- Para quitar todo:  REVOKE ... / DROP ROLE colab_amparo, colab_mario, colab_valentina, colab_lector, colab_datos, colab_facturas;
