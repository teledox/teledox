-- ============================================================
-- SEED DEMO — datos de presentación para ventas MediLyft
-- Ejecutar en Supabase → SQL Editor
-- Para eliminar todo: ejecutar cleanup_demo.sql
-- Marcador: clientes_b2b.codigo_acceso IN ('DEMO_PACIFICO','DEMO_VITAMED')
--           pacientes B2C demo: cedula LIKE '9990%'
-- ============================================================

-- ── 1. EMPRESAS B2B DEMO ─────────────────────────────────────────────────

INSERT INTO clientes_b2b (codigo_acceso, nombre_empresa, nombre_seguro, activo)
VALUES
  ('DEMO_PACIFICO', 'Corporación Seguros del Pacífico', 'Seguro Salud Premium', true),
  ('DEMO_VITAMED',  'VitaMed Salud Empresarial',        'Plan VitaMed Corporativo', true)
ON CONFLICT (codigo_acceso) DO UPDATE SET activo = true;

-- ── 2. PACIENTES B2B — Empresa Pacífico (18 pacientes) ───────────────────

INSERT INTO pacientes (cedula, nombre, apellidos, edad, sexo, correo, telefono, lugar_residencia, fecha_nacimiento, cliente_b2b_id)
SELECT cedula, nombre, apellidos, edad, sexo::VARCHAR(1), correo, telefono, lugar_residencia, fecha_nacimiento::DATE, c.id
FROM clientes_b2b c, (VALUES
  ('1700100001','Andrés','Morales Vega',      42,'M','amorales@gmail.com',  '0991234001','Quito Norte',       '1982-03-15'),
  ('1700100002','María José','Andrade Torres',35,'F','mjandrade@gmail.com', '0991234002','Quito Sur',         '1989-07-22'),
  ('1700100003','Carlos','Espinoza Ramos',    58,'M','cespinoza@gmail.com', '0991234003','Cumbayá',           '1965-11-08'),
  ('1700100004','Lucía','Benítez Salazar',    29,'F','lbenitez@gmail.com',  '0991234004','Quito Centro',      '1994-05-30'),
  ('1700100005','Roberto','Cárdenas Mora',    67,'M','rcardenas@gmail.com', '0991234005','Los Chillos',       '1956-09-12'),
  ('1700100006','Patricia','Flores Herrera',  44,'F','pflores@gmail.com',   '0991234006','Sangolquí',         '1979-12-03'),
  ('1700100007','Diego','Suárez Peña',        31,'M','dsuarez@gmail.com',   '0991234007','Quito Norte',       '1992-08-18'),
  ('1700100008','Valeria','Ortega Castillo',  38,'F','vortega@gmail.com',   '0991234008','Nayón',             '1985-02-27'),
  ('1700100009','Javier','Romero Aguirre',    52,'M','jromero@gmail.com',   '0991234009','Tumbaco',           '1971-06-14'),
  ('1700100010','Ana Lucía','Muñoz Paredes',  46,'F','amunoz@gmail.com',    '0991234010','Quito Sur',         '1977-10-05')
) AS v(cedula,nombre,apellidos,edad,sexo,correo,telefono,lugar_residencia,fecha_nacimiento)
WHERE c.codigo_acceso = 'DEMO_PACIFICO'
ON CONFLICT (cedula) DO NOTHING;

