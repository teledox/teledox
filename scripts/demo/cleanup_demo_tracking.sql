-- ============================================================
-- CLEANUP DEMO TRACKING — elimina todos los datos de seed_demo_tracking.sql
-- Ejecutar en Supabase → SQL Editor
-- ============================================================

DO $$
DECLARE
  demo_emp_ids UUID[];
  demo_caso_ids UUID[];
BEGIN
  SELECT ARRAY(SELECT id FROM tracking_empresas WHERE nombre LIKE 'DEMO_%')
    INTO demo_emp_ids;

  SELECT ARRAY(SELECT id FROM tracking_casos WHERE empresa_id = ANY(demo_emp_ids))
    INTO demo_caso_ids;

  DELETE FROM tracking_psicosocial  WHERE empresa_id = ANY(demo_emp_ids);
  DELETE FROM tracking_biometricos  WHERE caso_id    = ANY(demo_caso_ids);
  DELETE FROM tracking_registros    WHERE caso_id    = ANY(demo_caso_ids);
  DELETE FROM tracking_casos        WHERE id         = ANY(demo_caso_ids);
  DELETE FROM tracking_empresas     WHERE id         = ANY(demo_emp_ids);

  RAISE NOTICE '✅ Cleanup tracking completado — % empresas, % casos eliminados',
    array_length(demo_emp_ids,1), array_length(demo_caso_ids,1);
END $$;
