-- ============================================================
-- CLEANUP DEMO — elimina TODOS los datos insertados por seed_demo.sql
-- Ejecutar en Supabase → SQL Editor
-- ============================================================

-- Cédulas demo B2B y B2C para identificar pacientes a borrar
-- B2B Pacífico: 1700100001 – 1700100018
-- B2B VitaMed:  1700200001 – 1700200007
-- B2C demo:     9990000001 – 9990000005

DO $$
DECLARE
  demo_cedulas TEXT[] := ARRAY[
    '1700100001','1700100002','1700100003','1700100004','1700100005',
    '1700100006','1700100007','1700100008','1700100009','1700100010',
    '1700100011','1700100012','1700100013','1700100014','1700100015',
    '1700100016','1700100017','1700100018',
    '1700200001','1700200002','1700200003','1700200004','1700200005',
    '1700200006','1700200007',
    '9990000001','9990000002','9990000003','9990000004','9990000005'
  ];
  demo_pac_ids UUID[];
  demo_cons_ids UUID[];
BEGIN
  -- Obtener IDs de pacientes demo
  SELECT ARRAY(SELECT id FROM pacientes WHERE cedula = ANY(demo_cedulas))
    INTO demo_pac_ids;

  -- Obtener IDs de consultas demo
  SELECT ARRAY(SELECT id FROM consultas WHERE paciente_id = ANY(demo_pac_ids))
    INTO demo_cons_ids;

  -- Tablas que referencian consultas
  DELETE FROM documentos_datos           WHERE consulta_id = ANY(demo_cons_ids);
  DELETE FROM documentos                 WHERE consulta_id = ANY(demo_cons_ids);
  DELETE FROM verificaciones_comprobante WHERE consulta_id = ANY(demo_cons_ids);
  DELETE FROM notificaciones             WHERE consulta_id = ANY(demo_cons_ids);

  -- Tablas opcionales (pueden no existir) — usar EXECUTE para evitar error de parseo
  IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_name = 'mensajes_consulta') THEN
    EXECUTE 'DELETE FROM mensajes_consulta WHERE consulta_id = ANY($1)' USING demo_cons_ids;
  END IF;

  -- Tablas que referencian pacientes
  DELETE FROM seguimiento_respuestas     WHERE paciente_id = ANY(demo_pac_ids);
  DELETE FROM recordatorios              WHERE paciente_id = ANY(demo_pac_ids);
  DELETE FROM notificaciones             WHERE paciente_id = ANY(demo_pac_ids);
  DELETE FROM registros_cronicos
    WHERE enfermedad_id IN (SELECT id FROM enfermedades_cronicas WHERE paciente_id = ANY(demo_pac_ids));
  DELETE FROM enfermedades_cronicas      WHERE paciente_id = ANY(demo_pac_ids);
  DELETE FROM antecedentes               WHERE paciente_id = ANY(demo_pac_ids);
  DELETE FROM verificaciones_comprobante WHERE paciente_id = ANY(demo_pac_ids);

  IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_name = 'seguimiento_laboratorio') THEN
    EXECUTE '
      DELETE FROM seguimiento_laboratorio_respuestas
      WHERE seguimiento_id IN (SELECT id FROM seguimiento_laboratorio WHERE paciente_id = ANY($1))
    ' USING demo_pac_ids;
    EXECUTE 'DELETE FROM seguimiento_laboratorio WHERE paciente_id = ANY($1)' USING demo_pac_ids;
  END IF;
  IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_name = 'planillaje_b2b') THEN
    EXECUTE 'DELETE FROM planillaje_b2b WHERE paciente_id = ANY($1)' USING demo_pac_ids;
  END IF;

  -- Consultas
  DELETE FROM consultas WHERE id = ANY(demo_cons_ids);

  -- Empleados B2B (before pacientes due to FK)
  DELETE FROM empleados_b2b
    WHERE empresa_id IN (SELECT id FROM clientes_b2b WHERE codigo_acceso IN ('DEMO_PACIFICO','DEMO_VITAMED'));

  -- Pacientes
  DELETE FROM pacientes WHERE cedula = ANY(demo_cedulas);

  -- Empresas demo (cascade elimina empleados_b2b restantes)
  DELETE FROM clientes_b2b WHERE codigo_acceso IN ('DEMO_PACIFICO', 'DEMO_VITAMED');

  RAISE NOTICE '✅ Cleanup demo completado — % pacientes eliminados', array_length(demo_pac_ids,1);
END $$;