INSERT INTO pacientes (cedula, nombre, apellidos, edad, sexo, correo, telefono, lugar_residencia, fecha_nacimiento, cliente_b2b_id)
SELECT cedula, nombre, apellidos, edad, sexo::VARCHAR(1), correo, telefono, lugar_residencia, fecha_nacimiento::DATE, c.id
FROM clientes_b2b c, (VALUES
  ('1700100011','Fernando','Villacís Naranjo', 60,'M','fvillacis@gmail.com', '0991234011','El Quinche',      '1963-04-20'),
  ('1700100012','Gabriela','Ponce Andrade',    27,'F','gponce@gmail.com',    '0991234012','Quito Centro',    '1996-11-15'),
  ('1700100013','Miguel','Alarcón Soto',       49,'M','malarcon@gmail.com',  '0991234013','Carapungo',       '1974-07-08'),
  ('1700100014','Sofía','Vásquez Ríos',        33,'F','svasquez@gmail.com',  '0991234014','Conocoto',        '1990-03-22'),
  ('1700100015','Hernán','Delgado Pozo',       71,'M','hdelgado@gmail.com',  '0991234015','Quito Norte',     '1952-08-30'),
  ('1700100016','Carmen','Velasteguí Mora',    55,'F','cvelastegui@gmail.com','0991234016','Sangolquí',      '1968-01-17'),
  ('1700100017','Sebastián','Narváez Cadena',  24,'M','snarvaez@gmail.com',  '0991234017','Quito Norte',     '2000-09-04'),
  ('1700100018','Isabel','Calderón Noboa',     41,'F','icalceron@gmail.com', '0991234018','Tumbaco',         '1982-12-11')
) AS v(cedula,nombre,apellidos,edad,sexo,correo,telefono,lugar_residencia,fecha_nacimiento)
WHERE c.codigo_acceso = 'DEMO_PACIFICO'
ON CONFLICT (cedula) DO NOTHING;

-- ── 3. PACIENTES B2B — Empresa VitaMed (7 pacientes) ────────────────────

INSERT INTO pacientes (cedula, nombre, apellidos, edad, sexo, correo, telefono, lugar_residencia, fecha_nacimiento, cliente_b2b_id)
SELECT cedula, nombre, apellidos, edad, sexo::VARCHAR(1), correo, telefono, lugar_residencia, fecha_nacimiento::DATE, c.id
FROM clientes_b2b c, (VALUES
  ('1700200001','Eduardo','Montoya Lara',     36,'M','emontoya@gmail.com',  '0992345001','Guayaquil Norte',  '1987-05-10'),
  ('1700200002','Fernanda','Cevallos Abad',   43,'F','fcevallos@gmail.com', '0992345002','Guayaquil Sur',    '1980-08-25'),
  ('1700200003','Rodrigo','Holguín Torres',   61,'M','rholguín@gmail.com',  '0992345003','Samborondón',      '1962-02-14'),
  ('1700200004','Mónica','Tapia Zambrano',    28,'F','mtapia@gmail.com',    '0992345004','Guayaquil Centro', '1995-10-03'),
  ('1700200005','Gonzalo','Bravo Solano',     54,'M','gbravo@gmail.com',    '0992345005','Daule',            '1969-07-21'),
  ('1700200006','Natalia','Intriago Vélez',   39,'F','nintriago@gmail.com', '0992345006','Guayaquil Norte',  '1984-11-08'),
  ('1700200007','Pablo','Rivadeneira Costa',  47,'M','privadeneira@gmail.com','0992345007','Samborondón',    '1976-04-17')
) AS v(cedula,nombre,apellidos,edad,sexo,correo,telefono,lugar_residencia,fecha_nacimiento)
WHERE c.codigo_acceso = 'DEMO_VITAMED'
ON CONFLICT (cedula) DO NOTHING;

-- ── 4. PACIENTES B2C (5 pacientes sin empresa) ──────────────────────────

INSERT INTO pacientes (cedula, nombre, apellidos, edad, sexo, correo, telefono, lugar_residencia, fecha_nacimiento)
VALUES
  ('9990000001','Tomás',   'Herrera Ayala',    34,'M','therrera@gmail.com',   '0998001001','Cuenca',           '1989-06-12'),
  ('9990000002','Daniela', 'Mejía Castillo',   26,'F','dmejia@gmail.com',     '0998001002','Ambato',           '1997-03-05'),
  ('9990000003','Arturo',  'Cordero Lozano',   63,'M','acordero@gmail.com',   '0998001003','Cuenca',           '1960-09-18'),
  ('9990000004','Mariana', 'Salinas Bermeo',   51,'F','msalinas@gmail.com',   '0998001004','Riobamba',         '1972-12-28'),
  ('9990000005','Jorge',   'Aguirre Pazmiño',  45,'M','jaguirre@gmail.com',   '0998001005','Quito Sur',        '1978-07-03')
