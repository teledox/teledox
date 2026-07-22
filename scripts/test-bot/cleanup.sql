-- ============================================================
-- CLEANUP — elimina datos de prueba de npm run test:bot:run
-- Ejecutar en Supabase → SQL Editor (o corre automáticamente el runner)
-- ============================================================

-- registros_cronicos referencia enfermedades_cronicas → borrar primero
DELETE FROM registros_cronicos
WHERE enfermedad_id IN (
  SELECT ec.id FROM enfermedades_cronicas ec
  JOIN pacientes p ON p.id = ec.paciente_id
  WHERE p.cedula IN ('1701234567','1705550000','1700000001','1709999997')
);

DELETE FROM planillaje_b2b
WHERE paciente_id IN (SELECT id FROM pacientes WHERE cedula IN ('1701234567','1705550000','1700000001','1709999997'));

DELETE FROM documentos_datos
WHERE paciente_id IN (SELECT id FROM pacientes WHERE cedula IN ('1701234567','1705550000','1700000001','1709999997'));

DELETE FROM documentos
WHERE paciente_id IN (SELECT id FROM pacientes WHERE cedula IN ('1701234567','1705550000','1700000001','1709999997'));

DELETE FROM verificaciones_comprobante
WHERE paciente_id IN (SELECT id FROM pacientes WHERE cedula IN ('1701234567','1705550000','1700000001','1709999997'));

DELETE FROM antecedentes
WHERE paciente_id IN (SELECT id FROM pacientes WHERE cedula IN ('1701234567','1705550000','1700000001','1709999997'));

DELETE FROM consultas
WHERE paciente_id IN (SELECT id FROM pacientes WHERE cedula IN ('1701234567','1705550000','1700000001','1709999997'));

DELETE FROM enfermedades_cronicas
WHERE paciente_id IN (SELECT id FROM pacientes WHERE cedula IN ('1701234567','1705550000','1700000001','1709999997'));

-- pacientes antes de clientes_b2b (FK constraint)
DELETE FROM pacientes WHERE cedula IN ('1701234567','1705550000','1700000001','1709999997');

DELETE FROM empleados_b2b WHERE cedula = '1701234567';

-- cascade elimina empleados_b2b restantes
DELETE FROM clientes_b2b WHERE codigo_acceso = 'QATEST01';

-- sesiones del runner (101–120)
DELETE FROM sesiones_bot WHERE telefono IN (
  '593990000101','593990000102','593990000103','593990000104',
  '593990000105','593990000106','593990000107','593990000108',
  '593990000109','593990000110','593990000111','593990000112',
  '593990000113','593990000114','593990000115','593990000116',
  '593990000117','593990000118','593990000119','593990000120'
);
