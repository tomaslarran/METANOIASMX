-- ============================================================================
-- Multi-tenancy real — Fase 1: módulo Cursos y gestión académica
-- (27 Nov 2026)
--
-- Contexto: decisión de Tomás — arrancar la base de multi-tenancy REAL (no
-- cosmética) pensando en vender/licenciar el panel a otros centros de
-- simulación (caso concreto: La Plata). Hoy el alcance es SOLO el módulo de
-- Cursos y gestión académica. El patrón de esta fase (función
-- current_organizacion_id() + columna organizacion_id + política RLS por
-- organización) es el mismo que hay que repetir, tabla por tabla, cuando se
-- quiera extender a Finanzas o Comunicaciones — ver nota al final.
--
-- Qué hace este script:
--   0. Función current_organizacion_id() — resuelve la organización del
--      usuario logueado a partir de su email (usuarios.email = JWT email).
--   1. Backfill de usuarios.organizacion_id (se agregó la columna el 3 Sep
--      2026 pero NUNCA se pobló — sin este paso, current_organizacion_id()
--      devolvería NULL para todo el mundo y la Fase 1 dejaría a todos sin
--      ver nada).
--   2. Para cada tabla del módulo Cursos: agrega organizacion_id (con
--      DEFAULT current_organizacion_id(), así una fila nueva se autoasigna
--      sola sin tocar el frontend), backfillea las filas existentes a
--      Metanoia SMX, y reemplaza la policy genérica "Solo autenticados" por
--      una que filtra por organización.
--
-- Seguro de correr ya: es aditivo (nadie pierde acceso a nada — hoy toda la
-- data es de Metanoia SMX y todos los usuarios actuales quedan en esa misma
-- organización, así que el comportamiento del panel no cambia en nada hoy).
-- ============================================================================

-- ── 0. Función helper: organización del usuario logueado ───────────────────
-- Supabase expone auth.jwt() con los claims del JWT actual (incluye "email").
-- SECURITY DEFINER para poder leer `usuarios` sin pisarse con su propia RLS.
CREATE OR REPLACE FUNCTION current_organizacion_id()
RETURNS uuid
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT u.organizacion_id
  FROM usuarios u
  WHERE u.email = (auth.jwt() ->> 'email')
  LIMIT 1;
$$;

GRANT EXECUTE ON FUNCTION current_organizacion_id() TO authenticated;

-- ── 1. Backfill de usuarios.organizacion_id (columna agregada el 3 Sep 2026
--       sin backfill — paso crítico, correr antes que nada) ────────────────
INSERT INTO organizaciones (nombre, slug) VALUES ('Metanoia SMX', 'metanoia-smx')
  ON CONFLICT (slug) DO NOTHING;

UPDATE usuarios
SET organizacion_id = (SELECT id FROM organizaciones WHERE slug = 'metanoia-smx')
WHERE organizacion_id IS NULL;

-- ── 2. Tablas del módulo Cursos y gestión académica ─────────────────────────
-- Patrón repetido por tabla (mismo patrón a reusar en Fase 2/3 con otras
-- tablas): ALTER (columna + default) → backfill → policy por organización.

DO $$
DECLARE
  tabla text;
  org_metanoia uuid;
BEGIN
  org_metanoia := (SELECT id FROM organizaciones WHERE slug = 'metanoia-smx');

  FOREACH tabla IN ARRAY ARRAY[
    'cursos', 'curso_tareas', 'curso_costos', 'curso_instructores',
    'curso_materiales', 'curso_archivos', 'inscripciones', 'alumnos',
    'instructores', 'plantillas_curso', 'evaluaciones_alumno', 'debriefings',
    'nps_respuestas', 'nps_envios', 'video_cola'
  ]
  LOOP
    EXECUTE format(
      'ALTER TABLE %I ADD COLUMN IF NOT EXISTS organizacion_id uuid
         REFERENCES organizaciones(id) DEFAULT current_organizacion_id();',
      tabla
    );
    EXECUTE format(
      'UPDATE %I SET organizacion_id = %L WHERE organizacion_id IS NULL;',
      tabla, org_metanoia
    );
    EXECUTE format('CREATE INDEX IF NOT EXISTS %I ON %I (organizacion_id);',
      tabla || '_organizacion_id_idx', tabla);
    EXECUTE format('DROP POLICY IF EXISTS "Solo autenticados" ON %I;', tabla);
    EXECUTE format(
      'CREATE POLICY "Por organización" ON %I FOR ALL TO authenticated
         USING (organizacion_id = current_organizacion_id())
         WITH CHECK (organizacion_id = current_organizacion_id());',
      tabla
    );
  END LOOP;
END $$;

-- ── instrumentos_evaluacion: caso especial ──────────────────────────────────
-- Los 4 instrumentos estándar (OSATS, GOALS, Mini-CEX, DOPS) quedan
-- COMPARTIDOS entre organizaciones (organizacion_id = NULL) -- cualquier
-- centro nuevo los ve de entrada sin tener que recrearlos. Los que el equipo
-- cree de ahí en más (botón "Panel gestión de instrumentos") quedan de su
-- propia organización.
-- ⚠️ Verificar antes de correr: los nombres exactos en la tabla real pueden
-- diferir en mayúsculas/acentos -- ajustar el IN (...) si hace falta.
ALTER TABLE instrumentos_evaluacion ADD COLUMN IF NOT EXISTS organizacion_id uuid
  REFERENCES organizaciones(id) DEFAULT current_organizacion_id();

UPDATE instrumentos_evaluacion
SET organizacion_id = (SELECT id FROM organizaciones WHERE slug = 'metanoia-smx')
WHERE organizacion_id IS NULL
  AND nombre NOT IN ('OSATS', 'GOALS', 'Mini-CEX', 'DOPS');

CREATE INDEX IF NOT EXISTS instrumentos_evaluacion_organizacion_id_idx
  ON instrumentos_evaluacion (organizacion_id);

DROP POLICY IF EXISTS "Solo autenticados" ON instrumentos_evaluacion;
CREATE POLICY "Por organización o compartido" ON instrumentos_evaluacion
  FOR ALL TO authenticated
  USING (organizacion_id = current_organizacion_id() OR organizacion_id IS NULL)
  WITH CHECK (organizacion_id = current_organizacion_id());

-- ============================================================================
-- Pendiente / fuera de esta Fase 1 (anotado para cuando se retome):
--   - Extender el mismo patrón a Finanzas y Comunicaciones cuando se decida
--     vender ese alcance también (repetir el bloque DO $$ ... $$ con la
--     lista de tablas de esos módulos).
--   - Onboarding de una organización nueva (alta de org + primer admin) —
--     Fase 3 del plan acordado con Tomás el 27 Nov 2026.
--   - Filtrado explícito por organización en el frontend (hoy RLS ya separa
--     los datos del lado del servidor; el frontend no necesita cambios para
--     que esto funcione, pero conviene no depender solo de RLS para la UX
--     en pantallas que hoy asumen "todo lo que ve es mío").
-- ============================================================================