ON CONFLICT (cedula) DO NOTHING;

-- ── 5. ANTECEDENTES MÉDICOS ──────────────────────────────────────────────

INSERT INTO antecedentes (paciente_id, alergias, hipertension, diabetes, cirugias, otros)
SELECT p.id,
  CASE v.cedula
    WHEN '1700100001' THEN 'Penicilina'
    WHEN '1700100003' THEN 'Ibuprofeno, Aspirina'
    WHEN '1700100006' THEN 'Ninguna conocida'
    WHEN '1700100009' THEN 'Sulfamidas'
    WHEN '1700100015' THEN 'Amoxicilina'
    WHEN '9990000003' THEN 'Polen, ácaros'
    WHEN '9990000004' THEN 'Mariscos'
    ELSE NULL
  END,
  CASE v.cedula
    WHEN '1700100003' THEN 'Hipertensión arterial controlada con Losartán 50mg/día'
    WHEN '1700100005' THEN 'HTA estadio II, en tratamiento con Enalapril 10mg'
    WHEN '1700100015' THEN 'Hipertensión crónica desde hace 12 años'
    WHEN '1700100016' THEN 'HTA leve, monitoreo mensual'
    WHEN '9990000003' THEN 'Hipertensión arterial'
    ELSE NULL
  END,
  CASE v.cedula
    WHEN '1700100003' THEN 'Diabetes tipo 2 — Metformina 850mg c/12h'
    WHEN '1700100005' THEN 'Diabetes tipo 2 desde 2015, con insulina basal'
    WHEN '1700100015' THEN 'Diabetes tipo 2 descontrolada'
    WHEN '9990000004' THEN 'Diabetes tipo 1 desde los 22 años'
    ELSE NULL
  END,
  CASE v.cedula
    WHEN '1700100001' THEN 'Apendicectomía (2010)'
    WHEN '1700100006' THEN 'Colecistectomía laparoscópica (2018)'
    WHEN '1700100009' THEN 'Hernia inguinal (2016), Rodilla derecha (2020)'
    WHEN '1700100015' THEN 'Bypass coronario (2019), Cataratas OI (2021)'
    WHEN '9990000003' THEN 'Próstata (2017)'
    ELSE NULL
  END,
  CASE v.cedula
    WHEN '1700100003' THEN 'Hipotiroidismo — Levotiroxina 75mcg/día'
    WHEN '1700100005' THEN 'EPOC estadio II, usa broncodilatador'
    WHEN '1700100015' THEN 'Insuficiencia renal leve, control nefrológico'
    WHEN '1700200003' THEN 'Artritis reumatoide — metotrexato semanal'
    WHEN '9990000004' THEN 'Hipotiroidismo, Depresión controlada'
    ELSE NULL
  END
FROM pacientes p
JOIN (VALUES
  ('1700100001'),('1700100003'),('1700100005'),('1700100006'),('1700100009'),
  ('1700100015'),('1700100016'),('1700200003'),('9990000003'),('9990000004')
) AS v(cedula) ON p.cedula = v.cedula
ON CONFLICT (paciente_id) DO NOTHING;

-- ── 6. ENFERMEDADES CRÓNICAS ─────────────────────────────────────────────

INSERT INTO enfermedades_cronicas (paciente_id, enfermedad, activo)
SELECT p.id, v.enfermedad, true
FROM pacientes p
JOIN (VALUES
  ('1700100003','hipertension'),
  ('1700100003','diabetes'),
  ('1700100005','hipertension'),
  ('1700100005','diabetes'),
  ('1700100015','hipertension'),
  ('1700100016','hipertension'),
  ('1700200003','artritis'),
  ('9990000003','hipertension'),
  ('9990000004','diabetes')
) AS v(cedula, enfermedad) ON p.cedula = v.cedula
WHERE NOT EXISTS (
  SELECT 1 FROM enfermedades_cronicas ec WHERE ec.paciente_id = p.id AND ec.enfermedad = v.enfermedad
);

