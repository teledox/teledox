-- ============================================================
-- SEED — datos de prueba para npm run test:bot:run
-- Ejecutar en Supabase → SQL Editor antes de cada sesión de tests
-- ============================================================

-- 1. Empresa TEST QA (escenarios 1, 3, 6)
INSERT INTO clientes_b2b (codigo_acceso, nombre_empresa, nombre_seguro, activo)
VALUES ('QATEST01', 'TEST QA', 'Seguro Test', true)
ON CONFLICT (codigo_acceso) DO UPDATE SET activo = true;

-- 2. Empleado B2B de prueba (escenario 1)
INSERT INTO empleados_b2b (cedula, empresa_id)
SELECT '1701234567', id FROM clientes_b2b WHERE codigo_acceso = 'QATEST01'
ON CONFLICT (empresa_id, cedula) DO NOTHING;

-- 3. Paciente B2B con datos completos (escenarios 1, 6)
--    Necesita todos los campos para que paso 39 muestre "usar mis datos"
INSERT INTO pacientes (cedula, nombre, apellidos, edad, sexo, correo, telefono, lugar_residencia, cliente_b2b_id)
SELECT
  '1701234567', 'Test', 'QA Automation', 30, 'M',
  'test@medilyft.com', '0900000001', 'Quito Norte',
  id
FROM clientes_b2b WHERE codigo_acceso = 'QATEST01'
ON CONFLICT (cedula) DO UPDATE SET
  nombre           = 'Test',
  apellidos        = 'QA Automation',
  edad             = 30,
  correo           = 'test@medilyft.com',
  telefono         = '0900000001',
  lugar_residencia = 'Quito Norte';

-- 4. Paciente para crónicas (escenarios 4, 5)
INSERT INTO pacientes (cedula, nombre, apellidos, edad, sexo, correo, telefono, lugar_residencia)
VALUES ('1705550000', 'Test', 'Crónicas QA', 55, 'M', 'cronicas@medilyft.com', '0900000002', 'Guayaquil')
ON CONFLICT (cedula) DO NOTHING;

-- 5. Enfermedad crónica — hipertensión (escenarios 4, 5)
INSERT INTO enfermedades_cronicas (paciente_id, enfermedad, activo)
SELECT id, 'hipertension', true
FROM pacientes
WHERE cedula = '1705550000'
  AND NOT EXISTS (
    SELECT 1 FROM enfermedades_cronicas ec
    WHERE ec.paciente_id = pacientes.id AND ec.enfermedad = 'hipertension'
  );

-- 6. Paciente B2C registrado SIN empresa (escenario 19)
--    Verifica que pacientes particulares NO pueden saltarse el pago.
INSERT INTO pacientes (cedula, nombre, apellidos, edad, sexo, correo, telefono, lugar_residencia)
VALUES ('1709999997', 'Test', 'B2C Registrado', 25, 'M', 'b2ctest@medilyft.com', '0900000099', 'Quito Sur')
ON CONFLICT (cedula) DO NOTHING;
