-- ════════════════════════════════════════════════════════════════════════════
-- RLS — cierra el hueco que dejó migracion_rls_basico.sql en 3 tablas que no
-- estaban en su lista de 33 tablas verificadas el 2026-07-03:
--
--   • mensajes_consulta   (migracion_mensajes_consulta.sql) — nunca tuvo RLS,
--     Q&A médico-paciente post-consulta (dato clínico).
--   • enlaces_teleconsulta (migracion_enlaces_teleconsulta.sql) — quedó con
--     `DISABLE ROW LEVEL SECURITY` explícito.
--   • auditoria (tablas.sql) — traza LOPDP de quién/cuándo modifica datos de
--     pacientes; nunca tuvo ENABLE/DISABLE explícito en el repo.
--
-- Con RLS apagado en estas 3, la publishable key (pública, visible en
-- public/js/config.js) puede leer/escribir su contenido completo sin login.
--
-- Se aplica exactamente la misma política Tier 1 que ya usan las otras 33
-- tablas (staff_autenticado_acceso_total): cualquier usuario logueado con
-- Supabase Auth puede todo; `anon` (sin sesión) no matchea nada.
--
-- `auditoria` se llena vía fn_auditoria(), un trigger SECURITY DEFINER — igual
-- que en pacientes/consultas/antecedentes/documentos/documentos_datos (que ya
-- tienen RLS desde Tier 1 y el trigger sigue insertando sin problema), activar
-- RLS aquí no bloquea esas inserciones automáticas.
--
-- CÓMO APLICARLA: correr en el SQL Editor de Supabase. Rollback al final.
-- ════════════════════════════════════════════════════════════════════════════

DO $$
DECLARE
  tabla TEXT;
  tablas TEXT[] := ARRAY[
    'mensajes_consulta','enlaces_teleconsulta','auditoria'
  ];
BEGIN
  FOREACH tabla IN ARRAY tablas LOOP
    IF to_regclass('public.' || tabla) IS NULL THEN
      RAISE NOTICE 'Tabla % no existe en esta base — se omite.', tabla;
      CONTINUE;
    END IF;
    EXECUTE format('ALTER TABLE %I ENABLE ROW LEVEL SECURITY;', tabla);
    EXECUTE format(
      'DROP POLICY IF EXISTS "staff_autenticado_acceso_total" ON %I;',
      tabla
    );
    EXECUTE format(
      'CREATE POLICY "staff_autenticado_acceso_total" ON %I FOR ALL TO authenticated USING (true) WITH CHECK (true);',
      tabla
    );
  END LOOP;
END $$;

-- ════════════════════════════════════════════════════════════════════════════
-- ROLLBACK — si algo se rompe, correr esto para volver al estado anterior:
-- ════════════════════════════════════════════════════════════════════════════
--
-- DO $$
-- DECLARE
--   tabla TEXT;
--   tablas TEXT[] := ARRAY[
--     'mensajes_consulta','enlaces_teleconsulta','auditoria'
--   ];
-- BEGIN
--   FOREACH tabla IN ARRAY tablas LOOP
--     IF to_regclass('public.' || tabla) IS NULL THEN CONTINUE; END IF;
--     EXECUTE format('DROP POLICY IF EXISTS "staff_autenticado_acceso_total" ON %I;', tabla);
--     EXECUTE format('ALTER TABLE %I DISABLE ROW LEVEL SECURITY;', tabla);
--   END LOOP;
-- END $$;