-- ── 7. CONSULTAS ─────────────────────────────────────────────────────────
-- Usamos DO $$ para poder capturar IDs de pacientes y médicos

DO $$
DECLARE
  v_medico_id   UUID;
  v_pac         RECORD;
  v_cons_id     UUID;
BEGIN
  -- Tomar el primer médico/admin activo existente (si hay)
  SELECT id INTO v_medico_id FROM usuarios WHERE rol IN ('medico','admin') AND activo = true ORDER BY created_at LIMIT 1;

  -- === CONSULTAS COMPLETADAS (historial) ===

  FOR v_pac IN
    SELECT p.id, p.cedula FROM pacientes p
    WHERE p.cedula IN ('1700100001','1700100002','1700100003','1700100004','1700100006',
                       '1700100007','1700100008','1700100009','1700100010','1700100011',
                       '1700200001','1700200002','1700200003','9990000001','9990000002')
  LOOP
    -- Consulta completada 1 (hace ~3 semanas)
    INSERT INTO consultas (paciente_id, medico_id, estado, nivel_sintomas, sintomas_descripcion, diagnostico, created_at, atendido_at)
    SELECT v_pac.id, v_medico_id, 'completada',
      CASE v_pac.cedula
        WHEN '1700100003' THEN 3 WHEN '1700100009' THEN 2 WHEN '9990000001' THEN 2
        ELSE 1
      END,
      CASE v_pac.cedula
        WHEN '1700100001' THEN 'Dolor de cabeza persistente, náuseas y mareo desde hace 3 días'
        WHEN '1700100002' THEN 'Tos seca, fiebre de 38.5°C, malestar general'
        WHEN '1700100003' THEN 'Dolor torácico, dificultad para respirar, presión alta 160/100'
        WHEN '1700100004' THEN 'Infección urinaria, ardor al orinar, fiebre leve'
        WHEN '1700100006' THEN 'Dolor abdominal en epigastrio, náuseas post-ingesta'
        WHEN '1700100007' THEN 'Rinitis alérgica, estornudos frecuentes, ojos rojos'
        WHEN '1700100008' THEN 'Lumbalgia aguda, dolor irradiado a pierna izquierda'
        WHEN '1700100009' THEN 'Crisis hipertensiva, presión 175/110, cefalea intensa'
        WHEN '1700100010' THEN 'Ansiedad, insomnio, palpitaciones ocasionales'
        WHEN '1700100011' THEN 'Control de rutina, revisión de medicamentos crónicos'
        WHEN '1700200001' THEN 'Faringitis, dolor de garganta, temperatura 37.8°C'
        WHEN '1700200002' THEN 'Dermatitis, erupción en antebrazo, prurito intenso'
        WHEN '1700200003' THEN 'Articulaciones inflamadas, dolor en manos y rodillas'
        WHEN '9990000001' THEN 'Gastroenteritis, vómitos y diarrea desde ayer'
        WHEN '9990000002' THEN 'Cefalea tensional recurrente, 3 episodios esta semana'
        ELSE 'Malestar general, consulta de seguimiento'
      END,
      CASE v_pac.cedula
        WHEN '1700100001' THEN 'Cefalea tensional — Ibuprofeno 400mg c/8h por 5 días'
        WHEN '1700100002' THEN 'Infección respiratoria viral — reposo, hidratación, paracetamol'
        WHEN '1700100003' THEN 'Crisis hipertensiva — ajuste de dosis Losartán + derivación cardiología'
        WHEN '1700100004' THEN 'Infección urinaria — Ciprofloxacino 500mg c/12h por 7 días'
        WHEN '1700100006' THEN 'Gastritis — Omeprazol 20mg, dieta blanda'
        WHEN '1700100007' THEN 'Rinitis alérgica — Loratadina 10mg/día, evitar alérgenos'
        WHEN '1700100008' THEN 'Lumbalgia mecánica — fisioterapia, Naproxeno 500mg'
        WHEN '1700100009' THEN 'Hipertensión mal controlada — ajuste de tratamiento'
        WHEN '1700100010' THEN 'Trastorno de ansiedad — derivación psicología'
        WHEN '1700100011' THEN 'Control crónico estable — continuar tratamiento'
        WHEN '1700200001' THEN 'Faringitis bacteriana — Amoxicilina 500mg c/8h por 7 días'
        WHEN '1700200002' THEN 'Dermatitis de contacto — Hidrocortisona 1% tópica'
        WHEN '1700200003' THEN 'Brote de artritis reumatoide — ajuste metotrexato'
        WHEN '9990000001' THEN 'Gastroenteritis aguda — rehidratación oral, reposo 48h'
        WHEN '9990000002' THEN 'Cefalea tensional crónica — amitriptilina preventiva'
        ELSE 'Consulta resuelta favorablemente'
      END,
      NOW() - INTERVAL '21 days' + (random() * INTERVAL '5 days'),
      NOW() - INTERVAL '21 days' + (random() * INTERVAL '5 days') + INTERVAL '45 minutes'
    RETURNING id INTO v_cons_id;
  END LOOP;

  -- === CONSULTAS COMPLETADAS RECIENTES (última semana) ===

  FOR v_pac IN
    SELECT p.id, p.cedula FROM pacientes p
    WHERE p.cedula IN ('1700100012','1700100013','1700100014','1700200004','1700200005','9990000003')
  LOOP
    INSERT INTO consultas (paciente_id, medico_id, estado, nivel_sintomas, sintomas_descripcion, diagnostico, created_at, atendido_at)
    VALUES (
      v_pac.id, v_medico_id, 'completada',
      CASE v_pac.cedula WHEN '9990000003' THEN 3 WHEN '1700100013' THEN 2 ELSE 1 END,
      CASE v_pac.cedula
        WHEN '1700100012' THEN 'Control prenatal 20 semanas, revisión de resultados'
        WHEN '1700100013' THEN 'Dolor en pecho izquierdo, disnea leve con esfuerzo'
        WHEN '1700100014' THEN 'Migraña con aura, vómito, sensibilidad a la luz'
        WHEN '1700200004' THEN 'Conjuntivitis, ojos rojos y legañas desde ayer'
        WHEN '1700200005' THEN 'Gota aguda, inflamación en dedo gordo del pie'
        WHEN '9990000003' THEN 'Hipertensión no controlada, PA 185/115, mareos'
        ELSE 'Consulta de seguimiento'
      END,
      CASE v_pac.cedula
        WHEN '1700100012' THEN 'Embarazo normal — suplemento hierro y ácido fólico'
        WHEN '1700100013' THEN 'Cardiopatía isquémica probable — ECG + ecocardiograma urgente'
        WHEN '1700100014' THEN 'Migraña clásica — Sumatriptán 50mg en crisis, Topiramato preventivo'
        WHEN '1700200004' THEN 'Conjuntivitis bacteriana — Tobramicina colirio 3v/día'
        WHEN '1700200005' THEN 'Gota aguda — Colchicina 0.5mg c/6h, reposo, hielo'
        WHEN '9990000003' THEN 'Crisis HTA — ajuste urgente, Amlodipino 10mg + control en 48h'
        ELSE 'Control resuelto'
      END,
      NOW() - INTERVAL '5 days' + (random() * INTERVAL '4 days'),
      NOW() - INTERVAL '5 days' + (random() * INTERVAL '4 days') + INTERVAL '30 minutes'
    );
  END LOOP;

  -- === CONSULTAS PENDIENTES (sin médico asignado — aparecen en Alertas) ===

  FOR v_pac IN
    SELECT p.id, p.cedula FROM pacientes p
    WHERE p.cedula IN ('1700100005','1700100016','1700100017','1700200006','1700200007','9990000004','9990000005')
  LOOP
    INSERT INTO consultas (paciente_id, medico_id, estado, nivel_sintomas, sintomas_descripcion, created_at)
    VALUES (
      v_pac.id, NULL, 'pendiente',
      CASE v_pac.cedula
        WHEN '1700100005' THEN 3
        WHEN '1700100016' THEN 2
        WHEN '9990000004' THEN 3
        WHEN '9990000005' THEN 2
        ELSE 1
      END,
      CASE v_pac.cedula
        WHEN '1700100005' THEN 'Dificultad severa para respirar, tos con sangre, fiebre alta 39.5°C'
        WHEN '1700100016' THEN 'Presión arterial elevada 150/95, dolor de cabeza fuerte, visión borrosa'
        WHEN '1700100017' THEN 'Dolor abdominal leve, náuseas sin vómito, posible intoxicación'
        WHEN '1700200006' THEN 'Sangrado menstrual abundante, dolor pélvico intenso'
        WHEN '1700200007' THEN 'Dolor en rodilla, inflamación, dificultad para caminar'
        WHEN '9990000004' THEN 'Hipoglicemia severa, glucosa 45 mg/dL, mareos y confusión leve'
        WHEN '9990000005' THEN 'Taquicardia en reposo, más de 110 lpm, ansiedad'
        ELSE 'Consulta pendiente de revisión'
      END,
      NOW() - (random() * INTERVAL '3 hours')
    );
  END LOOP;

  -- === CONSULTAS EN ATENCIÓN ===

  FOR v_pac IN
    SELECT p.id FROM pacientes p
    WHERE p.cedula IN ('1700100018','1700200007')
  LOOP
    INSERT INTO consultas (paciente_id, medico_id, estado, nivel_sintomas, sintomas_descripcion, created_at, atendido_at)
    VALUES (
      v_pac.id, v_medico_id, 'en_atencion', 2,
      'Dolor lumbar agudo, irradiado a miembro inferior, inicio hace 2 horas',
      NOW() - INTERVAL '1 hour',
      NOW() - INTERVAL '20 minutes'
    );
  END LOOP;

END $$;

-- ── 8. NOTIFICACIONES ────────────────────────────────────────────────────

INSERT INTO notificaciones (tipo, titulo, mensaje, leida, origen, categoria, etiqueta, paciente_id, consulta_id, created_at)
SELECT
  'urgente',
  'Nueva consulta grave — ' || p.nombre || ' ' || p.apellidos,
  'Paciente con nivel de síntomas grave requiere atención inmediata',
  false, 'b2b', 'grave', 'AFILIADO',
  p.id, c.id,
  c.created_at
FROM pacientes p
JOIN consultas c ON c.paciente_id = p.id
WHERE p.cedula IN ('1700100005','9990000004') AND c.estado = 'pendiente';

INSERT INTO notificaciones (tipo, titulo, mensaje, leida, origen, categoria, etiqueta, paciente_id, consulta_id, created_at)
SELECT
  'nueva_consulta',
  'Nueva consulta — ' || p.nombre || ' ' || p.apellidos,
  'Paciente B2B solicita atención médica',
  false, 'b2b', 'medio', 'EMPLEADO CON CÓDIGO',
  p.id, c.id,
  c.created_at
FROM pacientes p
JOIN consultas c ON c.paciente_id = p.id
WHERE p.cedula IN ('1700100016','1700200006') AND c.estado = 'pendiente';

INSERT INTO notificaciones (tipo, titulo, mensaje, leida, origen, categoria, etiqueta, paciente_id, consulta_id, created_at)
SELECT
  'nueva_consulta',
  'Nueva consulta B2C — ' || p.nombre || ' ' || p.apellidos,
  'Paciente particular solicita atención',
  false, 'b2c', 'leve', 'PAGO',
  p.id, c.id,
  c.created_at
FROM pacientes p
JOIN consultas c ON c.paciente_id = p.id
WHERE p.cedula IN ('9990000005') AND c.estado = 'pendiente';

-- Notificaciones de seguimiento (para que aparezca la columna de seguimiento en Alertas)
INSERT INTO notificaciones (tipo, titulo, mensaje, leida, origen, categoria, etiqueta, paciente_id, created_at)
SELECT
  'seguimiento',
  'Alerta de seguimiento — ' || p.nombre || ' ' || p.apellidos,
  v.mensaje,
  false, 'seguimiento', v.categoria, 'SEGUIMIENTO',
  p.id, NOW() - (random() * INTERVAL '2 hours')
FROM pacientes p
JOIN (VALUES
  ('1700100003','Mi presión ha subido a 165/105, me siento mal', 'grave'),
  ('1700100009','El dolor de espalda persiste, no ha mejorado con el tratamiento', 'medio'),
  ('1700100016','Me siento mejor, pero aún con dolor de cabeza leve', 'leve')
) AS v(cedula, mensaje, categoria) ON p.cedula = v.cedula;

-- Notificaciones antiguas (ya leídas — historial)
INSERT INTO notificaciones (tipo, titulo, mensaje, leida, created_at)
SELECT 'nueva_consulta', 'Consulta atendida exitosamente', 'Se completó la atención del paciente', true,
  NOW() - INTERVAL '10 days'
WHERE NOT EXISTS (SELECT 1 FROM notificaciones WHERE leida = true LIMIT 1);

-- ── 9. RECORDATORIOS / SEGUIMIENTO ───────────────────────────────────────

INSERT INTO recordatorios (paciente_id, telefono, tipo, medicamento, dosis, frecuencia_horas, activo, fecha_proximo, fecha_fin, created_at)
SELECT
  p.id,
  'whatsapp:+593' || substring(p.telefono, 2),  -- 0991234003 → whatsapp:+593991234003
  v.tipo,
  COALESCE(v.medicamento, ''),
  COALESCE(v.dosis, ''),
  v.frecuencia_horas,
  true,
  NOW() + (v.frecuencia_horas * INTERVAL '1 hour'),
  NOW() + INTERVAL '30 days',
  NOW() - (random() * INTERVAL '10 days')
FROM pacientes p
JOIN (VALUES
  ('1700100003','medicamento', 12, 'Losartán',    '50mg c/12h'),
  ('1700100003','bienestar',   24,  NULL,          NULL),
  ('1700100005','medicamento',  8,  'Enalapril',   '10mg c/8h'),
  ('1700100005','bienestar',   24,  NULL,          NULL),
  ('1700100009','bienestar',   48,  NULL,          NULL),
  ('1700100015','medicamento', 24,  'Metformina',  '850mg c/24h'),
  ('1700100015','bienestar',   24,  NULL,          NULL),
  ('9990000004','medicamento',  6,  'Insulina',    'según indicación'),
  ('9990000004','bienestar',   24,  NULL,          NULL)
) AS v(cedula, tipo, frecuencia_horas, medicamento, dosis) ON p.cedula = v.cedula;

-- ── 10. SEGUIMIENTO_RESPUESTAS (historial de bienestar) ──────────────────

INSERT INTO seguimiento_respuestas (paciente_id, tipo, respuesta, se_siente_mejor, created_at)
SELECT p.id, 'bienestar', v.respuesta, v.mejor, NOW() - (v.dias * INTERVAL '1 day')
FROM pacientes p
JOIN (VALUES
  ('1700100001','Me siento mucho mejor, el dolor cedió',        true,  3),
  ('1700100001','Sin síntomas, gracias',                         true,  1),
  ('1700100003','Sigo con presión alta, tomé el medicamento',    false, 5),
  ('1700100003','Hoy mejor, PA 140/90',                         true,  2),
  ('1700100009','El dolor de espalda mejorando poco a poco',     true,  4),
  ('1700100015','Me siento estable, glucosa en 120',            true,  3),
  ('1700100016','Bien, sin cefalea hoy',                        true,  1),
  ('9990000004','Glucosa muy baja esta mañana, 58 mg/dL',       false, 2)
) AS v(cedula, respuesta, mejor, dias) ON p.cedula = v.cedula;

-- ── FIN DEL SEED ─────────────────────────────────────────────────────────
-- Total aprox: 30 pacientes, 2 empresas B2B, ~30 consultas, notificaciones,
-- recordatorios y respuestas de seguimiento.
-- Para eliminar todo: ejecutar scripts/demo/cleanup_demo.sql
